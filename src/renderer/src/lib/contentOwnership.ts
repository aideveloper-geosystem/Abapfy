export type OwnerFilter = 'all' | 'mine' | 'team' | 'unknown' | `user:${string}`
export function matchesOwner(
  owner: string | null | undefined,
  userId: string | undefined,
  filter: OwnerFilter
): boolean {
  if (filter === 'all') return true
  if (filter === 'unknown') return !owner
  if (filter === 'mine') return Boolean(userId && owner === userId)
  if (filter === 'team') return Boolean(owner && owner !== userId)
  return owner === filter.slice(5)
}
export function matchesContent(query: string, ...fields: (string | null | undefined)[]): boolean {
  const normalize = (value: string): string =>
    value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR')
  const text = normalize(fields.filter(Boolean).join(' '))
  return normalize(query)
    .trim()
    .split(/\s+/)
    .every((term) => text.includes(term))
}
export function creatorLabel(
  id: string | null | undefined,
  names: Record<string, string>,
  userId?: string
): string {
  if (!id) return 'Autoria não informada'
  if (id === userId) return 'Você'
  return names[id]?.trim() || 'Usuário ' + id.slice(0, 8)
}
export function contentDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Data não informada'
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date)
}
