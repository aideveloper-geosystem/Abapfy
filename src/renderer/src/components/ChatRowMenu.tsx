import { useEffect, useRef, useState } from 'react'
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  FolderInput,
  Globe,
  Lock,
  MoreHorizontal,
  Trash2
} from 'lucide-react'
import type { ChatSummary, ProjectSummary } from '@renderer/store/chatStore'

interface ChatRowMenuProps {
  chat: ChatSummary
  projects: ProjectSummary[]
  /** Increments on every right click on the row, opening the menu. */
  openSignal?: number
  onDelete: () => Promise<boolean>
  onArchive: () => Promise<boolean>
  onPublish: (isPublic: boolean) => Promise<boolean>
  onMove: (projectId: string | null) => Promise<boolean>
}

/** Actions of a session. Rendered only for its author: the database refuses everyone else. */
export function ChatRowMenu({
  chat,
  projects,
  openSignal = 0,
  onDelete,
  onArchive,
  onPublish,
  onMove
}: ChatRowMenuProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'main' | 'projects'>('main')
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openSignal) return
    setMode('main')
    setOpen(true)
  }, [openSignal])

  useEffect(() => {
    if (!open) return
    function handleClickOutside(event: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false)
        setMode('main')
      }
    }
    function handleEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  function close(): void {
    setOpen(false)
    setMode('main')
  }

  async function run(action: () => Promise<boolean>, failure: string): Promise<void> {
    close()
    if (!(await action())) window.alert(failure)
  }

  function handleDelete(): void {
    if (!window.confirm('Excluir esta conversa? Essa ação não pode ser desfeita.')) return
    void run(onDelete, 'Não foi possível excluir a conversa.')
  }

  function handlePublish(): void {
    if (
      !chat.isPublic &&
      !window.confirm(
        'Publicar esta sessão? Todos os membros do workspace poderão ler a conversa inteira, inclusive anexos colados nas mensagens, na aba Sessões do cliente.'
      )
    )
      return
    void run(() => onPublish(!chat.isPublic), 'Não foi possível alterar a publicação. Confira se a migração 048 foi aplicada.')
  }

  const otherProjects = projects.filter(
    (project) => project.id !== chat.projectId && project.clientId === chat.clientId
  )

  return (
    <div className="chat-row-menu" ref={menuRef}>
      <button
        type="button"
        className="chat-row-menu-trigger"
        title="Mais opções"
        aria-label={`Opções de ${chat.title}`}
        aria-expanded={open}
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
              <button type="button" className="chat-row-menu-item" onClick={handlePublish}>
                {chat.isPublic ? <Lock size={14} strokeWidth={1.75} /> : <Globe size={14} strokeWidth={1.75} />}
                {chat.isPublic ? 'Tornar privada' : 'Publicar'}
              </button>
              <button type="button" className="chat-row-menu-item" onClick={() => setMode('projects')}>
                <FolderInput size={14} strokeWidth={1.75} />
                Adicionar a projeto
              </button>
              <button
                type="button"
                className="chat-row-menu-item"
                onClick={() => void run(onArchive, chat.archived ? 'Não foi possível desarquivar.' : 'Não foi possível arquivar.')}
              >
                {chat.archived ? <ArchiveRestore size={14} strokeWidth={1.75} /> : <Archive size={14} strokeWidth={1.75} />}
                {chat.archived ? 'Desarquivar' : 'Arquivar'}
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
                  onClick={() => void run(() => onMove(null), 'Não foi possível remover do projeto.')}
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
                    onClick={() => void run(() => onMove(project.id), 'Não foi possível mover para o projeto.')}
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
