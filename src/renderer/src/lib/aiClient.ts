import { claudeTurn, openAiTurn, geminiTurn } from './imagePayload'
import { supabase } from '@renderer/lib/supabaseClient'
import type { AiProviderId } from '@renderer/lib/aiProviders'
import { contextSummarySchema, type ContextSummary } from '../../../shared/compaction'
import {
  ANTHROPIC_API_URL,
  claudeHeaders,
  claudeModelParams,
  claudeRefusalMessage,
  claudeWebTools
} from '@renderer/lib/claudeModels'

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
  /** Captura visual efêmera da janela SAP, somente no turno atual. */
  imageDataUrl?: string
  /** Imagens anexadas ao chat, mantidas em memória na sessão. */
  imageDataUrls?: string[]
}

export const CLAUDE_EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
export type ClaudeEffort = (typeof CLAUDE_EFFORT_LEVELS)[number]

export const CLAUDE_EFFORT_LABELS_PT: Record<ClaudeEffort, string> = {
  low: 'Baixo',
  medium: 'Médio',
  high: 'Alto',
  xhigh: 'Muito alto',
  max: 'Máximo'
}

export const ROUTER_MODEL = 'claude-haiku-5-5'

// Classificação curta: esforço baixo reduz latência; o orçamento inclui thinking.
const ROUTER_MAX_TOKENS = 2048

export async function countClaudeContext(args: { apiKey: string; model: string; messages: ChatTurn[]; prompt: string; signal: AbortSignal }): Promise<number | null> {
  try {
    const response = await fetch(`${ANTHROPIC_API_URL}/count_tokens`, { method: 'POST', signal: AbortSignal.any([args.signal, AbortSignal.timeout(10000)]), headers: claudeHeaders(args.apiKey, args.model), body: JSON.stringify({ model: args.model, ...(args.prompt ? { system: args.prompt } : {}), messages: args.messages.map(claudeTurn) }) })
    if (!response.ok) return null
    const data = await response.json()
    return Number.isSafeInteger(data.input_tokens) && data.input_tokens > 0 ? data.input_tokens : null
  } catch { args.signal.throwIfAborted(); return null }
}

export async function summarizeWithRouter(args: { apiKey: string; system: string; content: string; maxTokens: number; signal: AbortSignal }): Promise<{ summary: ContextSummary; inputTokens: number; outputTokens: number }> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST', signal: AbortSignal.any([args.signal, AbortSignal.timeout(90000)]),
    headers: claudeHeaders(args.apiKey, ROUTER_MODEL),
    body: JSON.stringify({ ...claudeModelParams(ROUTER_MODEL, { effort: 'low', maxTokens: args.maxTokens, thinkingMaxTokens: args.maxTokens * 2 }), system: args.system, messages: [{ role: 'user', content: args.content }] })
  })
  if (!response.ok) throw new Error(`Router indisponível para compactação (HTTP ${response.status}).`)
  const data = await response.json()
  if (data.stop_reason !== 'end_turn' || !Array.isArray(data.content)) throw new Error('O router não concluiu o resumo. O contexto original foi preservado.')
  const raw = data.content.filter((block: { type: string; text?: string }) => block.type === 'text' && typeof block.text === 'string').map((block: { text: string }) => block.text).join('').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const summary = contextSummarySchema.parse(JSON.parse(raw))
  return { summary, inputTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.cache_read_input_tokens ?? 0) + (data.usage?.cache_creation_input_tokens ?? 0), outputTokens: data.usage?.output_tokens ?? 0 }
}

async function requestRouter(
  claudeApiKey: string,
  system: string,
  content: string
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: claudeHeaders(claudeApiKey, ROUTER_MODEL),
      body: JSON.stringify({
        ...claudeModelParams(ROUTER_MODEL, {
          effort: 'low',
          maxTokens: ROUTER_MAX_TOKENS,
          thinkingMaxTokens: ROUTER_MAX_TOKENS
        }),
        system,
        messages: [{ role: 'user', content }]
      })
    })
    if (!response.ok) return null

    const data = await response.json()
    // Recusas e respostas truncadas não podem ativar agentes ou skills.
    if (data.stop_reason !== 'end_turn' || !Array.isArray(data.content)) return null
    const raw = data.content
      .filter(
        (block: { type?: string; text?: unknown } | null) =>
          block?.type === 'text' && typeof block.text === 'string'
      )
      .map((block: { text: string }) => block.text)
      .join('')
      .trim()
    if (!raw) return null
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    const parsed: unknown = JSON.parse(jsonMatch ? jsonMatch[0] : raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function routedSkillIds(value: unknown, skills: SkillCatalogEntry[]): string[] {
  if (!Array.isArray(value)) return []
  return [
    ...new Set(
      value.filter(
        (id): id is string => typeof id === 'string' && skills.some((skill) => skill.id === id)
      )
    )
  ].slice(0, 5)
}

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
  /**
   * Só Claude: ciclo de vida dos blocos de thinking. `start`/`stop` delimitam cada
   * bloco (é o que dirige a animação "Pensando…"); `delta` traz o resumo legível.
   */
  onThinking?: (event: ThinkingEvent) => void
  /** Só Claude: pede o resumo do raciocínio (display "summarized") para o onThinking. */
  claudeShowThinking?: boolean
  /** Só Claude: server tools cobradas à parte — pesquisa web (domínios SAP) e leitura de links. */
  claudeWebSearch?: boolean
  claudeWebFetch?: boolean
  /** Só Claude: chamadas/resultados das server tools e citações das fontes. */
  onServerTool?: (event: ServerToolEvent) => void
}

export type ThinkingEvent = { type: 'start' } | { type: 'delta'; text: string } | { type: 'stop' }

export type ServerToolEvent =
  | { type: 'call'; id: string; name: 'web_search' | 'web_fetch' | string; query?: string; url?: string }
  | { type: 'result'; id: string; ok: boolean; detail?: string }
  | { type: 'citation'; url: string; title: string }

interface ClaudeStreamEventJson {
  index: number
  content_block?: { type?: string; id?: string; name?: string; tool_use_id?: string; content?: unknown }
  delta?: { type?: string; partial_json?: string; citation?: { url?: unknown; title?: string } }
}

function handleClaudeServerToolEvent(
  event: string | undefined,
  json: ClaudeStreamEventJson,
  calls: Map<number, { id: string; name: string; json: string }>,
  emit: (event: ServerToolEvent) => void
): void {
  const block = json.content_block
  if (event === 'content_block_start' && block?.type === 'server_tool_use') {
    calls.set(json.index, { id: block.id ?? '', name: block.name ?? '', json: '' })
    return
  }
  if (event === 'content_block_delta' && json.delta?.type === 'input_json_delta') {
    const call = calls.get(json.index)
    if (call) call.json += json.delta.partial_json ?? ''
    return
  }
  if (event === 'content_block_delta' && json.delta?.type === 'citations_delta') {
    const citation = json.delta.citation
    if (typeof citation?.url === 'string') emit({ type: 'citation', url: citation.url, title: citation.title || citation.url })
    return
  }
  if (event === 'content_block_stop' && calls.has(json.index)) {
    const call = calls.get(json.index)!
    calls.delete(json.index)
    let input: { query?: string; url?: string } = {}
    try {
      input = JSON.parse(call.json || '{}')
    } catch {
      // input parcial — o evento sai sem query/url
    }
    emit({ type: 'call', id: call.id, name: call.name, query: input.query, url: input.url })
    return
  }
  if (event === 'content_block_start' && (block?.type === 'web_search_tool_result' || block?.type === 'web_fetch_tool_result')) {
    // Sucesso da busca: content é lista; erro (qualquer tool): objeto com error_code.
    const content = block.content
    const errorCode =
      content && !Array.isArray(content) && typeof (content as { error_code?: unknown }).error_code === 'string'
        ? (content as { error_code: string }).error_code
        : null
    const detail = errorCode
      ? errorCode
      : Array.isArray(content)
        ? `${content.length} resultado${content.length === 1 ? '' : 's'}`
        : undefined
    emit({ type: 'result', id: block.tool_use_id ?? '', ok: !errorCode, detail })
  }
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
      messages: messages.map(openAiTurn)
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
    contents: args.messages.map(geminiTurn)
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
  const webTools = claudeWebTools(args.model, {
    search: Boolean(args.claudeWebSearch),
    fetch: Boolean(args.claudeWebFetch)
  })
  const request = (tools: Record<string, unknown>[] | null): Promise<Response> =>
    fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      signal: args.signal,
      headers: claudeHeaders(args.apiKey, args.model),
      body: JSON.stringify({
        ...claudeModelParams(args.model, {
          effort: args.claudeEffort ?? 'medium',
          showThinking: Boolean(args.claudeShowThinking),
          maxTokens: 16000,
          thinkingMaxTokens: 32000
        }),
        stream: true,
        ...(tools ? { tools } : {}),
        ...(args.systemPrompt ? { system: args.systemPrompt } : {}),
        messages: args.messages.map(claudeTurn)
      })
    })

  let response = await request(webTools)
  if (!response.ok && webTools && response.status === 400) {
    // Organização sem pesquisa web habilitada no Console (ou tool indisponível):
    // a resposta não pode falhar por isso — refaz sem as server tools.
    const detail = await response.text()
    if (!/web_(search|fetch)/i.test(detail)) throw new Error(`Claude ${response.status}: ${detail}`)
    response = await request(null)
  }

  if (!response.ok) {
    throw new Error(`Claude ${response.status}: ${await response.text()}`)
  }

  let reason: FinishReason = 'stop'
  let inputTokens: number | null = null
  let outputTokens: number | null = null
  const openThinkingBlocks = new Set<number>()
  // server_tool_use: o input chega em pedaços (input_json_delta) até o content_block_stop.
  const serverToolCalls = new Map<number, { id: string; name: string; json: string }>()

  await readSse(
    response,
    ({ event, data }) => {
      if (event === 'error') {
        const detail = JSON.parse(data)
        throw new Error(`Claude: ${detail.error?.message ?? 'erro durante a geração da resposta'}`)
      }
      try {
        const json = JSON.parse(data)

        // text_delta é a resposta; thinking_delta é o resumo do raciocínio, entregue à
        // parte. Blocos "fallback" do roteamento server-side e signature_delta são ignorados.
        if (event === 'content_block_start' && json.content_block?.type === 'thinking') {
          openThinkingBlocks.add(json.index)
          args.onThinking?.({ type: 'start' })
        }

        if (event === 'content_block_delta') {
          if (json.delta?.type === 'text_delta' && typeof json.delta.text === 'string') {
            args.onDelta(json.delta.text)
          } else if (json.delta?.type === 'thinking_delta' && typeof json.delta.thinking === 'string') {
            args.onThinking?.({ type: 'delta', text: json.delta.thinking })
          }
        }

        if (event === 'content_block_stop' && openThinkingBlocks.delete(json.index)) {
          args.onThinking?.({ type: 'stop' })
        }

        if (args.onServerTool) handleClaudeServerToolEvent(event, json, serverToolCalls, args.onServerTool)

        if (event === 'message_start') {
          // Com prompt caching, input_tokens conta só a parte fora do cache; somamos
          // leitura e escrita de cache para as estatísticas refletirem o contexto enviado.
          const usage = json.message?.usage
          if (usage) {
            inputTokens =
              (usage.input_tokens ?? 0) +
              (usage.cache_read_input_tokens ?? 0) +
              (usage.cache_creation_input_tokens ?? 0)
          }
          outputTokens = usage?.output_tokens ?? outputTokens
        }

        if (event === 'message_delta') {
          outputTokens = json.usage?.output_tokens ?? outputTokens
          const stopReason = json.delta?.stop_reason
          // pause_turn: o loop server-side (pesquisa web) atingiu o limite de iterações.
          // Tratado como continuação — o chamador reenvia o texto parcial e pede para seguir.
          if (stopReason === 'max_tokens' || stopReason === 'pause_turn') reason = 'length'
          else if (stopReason === 'refusal') {
            reason = 'other'
            args.onDelta(`

> ${claudeRefusalMessage(json.delta?.stop_details?.category)}`)
          } else if (stopReason && stopReason !== 'end_turn' && stopReason !== 'stop_sequence') {
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

  const parsed = await requestRouter(
    claudeApiKey,
    'Você é o roteador de um harness de agentes SAP/ABAP. Dada a mensagem do usuário, responda APENAS com um JSON válido, sem nenhum texto fora dele, no formato exato: {"agent_id": "id exato do agente mais adequado do catálogo de agentes, ou null se nenhum servir bem", "skill_ids": ["ids do catálogo de skills diretamente relevantes ao pedido, no máximo 5, pode ser array vazio"]}. Nunca invente ids fora dos catálogos fornecidos.',
    `Catálogo de agentes:\n${agentCatalog}\n\nCatálogo de skills habilitadas:\n${skillCatalog || '(nenhuma)'}\n\nMensagem do usuário:\n${userMessage}`
  )
  if (!parsed) return { agentId: null, skillIds: [] }
  const agentId =
    typeof parsed.agent_id === 'string' && agents.some((agent) => agent.id === parsed.agent_id)
      ? parsed.agent_id
      : null
  return { agentId, skillIds: routedSkillIds(parsed.skill_ids, skills) }
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
  const parsed = await requestRouter(
    claudeApiKey,
    'Você classifica skills para uma sessão cujo agente já foi escolhido pelo usuário. Responda APENAS com JSON válido no formato exato: {"skill_ids":["ids diretamente relevantes, no máximo 5"]}. Nunca escolha, sugira ou altere o agente. Nunca invente ids.',
    `Catálogo de skills habilitadas:\n${skillCatalog}\n\nMensagem do usuário:\n${userMessage}`
  )
  return routedSkillIds(parsed?.skill_ids, skills)
}
