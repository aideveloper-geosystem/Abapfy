import { z } from 'zod'

const modelSchema = z
  .object({
    provider: z.enum(['claude', 'openai', 'gemini']),
    model: z.string().trim().max(160),
    effort: z.enum(['low', 'medium', 'high', 'max']).default('medium')
  })
  .strict()
export const flowAgentSchema = modelSchema
  .extend({
    id: z.string().min(1).max(80),
    name: z.string().trim().min(1).max(80),
    instructions: z.string().trim().min(1).max(12000),
    enabled: z.boolean(),
    tools: z.enum(['none', 'read', 'inherit'])
  })
  .strict()
export const HOOK_EVENTS = {
  session_start: 'Ao iniciar o fluxo',
  before_delegate: 'Antes de delegar',
  after_delegate: 'Ao concluir um subagente',
  after_edit: 'Após editar fonte ADT',
  before_answer: 'Antes da resposta final'
} as const
export const HOOK_ACTIONS = {
  instructions: 'Aplicar instruções',
  checkpoint: 'Registrar progresso',
  require_evidence: 'Exigir leitura de fonte ou dados',
  syntax_check: 'Validar sintaxe inativa no ADT'
} as const
export const flowHookSchema = z
  .object({
    id: z.string().min(1).max(80),
    name: z.string().trim().min(1).max(80),
    enabled: z.boolean(),
    event: z.enum([
      'session_start',
      'before_delegate',
      'after_delegate',
      'after_edit',
      'before_answer'
    ]),
    action: z.enum(['instructions', 'checkpoint', 'require_evidence', 'syntax_check']),
    instructions: z.string().max(6000)
  })
  .strict()
  .superRefine((hook, ctx) => {
    if (hook.action === 'syntax_check' && hook.event !== 'after_edit')
      ctx.addIssue({
        code: 'custom',
        message: 'Validação de sintaxe só pode ocorrer após edição ADT.'
      })
    if (hook.action === 'require_evidence' && hook.event !== 'before_answer')
      ctx.addIssue({
        code: 'custom',
        message: 'Exigir evidência só pode ocorrer antes da resposta final.'
      })
    if (
      hook.action === 'instructions' &&
      (!hook.instructions.trim() || hook.event === 'after_edit')
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Informe instruções e escolha um evento de conversa.'
      })
  })
export const advancedFlowSchema = z
  .object({
    version: z.literal(1),
    enabled: z.boolean(),
    name: z.string().trim().min(1).max(100),
    orchestrator: modelSchema
      .extend({
        instructions: z.string().max(12000),
        tools: z.enum(['none', 'read', 'inherit']).default('inherit')
      })
      .strict(),
    agents: z.array(flowAgentSchema).max(8),
    hooks: z.array(flowHookSchema).max(20),
    stages: z
      .array(
        z
          .object({
            id: z.string().min(1).max(80),
            name: z.string().trim().min(1).max(100),
            instructions: z.string().trim().min(1).max(6000),
            agentIds: z.array(z.string().min(1)).min(1).max(8),
            enabled: z.boolean()
          })
          .strict()
      )
      .max(20)
      .default([]),
    maxParallel: z.number().int().min(1).max(4),
    maxDelegations: z.number().int().min(1).max(20),
    maxRounds: z.number().int().min(2).max(64),
    maxOutputTokens: z.number().int().min(1024).max(32000),
    timeoutMinutes: z.number().int().min(1).max(10)
  })
  .strict()
  .superRefine((flow, ctx) => {
    if (new Set(flow.stages.map((s) => s.id)).size !== flow.stages.length)
      ctx.addIssue({ code: 'custom', message: 'As etapas devem ter identificadores únicos.' })
    for (const stage of flow.stages.filter((s) => s.enabled)) {
      if (
        new Set(stage.agentIds).size !== stage.agentIds.length ||
        stage.agentIds.some((id) => !flow.agents.some((a) => a.id === id && a.enabled))
      )
        ctx.addIssue({
          code: 'custom',
          message: `Etapa ${stage.name}: selecione especialistas ativos, sem duplicações.`
        })
    }
    if (
      flow.stages.filter((s) => s.enabled).reduce((n, s) => n + s.agentIds.length, 0) >
      flow.maxDelegations
    )
      ctx.addIssue({
        code: 'custom',
        message: 'As etapas excedem o limite de delegações do fluxo.'
      })
    if (
      new Set(flow.agents.map((a) => a.id)).size !== flow.agents.length ||
      new Set(flow.hooks.map((h) => h.id)).size !== flow.hooks.length
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Identificadores de agentes e hooks devem ser únicos.'
      })
    if (flow.enabled && (!flow.orchestrator.model || !flow.agents.some((a) => a.enabled)))
      ctx.addIssue({
        code: 'custom',
        message: 'Selecione o orquestrador e habilite ao menos um subagente.'
      })
    if (flow.agents.some((a) => a.enabled && !a.model))
      ctx.addIssue({
        code: 'custom',
        message: 'Selecione um modelo para cada subagente habilitado.'
      })
  })
export type AdvancedFlow = z.infer<typeof advancedFlowSchema>
export type FlowAgent = z.infer<typeof flowAgentSchema>
export type FlowHook = z.infer<typeof flowHookSchema>
export const DEFAULT_ADVANCED_FLOW: AdvancedFlow = {
  version: 1,
  enabled: false,
  name: 'Meu fluxo de agentes',
  orchestrator: {
    provider: 'claude',
    model: '',
    effort: 'medium',
    tools: 'inherit',
    instructions:
      'Divida tarefas independentes entre os especialistas configurados. Confira as evidências e consolide a resposta. Delegue somente quando isso ajudar o pedido.'
  },
  agents: [],
  hooks: [],
  stages: [],
  maxParallel: 2,
  maxDelegations: 6,
  maxRounds: 16,
  maxOutputTokens: 8000,
  timeoutMinutes: 10
}

export function parseAdvancedFlow(value: unknown): AdvancedFlow {
  return advancedFlowSchema.parse(value)
}
