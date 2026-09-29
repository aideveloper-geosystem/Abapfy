import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Archive,
  ArrowLeft,
  Bot,
  ChevronRight,
  Building2,
  ChevronsUpDown,
  FolderInput,
  FolderKanban,
  Gauge,
  ListChecks,
  LogOut,
  MoreHorizontal,
  Newspaper,
  Settings,
  Sparkles,
  SquarePen,
  Trash2
} from 'lucide-react'
import { useAuthStore } from '@renderer/store/authStore'
import { useChatStore, type ChatSummary, type ProjectSummary } from '@renderer/store/chatStore'
import { useChatRuntimeStore } from '@renderer/store/chatRuntimeStore'
import { presenceLabel, type WorkPresence } from '@renderer/lib/workPresence'
import { UsageModal } from '@renderer/components/UsageModal'
import './Sidebar.css'

type ShortcutId = 'new-session' | 'projects' | 'clients' | 'tasks' | 'skills' | 'agents' | 'news'

const SHORTCUTS: { id: ShortcutId; icon: typeof Sparkles; label: string }[] = [
  { id: 'new-session', icon: SquarePen, label: 'Nova Sessão' },
  { id: 'projects', icon: FolderKanban, label: 'Projetos' },
  { id: 'clients', icon: Building2, label: 'Clientes' },
  { id: 'news', icon: Newspaper, label: 'Notícias' },
  { id: 'tasks', icon: ListChecks, label: 'Tarefas' },
  { id: 'skills', icon: Sparkles, label: 'Skills' },
  { id: 'agents', icon: Bot, label: 'Agentes' }
]

export type SidebarView = 'chat' | 'skills' | 'agents' | 'projects' | 'clients' | 'tasks' | 'news'

interface SidebarProps {
  activeView: SidebarView
  activeChatId: string | null
  onNewSession: () => void
  onOpenSettings: () => void
  onOpenSkills: () => void
  onOpenAgents: () => void
  onOpenProjects: () => void
  onOpenClients: () => void
  onOpenTasks: () => void
  onOpenNews: () => void
  onSelectChat: (chatId: string) => void
  onChatRemoved?: (chatId: string) => void
  workPresence: WorkPresence[]
}

interface ChatRowProps {
  chat: ChatSummary
  active: boolean
  projects: ProjectSummary[]
  onSelect: () => void
  onDelete: () => Promise<boolean>
  onArchive: () => Promise<boolean>
  onMove: (projectId: string | null) => Promise<boolean>
}

/**
 * Indicador de status de chats rodando em segundo plano — só faz sentido para
 * chats que não são o atualmente aberto (o chat ativo já mostra seu próprio
 * streaming na área principal). Verde = resposta finalizada; amarelo = o agente
 * está esperando uma resposta do usuário (ex.: pergunta de esclarecimento);
 * pulsando = ainda gerando.
 */
function ChatStatusDot({ chatId }: { chatId: string }): JSX.Element | null {
  const runtime = useChatRuntimeStore((state) => state.runtimes[chatId])
  if (!runtime) return null

  if (runtime.streaming) {
    return <span className="chat-status-dot chat-status-dot-running" title="Gerando resposta…" />
  }
  if (runtime.status === 'needs_input') {
    return (
      <span className="chat-status-dot chat-status-dot-pending" title="Aguardando sua resposta" />
    )
  }
  if (runtime.status === 'done') {
    return <span className="chat-status-dot chat-status-dot-done" title="Finalizado" />
  }
  return null
}

function ChatRowMenu({ chat, projects, onDelete, onArchive, onMove }: ChatRowProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'main' | 'projects'>('main')
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(event: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false)
        setMode('main')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  function close(): void {
    setOpen(false)
    setMode('main')
  }

  async function handleDelete(): Promise<void> {
    if (!window.confirm('Excluir esta conversa? Essa ação não pode ser desfeita.')) return
    close()
    await onDelete()
  }

  async function handleArchive(): Promise<void> {
    close()
    await onArchive()
  }

  const otherProjects = projects.filter((project) => project.id !== chat.projectId && project.clientId === chat.clientId)

  return (
    <div className="chat-row-menu" ref={menuRef}>
      <button
        type="button"
        className="chat-row-menu-trigger"
        title="Mais opções"
        onClick={(event) => {
          event.stopPropagation()
          setOpen((value) => !value)
          setMode('main')
        }}
      >
        <MoreHorizontal size={14} strokeWidth={1.75} />
      </button>

      {open && (
        <div className="chat-row-menu-panel" onMouseDown={(event) => event.stopPropagation()}>
          {mode === 'main' ? (
            <>
              <button
                type="button"
                className="chat-row-menu-item"
                onClick={() => setMode('projects')}
              >
                <FolderInput size={14} strokeWidth={1.75} />
                Adicionar a projeto
              </button>
              <button type="button" className="chat-row-menu-item" onClick={handleArchive}>
                <Archive size={14} strokeWidth={1.75} />
                Arquivar
              </button>
              <button
                type="button"
                className="chat-row-menu-item chat-row-menu-item-danger"
                onClick={handleDelete}
              >
                <Trash2 size={14} strokeWidth={1.75} />
                Apagar
              </button>
            </>
          ) : (
            <>
              <button type="button" className="chat-row-menu-item" onClick={() => setMode('main')}>
                <ArrowLeft size={14} strokeWidth={1.75} />
                Voltar
              </button>
              {chat.projectId && (
                <button
                  type="button"
                  className="chat-row-menu-item"
                  onClick={async () => {
                    close()
                    await onMove(null)
                  }}
                >
                  Remover do projeto atual
                </button>
              )}
              {otherProjects.length === 0 ? (
                <span className="chat-row-menu-empty">Nenhum outro projeto</span>
              ) : (
                otherProjects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    className="chat-row-menu-item"
                    onClick={async () => {
                      close()
                      await onMove(project.id)
                    }}
                  >
                    {project.name}
                  </button>
                ))
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function Sidebar({
  activeView,
  activeChatId,
  onNewSession,
  onOpenSettings,
  onOpenSkills,
  onOpenAgents,
  onOpenProjects,
  onOpenClients,
  onOpenTasks,
  onOpenNews,
  onSelectChat,
  onChatRemoved,
  workPresence
}: SidebarProps): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const navigate = useNavigate()
  const [usageOpen, setUsageOpen] = useState(false)
  const [expandedProject, setExpandedProject] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const { profile, user, signOut } = useAuthStore((state) => ({
    profile: state.profile,
    user: state.user,
    signOut: state.signOut
  }))

  const {
    recentChats,
    projects,
    projectChats,
    loaded,
    load,
    loadProjectChats,
    deleteChat,
    archiveChat,
    moveChatToProject
  } = useChatStore((state) => ({
    recentChats: state.recentChats,
    projects: state.projects,
    projectChats: state.projectChats,
    loaded: state.loaded,
    load: state.load,
    loadProjectChats: state.loadProjectChats,
    deleteChat: state.deleteChat,
    archiveChat: state.archiveChat,
    moveChatToProject: state.moveChatToProject
  }))

  async function handleDeleteChat(chatId: string): Promise<boolean> {
    const ok = await deleteChat(chatId)
    if (ok && chatId === activeChatId) onChatRemoved?.(chatId)
    return ok
  }

  async function handleArchiveChat(chatId: string): Promise<boolean> {
    const ok = await archiveChat(chatId)
    if (ok && chatId === activeChatId) onChatRemoved?.(chatId)
    return ok
  }

  useEffect(() => {
    if (!loaded) load()
  }, [loaded, load])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const displayName = profile?.nome || user?.email || 'Usuário'
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

  async function handleSignOut(): Promise<void> {
    setSignOutError(null)
    if (await signOut()) {
      setMenuOpen(false)
      navigate('/auth', { replace: true })
    } else {
      setSignOutError('Não foi possível sair. Tente novamente.')
    }
  }

  function handleShortcutClick(id: ShortcutId): void {
    if (id === 'skills') onOpenSkills()
    if (id === 'agents') onOpenAgents()
    if (id === 'projects') onOpenProjects()
    if (id === 'clients') onOpenClients()
    if (id === 'tasks') onOpenTasks()
    if (id === 'news') onOpenNews()
    if (id === 'new-session') onNewSession()
  }

  function toggleProject(projectId: string): void {
    if (expandedProject === projectId) {
      setExpandedProject(null)
      return
    }
    setExpandedProject(projectId)
    if (!projectChats[projectId]) loadProjectChats(projectId)
  }

  return (
    <aside className="sidebar">
      <nav className="sidebar-shortcuts">
        {SHORTCUTS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            type="button"
            className={`sidebar-shortcut ${activeView === id ? 'sidebar-shortcut-active' : ''}`}
            onClick={() => handleShortcutClick(id)}
          >
            <Icon size={16} strokeWidth={1.75} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-scroll">
        <div className="sidebar-section">
          <span className="sidebar-section-title">Chats recentes</span>
          <ul className="sidebar-list">
            {recentChats.length === 0 && <li className="sidebar-list-empty">Nenhum chat ainda</li>}
            {recentChats.map((chat) => (
              <li key={chat.id} className="sidebar-list-row">
                <button
                  type="button"
                  className={`sidebar-list-item sidebar-list-item-btn ${
                    activeView === 'chat' && activeChatId === chat.id
                      ? 'sidebar-list-item-active'
                      : ''
                  }`}
                  title={chat.title}
                  onClick={() => onSelectChat(chat.id)}
                >
                  {chat.title}
                </button>
                <div className="sidebar-list-row-end">
                  {presenceLabel(workPresence.filter((item) => item.chatId === chat.id), user?.id ?? null) && <span className="sidebar-work-dot" title={presenceLabel(workPresence.filter((item) => item.chatId === chat.id), user?.id ?? null) ?? ''} />}
                  {activeChatId !== chat.id && <ChatStatusDot chatId={chat.id} />}
                  <ChatRowMenu
                    chat={chat}
                    active={activeChatId === chat.id}
                    projects={projects}
                    onSelect={() => onSelectChat(chat.id)}
                    onDelete={() => handleDeleteChat(chat.id)}
                    onArchive={() => handleArchiveChat(chat.id)}
                    onMove={(projectId) => moveChatToProject(chat.id, projectId)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="sidebar-section">
          <span className="sidebar-section-title">Projetos</span>
          <ul className="sidebar-list">
            {projects.length === 0 && <li className="sidebar-list-empty">Nenhum projeto ainda</li>}
            {projects.map((project) => (
              <li key={project.id}>
                <button
                  type="button"
                  className="sidebar-list-item sidebar-list-item-btn sidebar-project-item"
                  title={project.name}
                  onClick={() => toggleProject(project.id)}
                >
                  <ChevronRight
                    size={12}
                    strokeWidth={2}
                    className={`sidebar-project-chevron ${
                      expandedProject === project.id ? 'sidebar-project-chevron-open' : ''
                    }`}
                  />
                  {project.name}
                </button>
                {expandedProject === project.id && (
                  <ul className="sidebar-sublist">
                    {(projectChats[project.id] ?? []).length === 0 && (
                      <li className="sidebar-list-empty sidebar-sublist-empty">Sem chats ainda</li>
                    )}
                    {(projectChats[project.id] ?? []).map((chat) => (
                      <li key={chat.id} className="sidebar-list-row sidebar-sublist-row">
                        <button
                          type="button"
                          className={`sidebar-list-item sidebar-list-item-btn ${
                            activeView === 'chat' && activeChatId === chat.id
                              ? 'sidebar-list-item-active'
                              : ''
                          }`}
                          title={chat.title}
                          onClick={() => onSelectChat(chat.id)}
                        >
                          {chat.title}
                        </button>
                        {presenceLabel(workPresence.filter((item) => item.chatId === chat.id), user?.id ?? null) && <span className="sidebar-work-dot" title={presenceLabel(workPresence.filter((item) => item.chatId === chat.id), user?.id ?? null) ?? ''} />}
                        <ChatRowMenu
                          chat={chat}
                          active={activeChatId === chat.id}
                          projects={projects}
                          onSelect={() => onSelectChat(chat.id)}
                          onDelete={() => handleDeleteChat(chat.id)}
                          onArchive={() => handleArchiveChat(chat.id)}
                          onMove={(projectId) => moveChatToProject(chat.id, projectId)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="sidebar-user" ref={menuRef}>
        {menuOpen && (
          <div className="sidebar-user-menu">
            <button
              type="button"
              className="sidebar-user-menu-item"
              onClick={() => {
                setMenuOpen(false)
                onOpenSettings()
              }}
            >
              <Settings size={15} strokeWidth={1.75} />
              Configurações
            </button>
            <button
              type="button"
              className="sidebar-user-menu-item"
              onClick={() => {
                setMenuOpen(false)
                setUsageOpen(true)
              }}
            >
              <Gauge size={15} strokeWidth={1.75} />
              Uso
            </button>
            <button
              type="button"
              className="sidebar-user-menu-item sidebar-user-menu-item-danger"
              onClick={handleSignOut}
            >
              <LogOut size={15} strokeWidth={1.75} />
              Sair
            </button>
            {signOutError && (
              <p className="sidebar-user-menu-error" role="alert">
                {signOutError}
              </p>
            )}
          </div>
        )}
        <button
          type="button"
          className="sidebar-user-trigger"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="sidebar-avatar">{initials || 'A'}</span>
          <span className="sidebar-user-info">
            <span className="sidebar-user-name">{displayName}</span>
            {profile?.cargo && <span className="sidebar-user-role">{profile.cargo}</span>}
          </span>
          <ChevronsUpDown size={14} strokeWidth={1.75} className="sidebar-user-chevron" />
        </button>
      </div>

      <UsageModal open={usageOpen} onClose={() => setUsageOpen(false)} />
    </aside>
  )
}
