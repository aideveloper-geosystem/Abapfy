import { useEffect, useMemo, useRef, useState } from 'react'
import { Archive, ArrowDown, ArrowUp, Building2, LayoutGrid, List, MessageSquarePlus, Plus, Search, SlidersHorizontal, Star, Users } from 'lucide-react'
import type { Client, ClientModule, ClientStats } from '@renderer/store/clientsStore'
import type { ClientPermissions } from '@renderer/lib/workspaceAccess'
import {
  EMPTY_STATS,
  filterClients,
  nextSort,
  pinFavorites,
  relativeActivity,
  sortClients,
  type CatalogFilter,
  type SortKey,
  type SortState
} from '@renderer/lib/clientCatalog'
import { RoleBadge } from '@renderer/components/RoleBadge'
import './ClientCatalog.css'

interface ClientCatalogProps {
  clients: Client[]
  modules: ClientModule[]
  stats: Record<string, ClientStats>
  favorites: string[]
  userId: string | null | undefined
  permissions: ClientPermissions
  authorName: (id: string | null | undefined) => string
  onOpen: (client: Client) => void
  onNewSession: (client: Client) => void
  onToggleFavorite: (client: Client) => void
  onNewClient: () => void
}

const FILTERS: { id: CatalogFilter; label: string; icon?: typeof Star }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'mine', label: 'Meus' },
  { id: 'favorites', label: 'Favoritos', icon: Star },
  { id: 'archived', label: 'Arquivados', icon: Archive }
]

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: 'name', label: 'Cliente' },
  { key: 'projects', label: 'Projetos', numeric: true },
  { key: 'chats', label: 'Sessões', numeric: true },
  { key: 'files', label: 'Arquivos', numeric: true },
  { key: 'lastActivity', label: 'Última atividade' },
  { key: 'creator', label: 'Criador' }
]

function readView(): 'table' | 'grid' {
  try {
    return window.localStorage.getItem('abapfy.clientsView') === 'grid' ? 'grid' : 'table'
  } catch {
    return 'table'
  }
}

/** Dense, sortable catalog of the workspace clients with chip filters, favorites and quick actions. */
export function ClientCatalog({
  clients,
  modules,
  stats,
  favorites,
  userId,
  permissions,
  authorName,
  onOpen,
  onNewSession,
  onToggleFavorite,
  onNewClient
}: ClientCatalogProps): JSX.Element {
  const [view, setViewState] = useState<'table' | 'grid'>(readView)
  const [filter, setFilter] = useState<CatalogFilter>('all')
  const [query, setQuery] = useState('')
  const [creator, setCreator] = useState<string | null>(null)
  const [sort, setSort] = useState<SortState>({ key: 'lastActivity', dir: 'desc' })
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const advancedRef = useRef<HTMLDivElement>(null)

  function setView(next: 'table' | 'grid'): void {
    setViewState(next)
    try {
      window.localStorage.setItem('abapfy.clientsView', next)
    } catch {
      /* preference only */
    }
  }

  useEffect(() => {
    if (!advancedOpen) return
    const close = (event: MouseEvent): void => {
      if (advancedRef.current && !advancedRef.current.contains(event.target as Node)) setAdvancedOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [advancedOpen])

  const creators = useMemo(
    () => [...new Set(clients.map((client) => client.createdBy).filter((id): id is string => Boolean(id)))],
    [clients]
  )

  const rows = useMemo(() => {
    const filtered = filterClients(clients, { filter, query, creator, userId, favorites, authorName })
    return pinFavorites(sortClients(filtered, sort, stats, authorName), favorites)
  }, [clients, filter, query, creator, userId, favorites, authorName, sort, stats])

  const counts = useMemo(
    () => ({
      all: clients.filter((client) => !client.archivedAt).length,
      mine: clients.filter((client) => !client.archivedAt && client.createdBy === userId).length,
      favorites: clients.filter((client) => !client.archivedAt && favorites.includes(client.id)).length,
      archived: clients.filter((client) => client.archivedAt).length
    }),
    [clients, favorites, userId]
  )

  const hasModule = (client: Client): boolean => modules.some((module) => module.clientId === client.id)

  const actions = (client: Client): JSX.Element => (
    <span className="client-catalog-actions" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className={`client-catalog-star ${favorites.includes(client.id) ? 'client-catalog-star-on' : ''}`}
        aria-pressed={favorites.includes(client.id)}
        aria-label={favorites.includes(client.id) ? `Desfavoritar ${client.name}` : `Favoritar ${client.name}`}
        title={favorites.includes(client.id) ? 'Remover dos favoritos' : 'Favoritar'}
        onClick={() => onToggleFavorite(client)}
      >
        <Star size={15} strokeWidth={1.75} fill={favorites.includes(client.id) ? 'currentColor' : 'none'} />
      </button>
      <button
        type="button"
        className="client-catalog-session"
        disabled={!hasModule(client) || Boolean(client.archivedAt)}
        title={client.archivedAt ? 'Cliente arquivado' : hasModule(client) ? 'Nova sessão neste cliente' : 'Cliente sem módulos'}
        aria-label={`Nova sessão em ${client.name}`}
        onClick={() => onNewSession(client)}
      >
        <MessageSquarePlus size={14} strokeWidth={1.75} /> <span>Nova sessão</span>
      </button>
    </span>
  )

  return (
    <section className="client-catalog" aria-label="Clientes do workspace">
      <header className="client-catalog-head">
        <div>
          <h1>Clientes</h1>
          <p>
            Conteúdo compartilhado no workspace <RoleBadge role={permissions.role} />
          </p>
        </div>
        {permissions.canEdit && (
          <button type="button" className="client-catalog-primary" onClick={onNewClient}>
            <Plus size={15} /> Novo cliente
          </button>
        )}
      </header>

      <div className="client-catalog-tools">
        <div className="client-catalog-chips" role="group" aria-label="Filtro de clientes">
          {FILTERS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>
              {Icon && <Icon size={12} strokeWidth={1.75} />}
              {label}
              <span>{counts[id]}</span>
            </button>
          ))}
        </div>
        <label className="client-catalog-search">
          <Search size={14} />
          <input
            aria-label="Buscar clientes"
            placeholder="Buscar cliente, descrição ou criador…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="client-catalog-advanced" ref={advancedRef}>
          <button
            type="button"
            className={creator ? 'client-catalog-advanced-on' : ''}
            aria-expanded={advancedOpen}
            aria-haspopup="menu"
            onClick={() => setAdvancedOpen((open) => !open)}
          >
            <SlidersHorizontal size={14} /> {creator ? authorName(creator) : 'Criador'}
          </button>
          {advancedOpen && (
            <div className="client-catalog-popover" role="menu" aria-label="Filtrar por criador">
              <button type="button" role="menuitemradio" aria-checked={!creator} onClick={() => { setCreator(null); setAdvancedOpen(false) }}>
                Qualquer pessoa
              </button>
              {creators.map((id) => (
                <button key={id} type="button" role="menuitemradio" aria-checked={creator === id} onClick={() => { setCreator(id); setAdvancedOpen(false) }}>
                  <Users size={13} /> {id === userId ? `${authorName(id)} (você)` : authorName(id)}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="client-catalog-views" role="group" aria-label="Modo de exibição">
          <button type="button" aria-pressed={view === 'table'} title="Tabela" aria-label="Tabela" onClick={() => setView('table')}>
            <List size={15} />
          </button>
          <button type="button" aria-pressed={view === 'grid'} title="Grade" aria-label="Grade" onClick={() => setView('grid')}>
            <LayoutGrid size={15} />
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="client-catalog-empty">
          {clients.length === 0
            ? permissions.canEdit
              ? 'Nenhum cliente ainda. Crie o primeiro para organizar sessões, projetos e o drive.'
              : 'Nenhum cliente no workspace ainda. Peça a um administrador para cadastrar.'
            : 'Nenhum cliente corresponde aos filtros.'}
        </p>
      ) : view === 'table' ? (
        <div className="client-catalog-table-wrap">
          <table className="client-catalog-table">
            <thead>
              <tr>
                {COLUMNS.map((column) => {
                  const active = sort.key === column.key
                  return (
                    <th key={column.key} scope="col" className={column.numeric ? 'client-catalog-num' : ''} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button type="button" onClick={() => setSort((current) => nextSort(current, column.key))}>
                        {column.label}
                        {active && (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                      </button>
                    </th>
                  )
                })}
                <th scope="col" className="client-catalog-actions-col">
                  <span className="client-catalog-sr">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((client) => {
                const entry = stats[client.id] ?? EMPTY_STATS
                return (
                  <tr key={client.id} className={client.archivedAt ? 'client-catalog-archived' : ''} onClick={() => onOpen(client)}>
                    <td>
                      <button type="button" className="client-catalog-name" onClick={(event) => { event.stopPropagation(); onOpen(client) }}>
                        <Building2 size={15} strokeWidth={1.75} />
                        <span>
                          <strong>{client.name}</strong>
                          {client.description && <small>{client.description}</small>}
                        </span>
                        {client.archivedAt && <em>Arquivado</em>}
                      </button>
                    </td>
                    <td className="client-catalog-num">{entry.projects}</td>
                    <td className="client-catalog-num">{entry.chats}</td>
                    <td className="client-catalog-num">{entry.files}</td>
                    <td>{relativeActivity(entry.lastActivity)}</td>
                    <td>{authorName(client.createdBy)}</td>
                    <td className="client-catalog-actions-col">{actions(client)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="client-catalog-grid">
          {rows.map((client) => {
            const entry = stats[client.id] ?? EMPTY_STATS
            return (
              <article key={client.id} className={`client-catalog-card ${client.archivedAt ? 'client-catalog-archived' : ''}`}>
                <button type="button" className="client-catalog-card-main" onClick={() => onOpen(client)}>
                  <Building2 size={20} strokeWidth={1.5} />
                  <strong>{client.name}</strong>
                  {client.archivedAt && <em>Arquivado</em>}
                  <small>{client.description || 'Sem descrição'}</small>
                  <span className="client-catalog-card-stats">
                    {entry.projects} projetos · {entry.chats} sessões · {entry.files} arquivos
                  </span>
                  <span className="client-catalog-card-meta">
                    {relativeActivity(entry.lastActivity)} · {authorName(client.createdBy)}
                  </span>
                </button>
                {actions(client)}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
