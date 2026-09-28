import { supabase } from '@renderer/lib/supabaseClient'
import type { AiProviderId } from '@renderer/lib/aiProviders'

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export const CLAUDE_EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh'] as const
export type ClaudeEffort = (typeof CLAUDE_EFFORT_LEVELS)[number]

export const CLAUDE_EFFORT_LABELS_PT: Record<ClaudeEffort, string> = {
  low: 'Baixo',
  medium: 'Médio',
  high: 'Alto',
  xhigh: 'Máximo'
}

export const ROUTER_MODEL = 'claude-haiku-4-5-20251001'

export type FinishReason = 'stop' | 'length' | 'other'

export interface StreamFinishInfo {
  reason: FinishReason
  inputTokens: number | null
  outputTokens: number | null
}

interface StreamChatArgs {
  provider: AiProviderId
  model: string
  apiKey: string
  messages: ChatTurn[]
  systemPrompt?: string
  onDelta: (text: string) => void
  onFinish?: (info: StreamFinishInfo) => void
  signal: AbortSignal
  /** Só se aplica ao provedor Claude — controla o output_config.effort (adaptive thinking). */
  claudeEffort?: ClaudeEffort
}

export async function fetchApiKey(userId: string, provider: AiProviderId): Promise<string | null> {
  const { data, error } = await supabase
    .from('ai_api_keys')
    .select('api_key')
    .eq('user_id', userId)
    .eq('provider', provider)
    .single()

  if (error || !data) return null
  return data.api_key as string
}

interface SseEvent {
  event?: string
  data: string
}

async function readSse(
  response: Response,
  onEvent: (event: SseEvent) => void,
  signal: AbortSignal
): Promise<void> {
  if (!response.body) throw new Error('O provedor não retornou um fluxo de resposta.')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  signal.addEventListener('abort', () => reader.cancel().catch(() => undefined))

  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    buffer = buffer.replace(/\r\n/g, '\n')

    let separatorIndex: number
    while ((separatorIndex = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, separatorIndex)
      buffer = buffer.slice(separatorIndex + 2)

      let event: string | undefined
      const dataLines: string[] = []
      for (const line of rawEvent.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
      }
      if (dataLines.length) onEvent({ event, data: dataLines.join('\n') })
    }
  }
  if (buffer.trim()) {
    const dataLines = buffer.split('\n').filter((line) => line.startsWith('data:'))
    if (dataLines.length) onEvent({ data: dataLines.map((line) => line.slice(5).trim()).join('\n') })
  }
}

async function streamOpenAi(args: StreamChatArgs): Promise<void> {
  const messages = args.systemPrompt
    ? [{ role: 'system', content: args.systemPrompt }, ...args.messages]
    : args.messages

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal: args.signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.apiKey}`
    },
    body: JSON.stringify({
      model: args.model,
      stream: true,
      stream_options: { include_usage: true },
      messages: messages.map((turn) => ({ role: turn.role, content: turn.content }))
    })
  })

  if (!response.ok) {
    throw new Error(`OpenAI ${response.status}: ${await response.text()}`)
  }

  let reason: FinishReason = 'stop'
  let inputTokens: number | null = null
  let outputTokens: number | null = null

  await readSse(
    response,
    ({ data }) => {
      if (data === '[DONE]') return
      try {
        const json = JSON.parse(data)
        const delta = json.choices?.[0]?.delta?.content
        if (typeof delta === 'string') args.onDelta(delta)

        const finishReason = json.choices?.[0]?.finish_reason
        if (finishReason === 'length') reason = 'length'
        else if (finishReason && finishReason !== 'stop') reason = 'other'

        if (json.usage) {
          inputTokens = json.usage.prompt_tokens ?? inputTokens
          outputTokens = json.usage.completion_tokens ?? outputTokens
        }
      } catch {
        // linha não-JSON — ignora, resposta continua no próximo chunk
      }
    },
    args.signal
  )

  args.onFinish?.({ reason, inputTokens, outputTokens })
}

async function streamGemini(args: StreamChatArgs): Promise<void> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${args.model}:streamGenerateContent?alt=sse&key=${args.apiKey}`

  const body: Record<string, unknown> = {
    contents: args.messages.map((turn) => ({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: turn.content }]
    }))
  }
  if (args.systemPrompt) {
    body.systemInstruction = { parts: [{ text: args.systemPrompt }] }
  }

  const response = await fetch(url, {
    method: 'POST',
    signal: args.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    throw new Error(`Gemini ${response.status}: ${await response.text()}`)
  }

  let reason: FinishReason = 'stop'
  let inputTokens: number | null = null
  let outputTokens: number | null = null

  await readSse(
    response,
    ({ data }) => {
      try {
        const json = JSON.parse(data)
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text
        if (typeof text === 'string') args.onDelta(text)

        const finishReason = json.candidates?.[0]?.finishReason
        if (finishReason === 'MAX_TOKENS') reason = 'length'
        else if (finishReason && finishReason !== 'STOP') reason = 'other'

        if (json.usageMetadata) {
          inputTokens = json.usageMetadata.promptTokenCount ?? inputTokens
          outputTokens = json.usageMetadata.candidatesTokenCount ?? outputTokens
        }
      } catch {
        // linha não-JSON — ignora
      }
    },
    args.signal
  )

  args.onFinish?.({ reason, inputTokens, outputTokens })
}

async function streamClaude(args: StreamChatArgs): Promise<void> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: args.signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': args.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: args.model,
      max_tokens: 16000,
      stream: true,
      thinking: { type: 'adaptive' },
      output_config: { effort: args.claudeEffort ?? 'medium' },
      ...(args.systemPrompt ? { system: args.systemPrompt } : {}),
      messages: args.messages.map((turn) => ({ role: turn.role, content: turn.content }))
    })
  })

  if (!response.ok) {
    throw new Error(`Claude ${response.status}: ${await response.text()}`)
  }

  let reason: FinishReason = 'stop'
  let inputTokens: number | null = null
  let outputTokens: number | null = null

  await readSse(
    response,
    ({ event, data }) => {
      if (event === 'error') {
        const detail = JSON.parse(data)
        throw new Error(`Claude: ${detail.error?.message ?? 'erro durante a geração da resposta'}`)
      }
      try {
        const json = JSON.parse(data)

        if (event === 'content_block_delta') {
          const text = json.delta?.text
          if (typeof text === 'string') args.onDelta(text)
        }

        if (event === 'message_start') {
          inputTokens = json.message?.usage?.input_tokens ?? inputTokens
          outputTokens = json.message?.usage?.output_tokens ?? outputTokens
        }

        if (event === 'message_delta') {
          outputTokens = json.usage?.output_tokens ?? outputTokens
          const stopReason = json.delta?.stop_reason
          if (stopReason === 'max_tokens') reason = 'length'
          else if (stopReason && stopReason !== 'end_turn' && stopReason !== 'stop_sequence') {
            reason = 'other'
          }
        }
      } catch {
        // linha não-JSON — ignora
      }
    },
    args.signal
  )

  args.onFinish?.({ reason, inputTokens, outputTokens })
}

export async function streamChat(args: StreamChatArgs): Promise<void> {
  switch (args.provider) {
    case 'openai':
      return streamOpenAi(args)
    case 'gemini':
      return streamGemini(args)
    case 'claude':
      return streamClaude(args)
    default:
      throw new Error(`Provedor desconhecido: ${args.provider}`)
  }
}

export interface AgentCatalogEntry {
  id: string
  name: string
  description: string
}

export interface SkillCatalogEntry {
  id: string
  name: string
  description: string
}

export interface RouteResult {
  agentId: string | null
  skillIds: string[]
}

/**
 * Roteador do harness: usa sempre Claude Haiku (não-streaming) para, numa
 * única chamada, (1) classificar a mensagem inicial do usuário e ativar o
 * agente mais adequado do catálogo e (2) apontar quais skills habilitadas
 * são relevantes para o pedido — ambas ficam disponíveis para o agente
 * naquela sessão (ver montagem do system prompt em HomeScreen). Requer uma
 * chave Claude configurada — sem ela, o roteamento é pulado (fallback no
 * chamador).
 */
export async function routeConversation(
  claudeApiKey: string,
  userMessage: string,
  agents: AgentCatalogEntry[],
  skills: SkillCatalogEntry[]
): Promise<RouteResult> {
  if (agents.length === 0) return { agentId: null, skillIds: [] }

  const agentCatalog = agents
    .map((agent) => `- ${agent.id}: ${agent.name} — ${agent.description}`)
    .join('\n')
  const skillCatalog = skills
    .map((skill) => `- ${skill.id}: ${skill.name} — ${skill.description}`)
    .join('\n')

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': claudeApiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: ROUTER_MODEL,
      max_tokens: 300,
      system:
        'Você é o roteador de um harness de agentes SAP/ABAP. Dada a mensagem do usuário, responda APENAS com um JSON válido, sem nenhum texto fora dele, no formato exato: {"agent_id": "id exato do agente mais adequado do catálogo de agentes, ou null se nenhum servir bem", "skill_ids": ["ids do catálogo de skills diretamente relevantes ao pedido, no máximo 5, pode ser array vazio"]}. Nunca invente ids fora dos catálogos fornecidos.',
      messages: [
        {
          role: 'user',
          content: `Catálogo de agentes:\n${agentCatalog}\n\nCatálogo de skills habilitadas:\n${skillCatalog || '(nenhuma)'}\n\nMensagem do usuário:\n${userMessage}`
        }
      ]
    })
  })

  if (!response.ok) return { agentId: null, skillIds: [] }

  try {
    const data = await response.json()
    const raw: string = data.content?.[0]?.text?.trim() ?? '{}'
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw)

    const agentId =
      typeof parsed.agent_id === 'string' && agents.some((agent) => agent.id === parsed.agent_id)
        ? parsed.agent_id
        : null

    const skillIds: string[] = Array.isArray(parsed.skill_ids)
      ? parsed.skill_ids.filter(
          (id: unknown) => typeof id === 'string' && skills.some((skill) => skill.id === id)
        )
      : []

    return { agentId, skillIds }
  } catch {
    return { agentId: null, skillIds: [] }
  }
}

/** Classifica somente skills quando o usuário já fixou o agente no composer. */
export async function routeSkills(
  claudeApiKey: string,
  userMessage: string,
  skills: SkillCatalogEntry[]
): Promise<string[]> {
  if (skills.length === 0) return []

  const skillCatalog = skills
    .map((skill) => `- ${skill.id}: ${skill.name} — ${skill.description}`)
    .join('\n')
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': claudeApiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: ROUTER_MODEL,
      max_tokens: 220,
      system:
        'Você classifica skills para uma sessão cujo agente já foi escolhido pelo usuário. Responda APENAS com JSON válido no formato exato: {"skill_ids":["ids diretamente relevantes, no máximo 5"]}. Nunca escolha, sugira ou altere o agente. Nunca invente ids.',
      messages: [
        {
          role: 'user',
          content: `Catálogo de skills habilitadas:\n${skillCatalog}\n\nMensagem do usuário:\n${userMessage}`
        }
      ]
    })
  })

  if (!response.ok) return []
  try {
    const data = await response.json()
    const raw: string = data.content?.[0]?.text?.trim() ?? '{}'
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw)
    return Array.isArray(parsed.skill_ids)
      ? parsed.skill_ids.filter(
          (id: unknown) => typeof id === 'string' && skills.some((skill) => skill.id === id)
        )
      : []
  } catch {
    return []
  }
}
