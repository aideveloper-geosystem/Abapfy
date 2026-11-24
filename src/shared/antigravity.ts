/** Contrato entre main, preload e renderer para a integração com o Antigravity IDE. */

export const ANTIGRAVITY_PROVIDER_ID = 'antigravity' as const
/** Marcador usado no lugar da chave de API: o Antigravity usa o login do IDE. */
export const ANTIGRAVITY_LOCAL_KEY = 'antigravity-local'

/** Slugs aceitos: apenas a família Gemini (o Abapfy não expõe os demais modelos do IDE). */
export const ANTIGRAVITY_MODEL_PATTERN = /^gemini-[a-z0-9][a-z0-9.-]{0,60}$/

export interface AntigravityModel {
  id: string
  label: string
}

export interface AntigravityQuotaGroup {
  /** gemini | claude | other */
  key: string
  label: string
  /** 0..1 — fração restante da cota; null quando o IDE não informa. */
  remainingFraction: number | null
  resetTime: string | null
  /** Se o Abapfy consegue usar este grupo (somente Gemini). */
  usableInAbapfy: boolean
}

export interface AntigravityUsage {
  requests: number
  inputTokens: number
  outputTokens: number
  /** Início da contagem (abertura do Abapfy), ISO 8601. */
  since: string
}

export interface AntigravityStatus {
  available: boolean
  /** Explicação quando indisponível. */
  reason?: string
  lsVersion?: string
  plan?: string
  /** Somente modelos Gemini liberados no plano. */
  models: AntigravityModel[]
  quota: AntigravityQuotaGroup[]
  usage: AntigravityUsage
  checkedAt: string
}

export interface AntigravityPreferences {
  enabled: boolean
  model: string | null
}

export interface AntigravityAskRequest {
  requestId: string
  model: string
  prompt: string
  timeoutMs?: number
}

export interface AntigravityAskResult {
  content: string
  modelUsed: string
  inputTokens: number | null
  outputTokens: number | null
  conversationId: string
}

export interface AntigravityApi {
  status: () => Promise<AntigravityStatus>
  getPreferences: (userId: string) => Promise<AntigravityPreferences>
  setPreferences: (userId: string, preferences: AntigravityPreferences) => Promise<AntigravityPreferences>
  ask: (request: AntigravityAskRequest) => Promise<AntigravityAskResult>
  cancel: (requestId: string) => Promise<void>
}
