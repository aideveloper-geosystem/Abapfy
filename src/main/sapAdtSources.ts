import { ADTClient, type AbapObjectStructure } from 'abap-adt-api'
import { sapAdtPath } from '../shared/sapAdt'

export class SapAdtSourceError extends Error {}

/** Only sources returned by the SAP structure may be selected under an object lock. */
export function sapSourceCatalog(structure: AbapObjectStructure) {
  const main = sapAdtPath(ADTClient.mainInclude(structure))
  const sources = [{ name: 'main', sourcePath: main }]
  if ('includes' in structure) {
    for (const [name, value] of ADTClient.classIncludes(structure)) {
      const sourcePath = sapAdtPath(value)
      if (!sources.some((source) => source.sourcePath === sourcePath))
        sources.push({ name, sourcePath })
    }
  }
  return sources
}
export function selectSapSource(structure: AbapObjectStructure, requested?: string): string {
  const sources = sapSourceCatalog(structure)
  if (!requested) return sources[0].sourcePath
  const path = sapAdtPath(requested)
  if (!sources.some((source) => source.sourcePath === path))
    throw new SapAdtSourceError(
      'A fonte não pertence à estrutura deste objeto. Use list_sources e o sourcePath retornado pelo SAP.'
    )
  return path
}
export interface SourceEdit {
  oldText: string
  newText: string
}
/** Every replacement refers to the same original, so insertions cannot accidentally match later edits. */
export function applySourceEdits(before: string, args: Record<string, unknown>) {
  if (args.edits && (args.oldText !== undefined || args.newText !== undefined))
    throw new Error('Use edits ou oldText/newText, sem combinar os dois formatos.')
  const edits = (args.edits ?? [{ oldText: args.oldText, newText: args.newText }]) as SourceEdit[]
  if (!Array.isArray(edits) || !edits.length || edits.length > 30)
    throw new Error('Informe de 1 a 30 alterações.')
  const located = edits
    .map((edit) => {
      if (
        typeof edit.oldText !== 'string' ||
        !edit.oldText.length ||
        typeof edit.newText !== 'string'
      )
        throw new Error('Cada alteração exige oldText e newText.')
      const start = before.indexOf(edit.oldText)
      if (start < 0 || start !== before.lastIndexOf(edit.oldText))
        throw new Error(
          'O texto original deve corresponder a exatamente uma ocorrência na fonte. Amplie o trecho para desambiguar.'
        )
      return {
        ...edit,
        start,
        end: start + edit.oldText.length,
        startLine: before.slice(0, start).split('\n').length
      }
    })
    .sort((a, b) => a.start - b.start)
  if (located.some((edit, i) => i > 0 && edit.start < located[i - 1].end))
    throw new Error('As alterações se sobrepõem. Prepare trechos independentes.')
  let after = before
  for (const edit of [...located].reverse())
    after = after.slice(0, edit.start) + edit.newText + after.slice(edit.end)
  if (after === before) throw new Error('A alteração não modifica a fonte.')
  return { after, changes: located }
}
