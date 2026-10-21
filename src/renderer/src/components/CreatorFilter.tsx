import { creatorLabel, type OwnerFilter } from '@renderer/lib/contentOwnership'
export function CreatorFilter({
  value,
  onChange,
  ids,
  names,
  userId,
  label
}: {
  value: OwnerFilter
  onChange: (value: OwnerFilter) => void
  ids: (string | null | undefined)[]
  names: Record<string, string>
  userId?: string
  label: string
}): JSX.Element {
  const selectedId = value.startsWith('user:') ? value.slice(5) : null
  const authors = [...new Set([...ids, selectedId].filter((id): id is string => Boolean(id)))].sort(
    (a, b) => creatorLabel(a, names, userId).localeCompare(creatorLabel(b, names, userId), 'pt-BR')
  )
  return (
    <label className="content-creator-filter">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as OwnerFilter)}>
        <option value="all">Todos os criadores</option>
        <option value="mine">Criados por mim</option>
        <option value="team">Outras pessoas</option>
        <option value="unknown">Sem autoria informada</option>
        <optgroup label="Por pessoa">
          {authors.map((id) => (
            <option key={id} value={'user:' + id}>
              {creatorLabel(id, names, userId)}
            </option>
          ))}
        </optgroup>
      </select>
    </label>
  )
}
