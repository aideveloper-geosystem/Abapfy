import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Archive,
  ArrowLeft,
  Bot,
  ChevronDown,
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
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Search,
  Settings,
  Sparkles,
  SquarePen,
  Trash2,
  Users,
  Workflow
} from 'lucide-react'
import { useAuthStore } from '@renderer/store/authStore'
import { useWorkspaceStore } from '@renderer/store/workspaceStore'
import { SearchModal } from '@renderer/components/SearchModal'
import { useChatStore, type ChatSummary, type ProjectSummary } from '@renderer/store/chatStore'
import { useChatRuntimeStore } from '@renderer/store/chatRuntimeStore'
import { presenceLabel, type WorkPresence } from '@renderer/lib/workPresence'
import { UsageModal } from '@renderer/components/UsageModal'
import { useClientsStore } from '@renderer/store/clientsStore'
import { useAuthorNames } from '@renderer/lib/useAuthorNames'
import { creatorLabel, matchesOwner, contentDate, type OwnerFilter } from '@renderer/lib/contentOwnership'
import './Sidebar.css'

type ShortcutId = 'new-session' | 'search' | 'projects' | 'clients' | 'flows' | 'tasks' | 'skills' | 'agents' | 'news'

/** Main navigation, in the order users reach for it. */
const SHORTCUTS: { id: ShortcutId; icon: typeof Sparkles; label: string }[] = [
  { id: 'new-session', icon: SquarePen, label: 'Nova sessão' },
  { id: 'search', icon: Search, label: 'Pesquisa' },
  { id: 'projects', icon: FolderKanban, label: 'Projetos' },
  { id: 'clients', icon: Building2, label: 'Clientes' },
  { id: 'flows', icon: Workflow, label: 'Fluxos' }
]

/** Secondary destinations, collapsed under "Mais". */
const MORE_SHORTCUTS: { id: ShortcutId; icon: typeof Sparkles; label: string }[] = [
  { id: 'tasks', icon: ListChecks, label: 'Tarefas' },
  { id: 'skills', icon: Sparkles, label: 'Skills' },
  { id: 'agents', icon: Bot, label: 'Agentes' },
  { id: 'news', icon: Newspaper, label: 'Notícias' }
]

export type SidebarView = 'chat' | 'skills' | 'agents' | 'projects' | 'clients' | 'tasks' | 'news' | 'flows' | 'workspace'
export type SettingsTarget = 'general' | 'updates'

interface SidebarProps {
  activeView: SidebarView
  activeChatId: string | null
  onNewSession: () => void
  onOpenSettings: (section?: SettingsTarget) => void
  onOpenWorkspace: () => void
  onOpenSkills: () => void
  onOpenAgents: () => void
  onOpenFlows: () => void
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
  onOpenFlows,
  onOpenProjects,
  onOpenClients,
  onOpenTasks,
  onOpenNews,
  onOpenWorkspace,
  onSelectChat,
  onChatRemoved,
  workPresence
}: SidebarProps): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [collapsedClients, setCollapsedClients] = useState<Set<string>>(new Set())
  const [chatScope, setChatScope] = useState<OwnerFilter>('mine')
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
  const workspace = useWorkspaceStore((state) => state.workspace)
  const workspaceLegacy = useWorkspaceStore((state) => state.legacy)

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

  const chatLoadError = useChatStore(state => state.error)
  const clients = useClientsStore(state => state.clients)
  const names = useAuthorNames([...recentChats.map(chat => chat.userId), ...projects.map(project => project.userId), ...Object.values(projectChats).flat().map(chat => chat.userId)])
  const author = (id: string): string => creatorLabel(id, names, user?.id)
  const clientName = (id: string): string => clients.find(client => client.id === id)?.name ?? ''
  const filteredChats = recentChats.filter((chat) => matchesOwner(chat.userId, user?.id, chatScope))
  const filteredProjects = projects
  // Sessions always live inside a client, so the recent list is grouped by client.
  const chatGroups = clients
    .map((client) => ({ client, chats: filteredChats.filter((chat) => chat.clientId === client.id) }))
    .filter((group) => group.chats.length > 0)
  const ungrouped = filteredChats.filter((chat) => !clients.some((client) => client.id === chat.clientId))
  useEffect(() => { setChatScope('mine') }, [user?.id])
  const chatCaption = (chat: ChatSummary): JSX.Element => <span className="sidebar-chat-copy"><span className="sidebar-chat-title">{chat.title}</span><small><span className="sidebar-author-name">{author(chat.userId)}</span>{clientName(chat.clientId) ? ' · ' + clientName(chat.clientId) : ''}</small></span>
  const chatTooltip = (chat: ChatSummary): string => [chat.title, 'Criado por ' + author(chat.userId), clientName(chat.clientId), 'Atualizado em ' + contentDate(chat.updatedAt)].filter(Boolean).join(' · ')

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
    function handleSearchShortcut(event: KeyboardEvent): void {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    document.addEventListener('keydown', handleSearchShortcut)
    return () => document.removeEventListener('keydown', handleSearchShortcut)
  }, [])

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
    if (id === 'search') setSearchOpen(true)
    if (id === 'skills') onOpenSkills()
    if (id === 'agents') onOpenAgents()
    if (id === 'flows') onOpenFlows()
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

  function toggleClientGroup(clientId: string): void {
    setCollapsedClients((current) => {
      const next = new Set(current)
      if (next.has(clientId)) next.delete(clientId)
      else next.add(clientId)
      return next
    })
  }

  function openFromMenu(action: () => void): void {
    setMenuOpen(false)
    action()
  }

  function renderShortcut({ id, icon: Icon, label }: (typeof SHORTCUTS)[number], view?: SidebarView): JSX.Element {
    const active = view !== undefined && activeView === view
    return (
      <button
        key={id}
        type="button"
        className={`sidebar-shortcut ${active ? 'sidebar-shortcut-active' : ''}`}
        onClick={() => handleShortcutClick(id)}
        title={label}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
      >
        <Icon size={16} strokeWidth={1.75} />
        <span>{label}</span>
      </button>
    )
  }

  function renderChatRow(chat: ChatSummary, sublist = false): JSX.Element {
    const presenceText = presenceLabel(workPresence.filter((item) => item.chatId === chat.id), user?.id ?? null)
    return (
      <li key={chat.id} className={`sidebar-list-row ${sublist ? 'sidebar-sublist-row' : ''}`}>
        <button
          type="button"
          className={`sidebar-list-item sidebar-list-item-btn ${
            activeView === 'chat' && activeChatId === chat.id ? 'sidebar-list-item-active' : ''
          }`}
          title={chatTooltip(chat)}
          onClick={() => onSelectChat(chat.id)}
        >
          {chatCaption(chat)}
        </button>
        <div className="sidebar-list-row-end">
          {presenceText && <span className="sidebar-work-dot" title={presenceText} />}
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
    )
  }

  const roleLabel = workspace ? { OWNER: 'Proprietário', ADMIN: 'Administrador', MEMBER: 'Membro' }[workspace.role] : null

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="sidebar-workspace-header">
        <button
          type="button"
          className="sidebar-workspace-name"
          title={workspaceLegacy ? 'Workspace indisponível' : 'Gerenciar workspace'}
          disabled={!workspace}
          onClick={onOpenWorkspace}
        >
          <Users size={14} strokeWidth={1.75} />
          <span>{workspace?.name ?? 'Abapfy'}</span>
        </button>
        <button type="button" className="sidebar-collapse-toggle" aria-label={collapsed ? 'Expandir navegação' : 'Recolher navegação'} title={collapsed ? 'Expandir navegação' : 'Recolher navegação'} aria-expanded={!collapsed} onClick={() => { setCollapsed((value) => !value); setMenuOpen(false) }}>{collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</button>
      </div>
      <nav className="sidebar-shortcuts" aria-label="Navegação principal">
        {SHORTCUTS.map((shortcut) =>
          renderShortcut(shortcut, shortcut.id === 'new-session' || shortcut.id === 'search' ? undefined : (shortcut.id as SidebarView))
        )}
        <button
          type="button"
          className="sidebar-shortcut sidebar-shortcut-more"
          aria-expanded={moreOpen}
          title="Mais"
          onClick={() => setMoreOpen((open) => !open)}
        >
          <ChevronDown size={16} strokeWidth={1.75} className={`sidebar-more-chevron ${moreOpen ? 'sidebar-more-chevron-open' : ''}`} />
          <span>Mais</span>
        </button>
        {moreOpen && MORE_SHORTCUTS.map((shortcut) => renderShortcut(shortcut, shortcut.id as SidebarView))}
      </nav>

      <div className="sidebar-scroll">
        <div className="sidebar-section">
          <span className="sidebar-section-title">Sessões</span>
          <div className="sidebar-chat-scopes" role="group" aria-label="Autoria das sessões">
            {([['mine', 'Minhas'], ['team', 'Equipe'], ['all', 'Todas']] as const).map(([scope, label]) => <button key={scope} type="button" aria-pressed={chatScope === scope} onClick={() => setChatScope(scope)}>{label}<span>{recentChats.filter((chat) => matchesOwner(chat.userId, user?.id, scope)).length}</span></button>)}
          </div>
          {chatLoadError && <div className="sidebar-load-error" role="alert">Não foi possível atualizar as sessões.<button type="button" onClick={() => void load()}>Tentar novamente</button></div>}
          {filteredChats.length === 0 && <p className="sidebar-list-empty">{chatScope === 'mine' ? 'Você ainda não tem sessões.' : 'Nenhuma sessão neste grupo.'}</p>}
          {chatGroups.map(({ client, chats }) => {
            const open = !collapsedClients.has(client.id)
            return (
              <div key={client.id} className="sidebar-client-group">
                <button type="button" className="sidebar-client-header" aria-expanded={open} onClick={() => toggleClientGroup(client.id)}>
                  <ChevronRight size={12} strokeWidth={2} className={`sidebar-project-chevron ${open ? 'sidebar-project-chevron-open' : ''}`} />
                  <Building2 size={13} strokeWidth={1.75} />
                  <span>{client.name}</span>
                  <small>{chats.length}</small>
                </button>
                {open && <ul className="sidebar-list">{chats.map((chat) => renderChatRow(chat))}</ul>}
              </div>
            )
          })}
          {ungrouped.length > 0 && <ul className="sidebar-list">{ungrouped.map((chat) => renderChatRow(chat))}</ul>}
        </div>

        <div className="sidebar-section">
          <span className="sidebar-section-title">Projetos</span>
          <ul className="sidebar-list">
            {filteredProjects.length === 0 && <li className="sidebar-list-empty">Nenhum projeto ainda</li>}
            {filteredProjects.map((project) => (
              <li key={project.id}>
                <button
                  type="button"
                  className="sidebar-list-item sidebar-list-item-btn sidebar-project-item"
                  title={project.name + ' · Criado por ' + author(project.userId)}
                  onClick={() => toggleProject(project.id)}
                >
                  <ChevronRight
                    size={12}
                    strokeWidth={2}
                    className={`sidebar-project-chevron ${
                      expandedProject === project.id ? 'sidebar-project-chevron-open' : ''
                    }`}
                  />
                  <span className="sidebar-chat-copy"><span className="sidebar-chat-title">{project.name}</span><small><span className="sidebar-author-name">{author(project.userId)}</span>{clientName(project.clientId) ? ' · ' + clientName(project.clientId) : ''}</small></span>
                </button>
                {expandedProject === project.id && (
                  <ul className="sidebar-sublist">
                    {(projectChats[project.id] ?? []).length === 0 && (
                      <li className="sidebar-list-empty sidebar-sublist-empty">Sem sessões ainda</li>
                    )}
                    {(['mine', 'team'] as const).filter((scope) => (projectChats[project.id] ?? []).some((chat) => matchesOwner(chat.userId, user?.id, scope))).map((scope) => (
                      <li key={scope} className="sidebar-project-chat-group">
                        <span className="sidebar-section-title">{scope === 'mine' ? 'Minhas' : 'Equipe'}</span>
                        <ul>
                          {(projectChats[project.id] ?? []).filter((chat) => matchesOwner(chat.userId, user?.id, scope)).map((chat) => renderChatRow(chat, true))}
                        </ul>
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
          <div className="sidebar-user-menu" role="menu">
            <div className="sidebar-user-menu-head">
              <strong>{user?.email ?? displayName}</strong>
              {workspace && <small>{workspace.name}{roleLabel ? ` · ${roleLabel}` : ''}</small>}
            </div>
            <button type="button" role="menuitem" className="sidebar-user-menu-item" onClick={() => openFromMenu(() => onOpenSettings('general'))}>
              <Settings size={15} strokeWidth={1.75} />
              Configurações
            </button>
            <button type="button" role="menuitem" className="sidebar-user-menu-item" onClick={() => openFromMenu(() => setUsageOpen(true))}>
              <Gauge size={15} strokeWidth={1.75} />
              Uso
            </button>
            <button type="button" role="menuitem" className="sidebar-user-menu-item" disabled={!workspace} onClick={() => openFromMenu(onOpenWorkspace)}>
              <Users size={15} strokeWidth={1.75} />
              Workspace
            </button>
            <button type="button" role="menuitem" className="sidebar-user-menu-item" onClick={() => openFromMenu(() => onOpenSettings('updates'))}>
              <ScrollText size={15} strokeWidth={1.75} />
              Changelog
            </button>
            <div className="sidebar-user-menu-divider" role="separator" />
            <button type="button" role="menuitem" className="sidebar-user-menu-item sidebar-user-menu-item-danger" onClick={handleSignOut}>
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
          aria-label={`Menu de ${displayName}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="sidebar-avatar">{initials || 'A'}</span>
          <span className="sidebar-user-info">
            <span className="sidebar-user-name">{displayName}</span>
            {(profile?.cargo || roleLabel) && <span className="sidebar-user-role">{profile?.cargo ?? roleLabel}</span>}
          </span>
          <ChevronsUpDown size={14} strokeWidth={1.75} className="sidebar-user-chevron" />
        </button>
      </div>

      <UsageModal open={usageOpen} onClose={() => setUsageOpen(false)} />
      <SearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        chats={recentChats}
        projects={projects}
        clients={clients}
        authorName={author}
        onSelectChat={onSelectChat}
        onOpenProjects={onOpenProjects}
        onOpenClients={onOpenClients}
      />
    </aside>
  )
}
