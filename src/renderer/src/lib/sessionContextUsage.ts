import type { ChatTurn } from './aiClient'
import { estimateTokens } from './contextCompactor'

export interface ContextUsageRow {
  id: string
  label: string
  tokens: number
  color: string
}

/** Local estimates, partitioned without counting embedded sources twice. */
export function sessionContextUsage({
  messages,
  basePrompt,
  preparedPrompt,
  draft,
  attachments,
  driveContext = ''
}: {
  messages: ChatTurn[]
  basePrompt: string
  preparedPrompt?: string
  draft: string
  attachments: { content?: string; imageDataUrl?: string }[]
  driveContext?: string
}): ContextUsageRow[] {
  const rows: ContextUsageRow[] = [
    { id: 'messages', label: 'Mensagens', tokens: 0, color: '#3989e8' },
    { id: 'files', label: 'Arquivos e imagens', tokens: 0, color: '#db713b' },
    { id: 'drive', label: 'Fontes do drive', tokens: 0, color: '#ab8ee6' },
    { id: 'system', label: 'Instruções do agente', tokens: 0, color: '#999890' },
    { id: 'skills', label: 'Skills', tokens: 0, color: '#21a987' },
    { id: 'workbook', label: 'Workbook do cliente', tokens: 0, color: '#d2b866' },
    { id: 'runtime', label: 'Instruções e fontes da solicitação', tokens: 0, color: '#7e9eaa' },
    { id: 'summary', label: 'Histórico compactado', tokens: 0, color: '#bd8baf' },
    { id: 'draft', label: 'Rascunho e novos anexos', tokens: 0, color: '#748fdd' }
  ]
  const add = (id: string, tokens: number): void => {
    rows.find((row) => row.id === id)!.tokens += tokens
  }
  const includedDrive = new Set<string>()
  for (const message of messages) {
    for (const block of message.content.match(/<contexto-drive>[\s\S]*?<\/contexto-drive>/g) ?? [])
      includedDrive.add(block)
    let content = message.content
    const originalTokens = estimateTokens(content)
    let remainingTokens = originalTokens
    // Allocate the difference in estimates so rounding never inflates the total.
    for (const [id, pattern] of [
      ['files', /<attached-files>[\s\S]*?<\/attached-files>/g],
      ['drive', /<contexto-drive>[\s\S]*?<\/contexto-drive>/g]
    ] as const) {
      content = content.replace(pattern, '')
      const next = estimateTokens(content)
      add(id, remainingTokens - next)
      remainingTokens = next
    }
    add(
      content.startsWith('Histórico compactado de ') ? 'summary' : 'messages',
      remainingTokens + 8
    )
    add('files', ((message.imageDataUrls?.length ?? 0) + (message.imageDataUrl ? 1 : 0)) * 4096)
  }
  const prompt = preparedPrompt ?? basePrompt
  // The session prompt contains stable, application-owned section delimiters.
  const base = prompt.startsWith(basePrompt) ? basePrompt : prompt
  const markers = [
    { id: 'skills', index: base.indexOf('\n\n---\n\n## Skills disponíveis para esta sessão') },
    { id: 'workbook', index: base.indexOf('\n\n---\n\n## Workbook do cliente ') }
  ]
    .filter((marker) => marker.index >= 0)
    .sort((a, b) => a.index - b.index)
  let id = 'system',
    allocated = 0
  for (const marker of markers) {
    const cumulative = estimateTokens(base.slice(0, marker.index))
    add(id, cumulative - allocated)
    allocated = cumulative
    id = marker.id
  }
  add(id, estimateTokens(base) - allocated)
  add('runtime', estimateTokens(prompt) - estimateTokens(base))
  for (const block of driveContext.match(/<contexto-drive>[\s\S]*?<\/contexto-drive>/g) ?? []) {
    if (!includedDrive.has(block)) {
      add('drive', estimateTokens(block))
      includedDrive.add(block)
    }
  }
  add(
    'draft',
    estimateTokens(draft) +
      attachments.reduce(
        (sum, item) => sum + estimateTokens(item.content ?? '') + (item.imageDataUrl ? 4096 : 0),
        0
      )
  )
  return rows
}
