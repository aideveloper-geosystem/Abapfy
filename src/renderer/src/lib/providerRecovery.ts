export interface RecoveryEvent {
  attempt: number
  maxRetries: number
  delayMs: number
  recovered: boolean
}
export interface RecoveryOptions {
  signal: AbortSignal
  onRetry?: (event: RecoveryEvent) => void
  maxRetries?: number
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>
}
export class ProviderRequestError extends Error {
  constructor(
    message: string,
    public status = 0,
    public errorType = '',
    public retryAfterMs = 0
  ) {
    super(message)
  }
}
export function transientProviderError(error: unknown): boolean {
  if (error instanceof ProviderRequestError) {
    if (
      /insufficient[_ ]quota|spend[_ ]limit|billing|credit[_ ]balance/i.test(
        error.errorType + ' ' + error.message
      )
    )
      return false
    return (
      [408, 429, 500, 502, 503, 504, 529].includes(error.status) ||
      ['overloaded_error', 'api_error', 'rate_limit_error', 'stream_interrupted'].includes(
        error.errorType
      )
    )
  }
  const network = error as { name?: string; message?: string } | null
  return Boolean(
    network &&
    network.name === 'TypeError' &&
    /fetch|network|connection|stream|terminated/i.test(network.message ?? '')
  )
}
export function waitForProvider(milliseconds: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      reject(signal.reason ?? new DOMException('Cancelado', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, milliseconds)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
  })
}
/** Retry only the model request at its current checkpoint, never the tool executor. */
export async function recoverProvider<T>(
  operation: (attempt: number) => Promise<T>,
  options: RecoveryOptions
): Promise<T> {
  const maxRetries = options.maxRetries ?? 5
  for (let attempt = 0; ; attempt++) {
    options.signal.throwIfAborted()
    try {
      const result = await operation(attempt)
      options.signal.throwIfAborted()
      if (attempt) options.onRetry?.({ attempt, maxRetries, delayMs: 0, recovered: true })
      return result
    } catch (error) {
      options.signal.throwIfAborted()
      if (!transientProviderError(error) || attempt >= maxRetries) throw error
      const retryAfter = error instanceof ProviderRequestError ? error.retryAfterMs : 0
      const delayMs = Math.max(Math.min(30000, 2000 * 2 ** attempt), retryAfter)
      options.onRetry?.({ attempt: attempt + 1, maxRetries, delayMs, recovered: false })
      await (options.wait ?? waitForProvider)(delayMs, options.signal)
    }
  }
}
export async function providerHttpError(
  response: Response,
  label: string
): Promise<ProviderRequestError> {
  const raw = await response.text()
  let message = `${label} HTTP ${response.status}`,
    errorType = ''
  try {
    const data = JSON.parse(raw)
    message += ': ' + (data.error?.message ?? data.message ?? 'falha na requisição')
    errorType = String(data.error?.type ?? data.error?.code ?? '')
  } catch {
    message += ': falha na requisição ao provedor'
  }
  const retryAfter = response.headers?.get('retry-after')
  const retryAfterMs = retryAfter
    ? /^\d+(\.\d+)?$/.test(retryAfter)
      ? Number(retryAfter) * 1000
      : Math.max(0, Date.parse(retryAfter) - Date.now())
    : 0
  return new ProviderRequestError(
    message,
    response.status,
    errorType,
    Number.isFinite(retryAfterMs) ? retryAfterMs : 0
  )
}
export async function providerJson<T>(
  request: () => Promise<Response>,
  label: string,
  options: RecoveryOptions
): Promise<T> {
  return recoverProvider(async () => {
    const response = await request()
    if (!response.ok) throw await providerHttpError(response, label)
    return response.json()
  }, options)
}
