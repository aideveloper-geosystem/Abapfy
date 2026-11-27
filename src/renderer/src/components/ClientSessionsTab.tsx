import { useEffect, useRef, useState } from 'react'
import { Globe, Lock, MessageSquare, MessageSquarePlus, Search } from 'lucide-react'
import { searchChats, useChatStore, type ChatSearchResult } from '@renderer/store/chatStore'
import { CreatorFilter } from '@renderer/components/CreatorFilter'
import { ChatRowMenu } from '@renderer/components/ChatRowMenu'
import { useAuthorNames } from '@renderer/lib/useAuthorNames'
import { contentDate, creatorLabel, type OwnerFilter } from '@renderer/lib/contentOwnership'

interface Props {
  clientId: string
  userId: string | null
  canStart: boolean
  onNewSession: () => void
  onOpenChat: (id: string) => void
  workLabel: (chatId: string) => string | null
}

const PERIODS = [
  { days: 0, label: 'Qualquer data' },
  { days: 7, label: 'Últimos 7 dias' },
  { days: 30, label: 'Últimos 30 dias' },
  { days: 90, label: 'Últimos 90 dias' }
]

/** Sessions of a client: the caller's own plus the ones other people published. */
export function ClientSessionsTab({
  clientId,
  userId,
  canStart,
  onNewSession,
  onOpenChat,
  workLabel
}: Props): JSX.Element {
  const [query, setQuery] = useState('')
  const [term, setTerm] = useState('')
  const [owner, setOwner] = useState<OwnerFilter>('all')
  const [days, setDays] = useState(0)
  const [publicOnly, setPublicOnly] = useState(false)
  const [archived, setArchived] = useState(false)
  const [chats, setChats] = useState<ChatSearchResult[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [authorIds, setAuthorIds] = useState<string[]>([])
  const [menuRequest, setMenuRequest] = useState({ chatId: '', count: 0 })
  const request = useRef(0)
  const { projects, deleteChat, archiveChat, restoreChat, setChatPublic, moveChatToProject } =
    useChatStore()
  const names = useAuthorNames([...authorIds, ...chats.map((chat) => chat.userId)])

  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(query.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [query])

  function filters(offset: number): Parameters<typeof searchChats>[0] {
    return {
      clientId,
      query: term,
      owner,
      publicOnly,
      archived,
      since: days ? new Date(Date.now() - days * 86_400_000).toISOString() : null,
      offset
    }
  }

  async function fetchPage(offset: number): Promise<void> {
    const current = ++request.current
    setLoading(true)
    setError(null)
    try {
      const page = await searchChats(filters(offset))
      if (current !== request.current) return
      setChats((previous) =>
        offset
          ? [...previous, ...page.chats.filter((chat) => !previous.some((item) => item.id === chat.id))]
          : page.chats
      )
      setAuthorIds((previous) => [...new Set([...previous, ...page.chats.map((chat) => chat.userId)])])
      setHasMore(page.hasMore)
    } catch (cause) {
      if (current !== request.current) return
      if (!offset) setChats([])
      setHasMore(false)
      setError((cause as Error).message)
    } finally {
      if (current === request.current) setLoading(false)
    }
  }

  useEffect(() => {
    setAuthorIds([])
    setOwner('all')
  }, [clientId, userId])

  useEffect(() => {
    setChats([])
    void fetchPage(0)
    return () => {
      request.current += 1
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, userId, term, owner, days, publicOnly, archived, version])

  async function act(action: () => Promise<boolean>): Promise<boolean> {
    const ok = await action()
    if (ok) setVersion((value) => value + 1)
    return ok
  }

  const filtered = Boolean(term || days || publicOnly || archived || owner !== 'all')

  return (
    <>
      <div className="clients-section-heading">
        <h3>
          Sessões{' '}
          <small className="clients-count">
            {chats.length}
            {hasMore ? '+' : ''}
          </small>
        </h3>
        <button type="button" disabled={!canStart} onClick={onNewSession}>
          <MessageSquarePlus size={14} /> Nova sessão
        </button>
      </div>
      <p className="client-sessions-note">
        Suas sessões são privadas. Clique com o botão direito e escolha Publicar para o workspace
        poder lê-las aqui.
      </p>
      <div className="clients-content-tools">
        <label className="clients-search">
          <Search size={16} />
          <input
            aria-label="Buscar no título e nas mensagens das sessões"
            placeholder="Buscar por assunto, objeto, transação…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <CreatorFilter label="Autor" value={owner} onChange={setOwner} ids={authorIds} names={names} userId={userId ?? undefined} />
        <label className="content-creator-filter">
          <span>Atualizada em</span>
          <select value={days} onChange={(event) => setDays(Number(event.target.value))}>
            {PERIODS.map((period) => (
              <option key={period.days} value={period.days}>
                {period.label}
              </option>
            ))}
          </select>
        </label>
        <label className="client-sessions-toggle">
          <input type="checkbox" checked={publicOnly} onChange={(event) => setPublicOnly(event.target.checked)} />
          Só publicadas
        </label>
        <label className="client-sessions-toggle">
          <input type="checkbox" checked={archived} onChange={(event) => setArchived(event.target.checked)} />
          Arquivadas
        </label>
      </div>
      {error && (
        <p className="clients-error" role="alert">
          Sessões indisponíveis: {error}
        </p>
      )}
      <div className="clients-list">
        {chats.map((chat) => {
          const mine = chat.userId === userId
          const working = workLabel(chat.id)
          return (
            <div
              key={chat.id}
              className="client-session-row"
              onContextMenu={(event) => {
                if (!mine) return
                event.preventDefault()
                setMenuRequest((current) => ({ chatId: chat.id, count: current.count + 1 }))
              }}
            >
              <button type="button" className="client-session-open" onClick={() => onOpenChat(chat.id)}>
                <MessageSquare size={15} />
                <span>
                  <strong>{chat.title}</strong>
                  {chat.excerpt && <em>…{chat.excerpt}…</em>}
                  <small>
                    {creatorLabel(chat.userId, names, userId ?? undefined)} · atualizada{' '}
                    {contentDate(chat.updatedAt)}
                  </small>
                </span>
              </button>
              {working && <span className="clients-work-badge">{working}</span>}
              <span className="client-session-visibility">
                {chat.isPublic ? <Globe size={12} /> : <Lock size={12} />}
                {chat.isPublic ? 'Publicada' : 'Privada'}
              </span>
              {mine && (
                <ChatRowMenu
                  chat={chat}
                  projects={projects}
                  openSignal={menuRequest.chatId === chat.id ? menuRequest.count : 0}
                  onDelete={() => act(() => deleteChat(chat.id))}
                  onArchive={() => act(() => (chat.archived ? restoreChat(chat.id) : archiveChat(chat.id)))}
                  onPublish={(isPublic) => act(() => setChatPublic(chat.id, isPublic))}
                  onMove={(projectId) => act(() => moveChatToProject(chat.id, projectId))}
                />
              )}
            </div>
          )
        })}
        {chats.length === 0 && !error && (
          <p>
            {loading
              ? 'Carregando sessões…'
              : filtered
                ? 'Nenhuma sessão corresponde aos filtros.'
                : 'Nenhuma sessão neste cliente ainda.'}
          </p>
        )}
      </div>
      {hasMore && (
        <button type="button" className="clients-load-more" disabled={loading} onClick={() => void fetchPage(chats.length)}>
          {loading ? 'Carregando…' : 'Carregar mais'}
        </button>
      )}
    </>
  )
}
