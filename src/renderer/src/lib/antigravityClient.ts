import type { AntigravityAskResult } from '../../../shared/antigravity'

function cleanMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(
    /^Error invoking remote method '[^']+': (?:Error: )?/,
    ''
  )
}

/** Pede uma resposta ao Antigravity; cancelar o signal interrompe a espera no processo principal. */
export async function askAntigravity(
  model: string,
  prompt: string,
  signal: AbortSignal
): Promise<AntigravityAskResult> {
  signal.throwIfAborted()
  if (!window.api.antigravity) throw new Error('Reinicie o Abapfy para carregar a integração Antigravity.')
  const requestId = crypto.randomUUID()
  const onAbort = (): void => {
    void window.api.antigravity.cancel(requestId)
  }
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    const result = await window.api.antigravity.ask({ requestId, model, prompt })
    signal.throwIfAborted()
    return result
  } catch (error) {
    if (signal.aborted) throw new DOMException('Cancelado', 'AbortError')
    throw new Error(`Antigravity: ${cleanMessage(error)}`)
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}
