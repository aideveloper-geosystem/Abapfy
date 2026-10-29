import type { ServerToolEvent } from './aiClient'
import {
  recoverProvider,
  providerHttpError,
  ProviderRequestError,
  type RecoveryOptions
} from './providerRecovery'

interface Usage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}
export interface ClaudeBlock extends Record<string, unknown> {
  type: string
  id?: string
  name?: string
  text?: string
  thinking?: string
  signature?: string
  input?: Record<string, unknown>
  content?: unknown
  tool_use_id?: string
}
export interface ClaudeMessageResponse {
  content?: ClaudeBlock[]
  stop_reason?: string | null
  incompleteTool?: boolean
  usage?: Usage
}
type ClaudeEvent =
  | { type: 'message_start'; message?: { usage?: Usage } }
  | { type: 'content_block_start'; index: number; content_block: ClaudeBlock }
  | {
      type: 'content_block_delta'
      index: number
      delta: {
        type: string
        text?: string
        thinking?: string
        signature?: string
        partial_json?: string
        citation?: { url?: string; title?: string }
      }
    }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_delta'; delta?: { stop_reason?: string }; usage?: Usage }
  | { type: 'message_stop' | 'ping' }
  | { type: 'error'; error?: { type?: string; message?: string } }

interface ClaudeCallbacks {
  onServerTool?: (event: ServerToolEvent) => void
  onThinking?: (
    event: { type: 'start' } | { type: 'stop' } | { type: 'delta'; text: string }
  ) => void
  onText?: (text: string) => void
  onUsage?: (input: number, output: number) => void
}
/** Assemble a complete Messages response, retaining signed thinking and tool blocks for continuation. */
export async function claudeMessage(
  request: () => Promise<Response>,
  options: RecoveryOptions & ClaudeCallbacks
): Promise<ClaudeMessageResponse> {
  return recoverProvider(async () => {
    const response = await request()
    if (!response.ok) throw await providerHttpError(response, 'Claude')
    if (!response.body?.getReader) {
      const data = (await response.json()) as ClaudeMessageResponse
      const usage = data.usage
      if (usage)
        options.onUsage?.(
          (usage.input_tokens ?? 0) +
            (usage.cache_read_input_tokens ?? 0) +
            (usage.cache_creation_input_tokens ?? 0),
          usage.output_tokens ?? 0
        )
      return data
    }
    const reader = response.body.getReader(),
      decoder = new TextDecoder()
    const content: ClaudeBlock[] = [],
      inputs = new Map<number, string>(),
      thinking = new Set<number>()
    let buffer = '',
      stopped = false,
      stopReason: string | null = null,
      inputTokens = 0,
      outputTokens = 0
    const abort = () => {
      void reader.cancel().catch(() => undefined)
    }
    options.signal.addEventListener('abort', abort, { once: true })
    function receive(raw: string) {
      const data = raw
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n')
      if (!data) return
      const value = JSON.parse(data) as ClaudeEvent
      if (value.type === 'error')
        throw new ProviderRequestError(
          `Claude: ${value.error?.message ?? 'falha no fluxo'}`,
          0,
          value.error?.type ?? 'api_error'
        )
      if (value.type === 'message_start') {
        const usage = value.message?.usage
        inputTokens =
          (usage?.input_tokens ?? 0) +
          (usage?.cache_read_input_tokens ?? 0) +
          (usage?.cache_creation_input_tokens ?? 0)
        outputTokens = usage?.output_tokens ?? 0
      }
      if (value.type === 'content_block_start') {
        content[value.index] = { ...value.content_block }
        if (
          value.content_block.type === 'tool_use' ||
          value.content_block.type === 'server_tool_use'
        )
          inputs.set(value.index, '')
        if (String(value.content_block.type).endsWith('_tool_result')) {
          const c = value.content_block.content
          const errorCode =
            c &&
            typeof c === 'object' &&
            !Array.isArray(c) &&
            'error_code' in c &&
            typeof c.error_code === 'string'
              ? c.error_code
              : undefined
          options.onServerTool?.({
            type: 'result',
            id: value.content_block.tool_use_id ?? '',
            ok: !errorCode,
            detail: errorCode ?? (Array.isArray(c) ? `${c.length} resultado(s)` : undefined)
          })
        }
        if (value.content_block.type === 'thinking') {
          thinking.add(value.index)
          options.onThinking?.({ type: 'start' })
        }
      }
      if (value.type === 'content_block_delta') {
        const block = content[value.index],
          delta = value.delta
        if (!block)
          throw new ProviderRequestError(
            'Claude: bloco de resposta incompleto.',
            502,
            'stream_interrupted'
          )
        if (delta.type === 'text_delta' && typeof delta.text === 'string') {
          block.text = (block.text ?? '') + delta.text
          options.onText?.(delta.text)
        }
        if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
          block.thinking = (block.thinking ?? '') + delta.thinking
          options.onThinking?.({ type: 'delta', text: delta.thinking })
        }
        if (delta.type === 'signature_delta')
          block.signature = (block.signature ?? '') + (delta.signature ?? '')
        if (delta.type === 'input_json_delta')
          inputs.set(value.index, (inputs.get(value.index) ?? '') + (delta.partial_json ?? ''))
      }
      if (value.type === 'content_block_stop' && content[value.index]?.type === 'server_tool_use') {
        const block = content[value.index]
        let input: { query?: string; url?: string } = {}
        try {
          input = JSON.parse(inputs.get(value.index) || '{}')
        } catch {
          /* Complete provider response is validated below. */
        }
        options.onServerTool?.({
          type: 'call',
          id: block.id ?? '',
          name: block.name ?? '',
          query: input.query,
          url: input.url
        })
      }
      if (
        value.type === 'content_block_delta' &&
        value.delta?.type === 'citations_delta' &&
        typeof value.delta.citation?.url === 'string'
      )
        options.onServerTool?.({
          type: 'citation',
          url: value.delta.citation.url,
          title: value.delta.citation.title ?? value.delta.citation.url
        })
      if (value.type === 'content_block_stop' && thinking.delete(value.index))
        options.onThinking?.({ type: 'stop' })
      if (value.type === 'message_delta') {
        stopReason = value.delta?.stop_reason ?? stopReason
        outputTokens = value.usage?.output_tokens ?? outputTokens
      }
      if (value.type === 'message_stop') stopped = true
    }
    try {
      for (;;) {
        options.signal.throwIfAborted()
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        buffer = buffer.replace(/\r\n/g, '\n')
        let at: number
        while ((at = buffer.indexOf('\n\n')) >= 0) {
          const event = buffer.slice(0, at)
          buffer = buffer.slice(at + 2)
          receive(event)
        }
      }
      buffer += decoder.decode()
      if (buffer.trim()) receive(buffer)
      options.signal.throwIfAborted()
      if (!stopped)
        throw new ProviderRequestError(
          'Claude: fluxo interrompido antes da conclusão.',
          502,
          'stream_interrupted'
        )
      let incompleteTool = false
      for (const [index, raw] of inputs) {
        if (!raw) continue
        try {
          content[index].input = JSON.parse(raw)
        } catch {
          incompleteTool = true
        }
      }
      if (incompleteTool && stopReason !== 'max_tokens')
        throw new ProviderRequestError(
          'Claude: argumentos de ferramenta incompletos.',
          502,
          'stream_interrupted'
        )
      return {
        content: content.filter(Boolean),
        stop_reason: stopReason,
        incompleteTool,
        usage: { input_tokens: inputTokens, output_tokens: outputTokens }
      }
    } finally {
      options.signal.removeEventListener('abort', abort)
      thinking.forEach(() => options.onThinking?.({ type: 'stop' }))
      options.onUsage?.(inputTokens, outputTokens)
      await reader.cancel().catch(() => undefined)
      reader.releaseLock()
    }
  }, options)
}
