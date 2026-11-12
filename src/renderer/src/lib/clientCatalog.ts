import type { Client, ClientStats } from '@renderer/store/clientsStore'

export type CatalogFilter = 'all' | 'mine' | 'favorites' | 'archived'
export type SortKey = 'name' | 'projects' | 'chats' | 'files' | 'lastActivity' | 'creator'
export interface SortState {
  key: SortKey
  dir: 'asc' | 'desc'
}

export const EMPTY_STATS: ClientStats = { projects: 0, chats: 0, files: 0, lastActivity: null }

export interface CatalogQuery {
  filter: CatalogFilter
  query: string
  /** Advanced filter: only clients created by this user id (null = anyone). */
  creator: string | null
  userId: string | null | undefined
  favorites: readonly string[]
  /** Resolves a user id to a display name, used for search and sorting by creator. */
  authorName: (id: string | null | undefined) => string
}

const normalize = (value: string): string =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Applies the chip filter, the creator filter and the text search (name, description, creator). */
export function filterClients(clients: readonly Client[], options: CatalogQuery): Client[] {
  const text = normalize(options.query)
  return clients.filter((client) => {
    const archived = client.archivedAt !== null
    if (options.filter === 'archived' ? !archived : archived) return false
    if (options.filter === 'mine' && client.createdBy !== options.userId) return false
    if (options.filter === 'favorites' && !options.favorites.includes(client.id)) return false
    if (options.creator && client.createdBy !== options.creator) return false
    if (!text) return true
    return [client.name, client.description ?? '', options.authorName(client.createdBy)].some((field) =>
      normalize(field).includes(text)
    )
  })
}

/** Sorts a copy; ties fall back to the name so the order is stable. Favorites are not pinned here. */
export function sortClients(
  clients: readonly Client[],
  sort: SortState,
  stats: Readonly<Record<string, ClientStats>>,
  authorName: (id: string | null | undefined) => string
): Client[] {
  const direction = sort.dir === 'asc' ? 1 : -1
  const value = (client: Client): string | number => {
    const entry = stats[client.id] ?? EMPTY_STATS
    switch (sort.key) {
      case 'name':
        return normalize(client.name)
      case 'creator':
        return normalize(authorName(client.createdBy))
      case 'projects':
        return entry.projects
      case 'chats':
        return entry.chats
      case 'files':
        return entry.files
      case 'lastActivity':
        return entry.lastActivity ?? ''
    }
  }
  return [...clients].sort((a, b) => {
    const left = value(a)
    const right = value(b)
    const compared = left < right ? -1 : left > right ? 1 : 0
    return compared !== 0 ? compared * direction : normalize(a.name).localeCompare(normalize(b.name))
  })
}

/** Moves favorites to the top while keeping the relative order of the rest. */
export function pinFavorites(clients: readonly Client[], favorites: readonly string[]): Client[] {
  return [...clients.filter((c) => favorites.includes(c.id)), ...clients.filter((c) => !favorites.includes(c.id))]
}

/** Default direction when a column header is clicked for the first time. */
export function defaultDirection(key: SortKey): 'asc' | 'desc' {
  return key === 'name' || key === 'creator' ? 'asc' : 'desc'
}

export function nextSort(current: SortState, key: SortKey): SortState {
  return current.key === key
    ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
    : { key, dir: defaultDirection(key) }
}

/** "hoje", "ontem", "há 5 dias", or a short date for older activity. */
export function relativeActivity(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return 'Sem atividade'
  const then = new Date(value)
  if (Number.isNaN(then.getTime())) return 'Sem atividade'
  const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000)
  if (days <= 0) return 'Hoje'
  if (days === 1) return 'Ontem'
  if (days < 30) return `Há ${days} dias`
  return then.toLocaleDateString('pt-BR')
}
