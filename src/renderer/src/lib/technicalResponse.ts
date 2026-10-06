import type { StructuredValue } from './structuredResponse'

export type TechnicalResponseKind = 'review' | 'enhancement' | 'performance'
export function technicalResponseKind(
  data: Record<string, StructuredValue>
): TechnicalResponseKind | null {
  if (Array.isArray(data.findings) && Array.isArray(data.files_analyzed)) return 'review'
  if (Array.isArray(data.issues) && 'score' in data) return 'performance'
  if (Array.isArray(data.recommendations) && 'additional_notes' in data) return 'enhancement'
  return null
}

export function technicalRecords(
  value: StructuredValue | undefined
): Record<string, StructuredValue>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, StructuredValue> =>
          item !== null && typeof item === 'object' && !Array.isArray(item)
      )
    : []
}

export function technicalLocation(item: Record<string, StructuredValue>): string {
  const file = typeof item.file === 'string' ? item.file : ''
  const start =
    typeof item.line_start === 'number' && Number.isInteger(item.line_start) && item.line_start > 0
      ? item.line_start
      : null
  const end =
    typeof item.line_end === 'number' &&
    Number.isInteger(item.line_end) &&
    item.line_end >= (start ?? 1)
      ? item.line_end
      : null
  if (start)
    return `${file || 'Arquivo a confirmar'} · linha ${start}${end && end > start ? `–${end}` : ''}`
  return file
    ? `${file} · linha a confirmar`
    : typeof item.line_hint === 'string'
      ? item.line_hint
      : 'Localização a confirmar'
}
