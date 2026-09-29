import { CLAUDE_EFFORT_LEVELS, type ClaudeEffort } from '@renderer/lib/aiClient'

/**
 * Preferências de IA do usuário (user_settings.ai_preferences). As ferramentas
 * com cobrança à parte começam desligadas: quem já tem um MCP de documentação
 * gratuito não paga por busca sem querer.
 */
export interface AiPreferences {
  /** Effort inicial do composer para modelos Claude. */
  defaultEffort: ClaudeEffort
  /** Pede o resumo do raciocínio (clicável em "Pensou por Xs"). Sem custo extra. */
  showThinking: boolean
  /** Server tool web_search restrita a domínios SAP — cobrada por busca. */
  webSearch: boolean
  /** Server tool web_fetch para links da conversa — cobrada pelos tokens lidos. */
  webFetch: boolean
}

export const DEFAULT_AI_PREFERENCES: AiPreferences = {
  defaultEffort: 'medium',
  showThinking: true,
  webSearch: false,
  webFetch: false
}

/** Normaliza o JSON salvo (campos ausentes ou inválidos caem no padrão). */
export function parseAiPreferences(value: unknown): AiPreferences {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const effort = CLAUDE_EFFORT_LEVELS.find((level) => level === raw.defaultEffort)
  const flag = (key: keyof AiPreferences): boolean =>
    typeof raw[key] === 'boolean' ? (raw[key] as boolean) : (DEFAULT_AI_PREFERENCES[key] as boolean)
  return {
    defaultEffort: effort ?? DEFAULT_AI_PREFERENCES.defaultEffort,
    showThinking: flag('showThinking'),
    webSearch: flag('webSearch'),
    webFetch: flag('webFetch')
  }
}
