import { z } from 'zod'

export const compactionSettingsSchema = z.object({
  automatic: z.boolean(),
  inputBudget: z.number().int().min(8000).max(256000),
  triggerPercent: z.number().int().min(40).max(90),
  recentTurns: z.number().int().min(2).max(12),
  summaryTokens: z.number().int().min(1024).max(4096)
})
export type CompactionSettings = z.infer<typeof compactionSettingsSchema>
export const DEFAULT_COMPACTION: CompactionSettings = {
  automatic: true,
  inputBudget: 64000,
  triggerPercent: 70,
  recentTurns: 4,
  summaryTokens: 2048
}

const items = z.array(z.string().max(4000)).max(40)
export const contextSummarySchema = z
  .object({
    objective: z.string().min(1).max(6000),
    facts: items,
    decisions: items,
    constraints: items,
    corrections: items,
    identifiers: items,
    pending: items,
    uncertainties: items
  })
  .strict()
export type ContextSummary = z.infer<typeof contextSummarySchema>
export const contextSnapshotSchema = z
  .object({
    version: z.literal(1),
    coveredCount: z.number().int().positive().max(100000),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    summary: contextSummarySchema,
    createdAt: z.string().datetime(),
    model: z.string().max(120),
    beforeTokens: z.number().int().nonnegative(),
    afterTokens: z.number().int().nonnegative(),
    routerInputTokens: z.number().int().nonnegative(),
    routerOutputTokens: z.number().int().nonnegative(),
    references: z
      .array(
        z.object({
          turn: z.number().int().nonnegative(),
          identifiers: z.array(z.string().max(200)).max(30)
        })
      )
      .max(1000)
  })
  .strict()
export type ContextSnapshot = z.infer<typeof contextSnapshotSchema>
export interface CompactionActivity {
  beforeTokens: number
  afterTokens: number
  coveredCount: number
  model: string
  summary: ContextSummary
}
