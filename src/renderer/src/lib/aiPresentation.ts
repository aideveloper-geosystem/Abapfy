import { z } from 'zod'

const label = z.string().trim().min(1).max(500)
const cell = z.union([z.string().max(10000), z.number().finite(), z.boolean(), z.null()])
const table = z
  .object({
    type: z.literal('records'),
    title: label,
    columns: z.array(label).min(1).max(12),
    rows: z.array(z.array(cell).max(12)).max(200)
  })
  .refine((value) => value.rows.every((row) => row.length === value.columns.length))
const block = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('recommendation'),
    title: label,
    description: label,
    evidence: label,
    confidence: z.enum(['high', 'medium', 'low']).optional(),
    action: label.optional(),
    alternatives: z.array(label).max(6).optional()
  }),
  z.object({
    type: z.literal('insights'),
    title: label,
    items: z
      .array(z.object({ label, value: cell, detail: label, source: label }))
      .min(1)
      .max(12)
  }),
  z.object({
    type: z.literal('flow'),
    title: label,
    steps: z
      .array(
        z.object({
          title: label,
          description: label,
          kind: z.enum(['trigger', 'action', 'condition']),
          branches: z.array(label).max(4).optional()
        })
      )
      .min(1)
      .max(24)
  }),
  z.object({
    type: z.literal('diff'),
    title: label,
    changes: z
      .array(z.object({ field: label, before: cell, after: cell, reason: label }))
      .min(1)
      .max(100)
  })
])
export const aiPresentationSchema = z.object({
  version: z.literal(1),
  blocks: z
    .array(z.union([block, table]))
    .min(1)
    .max(12),
  followUps: z.array(label).max(4).optional()
})
export type AiPresentationData = z.infer<typeof aiPresentationSchema>
export type AiPresentationBlock = AiPresentationData['blocks'][number]

/** Only explicitly marked, bounded payloads become interactive UI. Invalid data stays readable as code. */
export function parseAiPresentation(content: string): AiPresentationData | null {
  if (content.length > 500000) return null
  try {
    const result = aiPresentationSchema.safeParse(JSON.parse(content))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

export function displayCell(value: string | number | boolean | null): string {
  return value === null
    ? 'A confirmar'
    : typeof value === 'boolean'
      ? value
        ? 'Sim'
        : 'Não'
      : String(value)
}

export const AI_PRESENTATION_CONTRACT = `
## Apresentação opcional da resposta
Preserve sempre os contratos de saída do agente (EF, DTec, estimativa, revisão, customizing e clarify têm prioridade).
Somente em respostas livres, quando uma tabela, proposta, indicador ou fluxo ajudar, você pode incluir um bloco cercado com linguagem ai-ui e JSON no formato:
{"version":1,"blocks":[...],"followUps":["Pergunta contextual opcional"]}.
Tipos de blocks:
- records: {"type":"records","title":"...","columns":["Coluna"],"rows":[["Valor"]]} (mesma quantidade de células e colunas).
- recommendation: {"type":"recommendation","title":"...","description":"...","evidence":"Base e limitações","confidence":"high|medium|low" opcional,"action":"Pedido para discutir a proposta" opcional,"alternatives":["..."] opcional}.
- insights: {"type":"insights","title":"...","items":[{"label":"...","value":123,"detail":"...","source":"Origem e limitações"}]}.
- flow: {"type":"flow","title":"...","steps":[{"title":"...","description":"...","kind":"trigger|action|condition","branches":["Se sim: ...","Se não: ..."] opcional}]}.
- diff: {"type":"diff","title":"...","changes":[{"field":"...","before":"...","after":"...","reason":"..."}]}.
Use apenas dados do contexto ou ferramentas; nunca invente indicadores, evidência ou confiança. Use null para valores desconhecidos. Não use estes cards para autorizar ferramentas. As ações apenas preparam um novo pedido no compositor e não executam a proposta.
Limites: 12 blocks, 12 colunas, 200 linhas, 24 etapas, 100 alterações e 4 followUps. Não gere ai-ui quando não acrescentar valor.
`
