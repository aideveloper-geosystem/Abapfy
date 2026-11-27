import { useEffect, useMemo, useRef, useState } from 'react'
import { Building2, FolderKanban, MessageSquare, Search } from 'lucide-react'
import { searchChats, type ChatSearchResult, type ChatSummary, type ProjectSummary } from '@renderer/store/chatStore'
import type { Client } from '@renderer/store/clientsStore'
import { matchesContent } from '@renderer/lib/contentOwnership'
import './SearchModal.css'

interface SearchModalProps {
  open: boolean
  onClose: () => void
  chats: ChatSummary[]
  projects: ProjectSummary[]
  clients: Client[]
  authorName: (userId: string) => string
  onSelectChat: (chatId: string) => void
  onOpenProjects: () => void
  onOpenClients: () => void
}

interface Result {
  key: string
  kind: 'chat' | 'project' | 'client'
  title: string
  detail: string
  open: () => void
}

const ICONS = { chat: MessageSquare, project: FolderKanban, client: Building2 }
const KIND_LABELS = { chat: 'Sessão', project: 'Projeto', client: 'Cliente' }
const MAX_RESULTS = 30

/** Command-palette style search across sessions, projects and clients of the workspace. */
export function SearchModal({
  open,
  onClose,
  chats,
  projects,
  clients,
  authorName,
  onSelectChat,
  onOpenProjects,
  onOpenClients
}: SearchModalProps): JSX.Element | null {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  // The loaded lists only hold recent titles; the database also searches older sessions and messages.
  const [found, setFound] = useState<{ query: string; chats: ChatSearchResult[]; error: string | null }>({ query: '', chats: [], error: null })
  const term = query.trim()
  const searching = open && term.length >= 2 && found.query !== term

  useEffect(() => {
    if (!open || term.length < 2) return
    let active = true
    const timer = window.setTimeout(() => {
      searchChats({ query: term })
        .then((page) => { if (active) setFound({ query: term, chats: page.chats, error: null }) })
        .catch((cause: Error) => { if (active) setFound({ query: term, chats: [], error: cause.message }) })
    }, 300)
    return () => { active = false; window.clearTimeout(timer) }
  }, [open, term])

  useEffect(() => {
    if (open) {
      setQuery('')
      setIndex(0)
      setFound({ query: '', chats: [], error: null })
      window.setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const clientName = (id: string): string => clients.find((client) => client.id === id)?.name ?? ''

  const results = useMemo<Result[]>(() => {
    const all: Result[] = [
      ...chats.map<Result>((chat) => ({
        key: `chat-${chat.id}`,
        kind: 'chat',
        title: chat.title,
        detail: [clientName(chat.clientId), authorName(chat.userId), chat.agentName].filter(Boolean).join(' · '),
        open: () => onSelectChat(chat.id)
      })),
      ...projects.map<Result>((project) => ({
        key: `project-${project.id}`,
        kind: 'project',
        title: project.name,
        detail: [clientName(project.clientId), authorName(project.userId)].filter(Boolean).join(' · '),
        open: onOpenProjects
      })),
      ...clients.map<Result>((client) => ({
        key: `client-${client.id}`,
        kind: 'client',
        title: client.name,
        detail: client.description ?? '',
        open: onOpenClients
      }))
    ]
    const text = query.trim()
    if (!text) return all.slice(0, MAX_RESULTS)
    const local = all.filter((item) => matchesContent(text, item.title, item.detail))
    const remote = (found.query === text ? found.chats : []).map<Result>((chat) => ({
      key: `chat-${chat.id}`,
      kind: 'chat',
      title: chat.title,
      detail: [clientName(chat.clientId), authorName(chat.userId), chat.excerpt].filter(Boolean).join(' · '),
      open: () => onSelectChat(chat.id)
    }))
    const remoteKeys = new Set(remote.map((item) => item.key))
    return [...remote, ...local.filter((item) => !remoteKeys.has(item.key))].slice(0, MAX_RESULTS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, chats, projects, clients, found])

  if (!open) return null

  function choose(result: Result | undefined): void {
    if (!result) return
    onClose()
    result.open()
  }

  return (
    <div className="search-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="search-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Pesquisa"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setIndex((value) => Math.min(value + 1, results.length - 1))
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            setIndex((value) => Math.max(value - 1, 0))
          }
          if (event.key === 'Enter') choose(results[index])
        }}
      >
        <label className="search-modal-input">
          <Search size={16} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Buscar sessões, projetos e clientes…"
            aria-label="Buscar sessões, projetos e clientes"
            onChange={(event) => {
              setQuery(event.target.value)
              setIndex(0)
            }}
          />
          <kbd>Esc</kbd>
        </label>
        <ul className="search-modal-results" role="listbox">
          {searching && <li className="search-modal-empty" role="status">Buscando nas mensagens…</li>}
          {found.error && found.query === term && <li className="search-modal-empty" role="alert">Busca nas mensagens indisponível: {found.error}</li>}
          {results.length === 0 && !searching && <li className="search-modal-empty">Nada encontrado para “{query}”.</li>}
          {results.map((result, position) => {
            const Icon = ICONS[result.kind]
            return (
              <li key={result.key} role="option" aria-selected={position === index}>
                <button
                  type="button"
                  className={position === index ? 'search-modal-active' : ''}
                  onMouseEnter={() => setIndex(position)}
                  onClick={() => choose(result)}
                >
                  <Icon size={15} strokeWidth={1.75} />
                  <span className="search-modal-copy">
                    <span>{result.title}</span>
                    {result.detail && <small>{result.detail}</small>}
                  </span>
                  <em>{KIND_LABELS[result.kind]}</em>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
