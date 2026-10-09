import type { ChatTurn } from './aiClient'
import { ROUTER_MODEL, summarizeWithRouter } from './aiClient'
import {
  compactContext,
  compactionBoundary,
  contextTokens,
  estimateTokens,
  restoredContext,
  validSnapshot
} from './contextCompactor'
import { useContextStore } from '../store/contextStore'
import type { CompactionSettings, ContextSnapshot } from '../../../shared/compaction'

const locks = new Set<string>()
export async function prepareContext(args: {
  userId: string
  chatId: string
  messages: ChatTurn[]
  prompt: string
  settings: CompactionSettings
  signal: AbortSignal
  force?: boolean
  authorizeRouter: () => Promise<string>
  onProgress: (label: string) => void
  isCurrentUser: () => boolean
  countTokens?: (messages: ChatTurn[], prompt: string) => Promise<number | null>
}): Promise<{
  messages: ChatTurn[]
  snapshot: ContextSnapshot | null
  changed: boolean
  warning?: string
}> {
  const key = `${args.userId}:${args.chatId}`
  if (locks.has(key)) throw new Error('A compactação deste chat já está em andamento.')
  locks.add(key)
  const state = useContextStore.getState()
  const checkAccount = (): void => {
    if (!args.isCurrentUser()) throw new DOMException('Conta alterada', 'AbortError')
  }
  let previous: ContextSnapshot | null = null
  let inputTokens = 0
  try {
    args.signal.throwIfAborted()
    checkAccount()
    const saved =
      state.contexts[key]?.snapshot ??
      (await window.api.localFeatures.loadContext(args.userId, args.chatId))
    previous = await validSnapshot(saved, args.messages)
    if (previous && previous.coveredCount > compactionBoundary(args.messages, args.settings.recentTurns)) previous = null
    const original = restoredContext(args.messages, previous, args.messages.at(-1)?.content)
    const localBefore = contextTokens(original, args.prompt)
    const measuredBefore =
      args.force ||
      localBefore >= ((args.settings.inputBudget * args.settings.triggerPercent) / 100) * 0.75
        ? await args.countTokens?.(original, args.prompt)
        : null
    const before = measuredBefore ?? localBefore
    inputTokens = before
    checkAccount()
    args.signal.throwIfAborted()
    state.update(key, {
      snapshot: previous,
      usedTokens: before,
      systemTokens: estimateTokens(args.prompt),
      error: null
    })
    const due =
      args.force ||
      (args.settings.automatic &&
        before >= (args.settings.inputBudget * args.settings.triggerPercent) / 100)
    const eligible =
      compactionBoundary(args.messages, args.settings.recentTurns) > (previous?.coveredCount ?? 0)
    if (!due || !eligible) {
      if (before > args.settings.inputBudget)
        throw new Error(
          'O contexto recente, as fontes ou as instruções excedem o orçamento configurado. Reduza anexos/fontes ou ajuste o orçamento em Features; nada foi truncado.'
        )
      return {
        messages: original,
        snapshot: previous,
        changed: false,
        ...(args.force
          ? {
              warning:
                'Não há mensagens antigas elegíveis. As trocas recentes e o contexto atual são preservados.'
            }
          : {})
      }
    }
    state.update(key, {
      phase: 'compacting',
      detail: 'Preparando histórico e verificando o router…'
    })
    args.onProgress('Preparando compactação de contexto')
    const apiKey = await args.authorizeRouter()
    args.signal.throwIfAborted()
    const snapshot = await compactContext({
      ...args,
      previous,
      model: ROUTER_MODEL,
      request: (system, content, maxTokens) => {
        checkAccount()
        return summarizeWithRouter({ apiKey, system, content, maxTokens, signal: args.signal })
      },
      onProgress: (step, total) => {
        const detail = `Resumindo histórico · etapa ${step} de ${total}`
        state.update(key, { detail })
        args.onProgress(detail)
      }
    })
    if (!snapshot) return { messages: original, snapshot: previous, changed: false }
    args.signal.throwIfAborted()
    checkAccount()
    const messages = restoredContext(args.messages, snapshot, args.messages.at(-1)?.content)
    const measuredAfter = await args.countTokens?.(messages, args.prompt)
    snapshot.beforeTokens = before
    snapshot.afterTokens =
      measuredAfter ??
      Math.ceil(
        contextTokens(messages, args.prompt) *
          (measuredBefore ? measuredBefore / Math.max(localBefore, 1) : 1)
      )
    if (snapshot.afterTokens >= before)
      throw new Error('O resumo não reduziu o contexto medido. Histórico anterior preservado.')
    if (snapshot.afterTokens > args.settings.inputBudget)
      throw new Error(
        'O histórico foi resumido, mas o contexto atual ainda excede o orçamento. Reduza os anexos/fontes ou ajuste Features. O resumo anterior foi preservado.'
      )
    checkAccount()
    args.signal.throwIfAborted()
    await window.api.localFeatures.saveContext(args.userId, args.chatId, snapshot)
    state.update(key, { snapshot, usedTokens: snapshot.afterTokens, error: null })
    return { messages, snapshot, changed: true }
  } catch (error) {
    if (args.signal.aborted || (error as Error).name === 'AbortError') throw error
    const warning = (error as Error).message
    state.update(key, { error: warning })
    const original = restoredContext(args.messages, previous, args.messages.at(-1)?.content)
    if (
      args.force ||
      Math.max(inputTokens, contextTokens(original, args.prompt)) > args.settings.inputBudget
    )
      throw error
    return { messages: original, snapshot: previous, changed: false, warning }
  } finally {
    locks.delete(key)
    state.update(key, { phase: 'idle', detail: '' })
  }
}
