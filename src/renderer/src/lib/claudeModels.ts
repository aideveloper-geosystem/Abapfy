/**
 * Parâmetros de requisição por geração de modelo Claude. Os IDs vêm do catálogo
 * `ai_models` (Supabase); aqui só decidimos o formato do body/headers que cada
 * família aceita na Messages API.
 *
 * - Geração 5.5 (Opus 5.5 / Sonnet 5.5): thinking sempre adaptativo — `disabled`
 *   e `budget_tokens` retornam 400, e `tool_choice` any/tool também. O Opus 5.5
 *   usa effort `medium` por padrão (o Sonnet 5.5 usa `high`), então sempre
 *   enviamos o effort explicitamente. Ambos aceitam o fallback server-side
 *   `fallbacks: "default"`, que reencaminha recusas de safeguard para outro
 *   modelo na mesma chamada em vez de encerrar a resposta.
 * - Opus 4.6+ / Sonnet 4.6+ / Opus 5 / Sonnet 5: thinking adaptativo + effort.
 * - Haiku 5.5: thinking adaptativo + effort, sem fallback server-side.
 * - Haiku 4.5 e anteriores: sem adaptive thinking nem effort (retornam 400).
 */

export const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

const FALLBACK_BETA = 'server-side-fallback-2026-07-01'

const GEN_5_5 = /^claude-(opus|sonnet)-5-5/
// Haiku, Claude 3.x e Opus/Sonnet 4.0–4.5 (inclui IDs datados como claude-sonnet-4-20250514).
const HAIKU_5_5 = /^claude-haiku-5-5$/
const LEGACY = /^claude-(haiku-|3|(opus|sonnet)-4-[0-5])/

export type ClaudeGeneration = 'gen-5-5' | 'haiku-5-5' | 'adaptive' | 'legacy'

export function claudeGeneration(model: string): ClaudeGeneration {
  if (GEN_5_5.test(model)) return 'gen-5-5'
  if (HAIKU_5_5.test(model)) return 'haiku-5-5'
  if (LEGACY.test(model)) return 'legacy'
  return 'adaptive'
}

export function claudeHeaders(apiKey: string, model: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
    ...(claudeGeneration(model) === 'gen-5-5' ? { 'anthropic-beta': FALLBACK_BETA } : {})
  }
}

interface ClaudeBodyOptions {
  /** Effort desejado; ignorado em modelos legados. */
  effort?: string
  /**
   * Pede o resumo legível do raciocínio (`display: "summarized"`). Sem isso os
   * modelos 4.7+ devolvem blocos thinking vazios. Não muda o custo: o thinking
   * acontece e é cobrado igual — só a visibilidade muda.
   */
  showThinking?: boolean
  /** max_tokens para modelos legados / sem thinking. */
  maxTokens: number
  /** max_tokens para modelos com thinking sempre ligado (o thinking consome o mesmo orçamento). */
  thinkingMaxTokens: number
}

// Cache automático: a API marca o último bloco cacheável, então system prompt
// (agente + skills + contexto) e histórico já enviados custam ~10% nas próximas
// requisições da mesma conversa / do mesmo loop de ferramentas.
const PROMPT_CACHE = { cache_control: { type: 'ephemeral' } }

/** Campos do body que variam por geração (model, max_tokens, thinking, effort, fallbacks, cache). */
export function claudeModelParams(model: string, options: ClaudeBodyOptions): Record<string, unknown> {
  const generation = claudeGeneration(model)
  if (generation === 'legacy') return { model, max_tokens: options.maxTokens, ...PROMPT_CACHE }

  const effort = options.effort ?? 'medium'
  const params: Record<string, unknown> = {
    model,
    max_tokens: options.thinkingMaxTokens,
    thinking: options.showThinking ? { type: 'adaptive', display: 'summarized' } : { type: 'adaptive' },
    output_config: { effort },
    ...PROMPT_CACHE
  }
  if (generation === 'gen-5-5') params.fallbacks = 'default'
  return params
}

/**
 * Loops de ferramentas (MCP / controle SAP GUI): modelos anteriores mantêm o body
 * original (sem thinking); a geração 5.5 pensa sempre, então ganha orçamento maior
 * para o thinking não esgotar max_tokens antes do tool_use. Todas usam cache, já que
 * cada rodada reenvia o mesmo prefixo (system + rodadas anteriores). O `content` da resposta
 * deve voltar inteiro no histórico — blocos thinking ficam vinculados à conversa.
 */
export function claudeToolLoopParams(model: string, maxTokens: number, effort = 'medium'): Record<string, unknown> {
  const generation = claudeGeneration(model)
  if (generation !== 'gen-5-5' && generation !== 'haiku-5-5') {
    return { model, max_tokens: maxTokens, ...PROMPT_CACHE }
  }
  return claudeModelParams(model, { effort, maxTokens, thinkingMaxTokens: Math.max(maxTokens, 16000) })
}

/**
 * Server tools de web (executadas pela Anthropic, sem loop no app). A versão
 * _20260209 tem filtragem dinâmica e exige Opus/Sonnet 4.6+; modelos legados
 * ficam sem web. A busca é restrita a domínios SAP para respostas ancoradas na
 * documentação oficial; o fetch não tem filtro de domínio porque só lê URLs que
 * já estão na conversa (links colados pelo usuário ou vindos da busca).
 * Cobrança à parte por busca — `max_uses` limita o custo por resposta.
 */
export const WEB_SEARCH_DOMAINS = ['sap.com', 'sapui5.hana.ondemand.com']

export function claudeWebTools(
  model: string,
  enabled: { search: boolean; fetch: boolean }
): Record<string, unknown>[] | null {
  if (claudeGeneration(model) === 'legacy') return null
  const tools: Record<string, unknown>[] = []
  if (enabled.search) {
    tools.push({ type: 'web_search_20260209', name: 'web_search', max_uses: 5, allowed_domains: WEB_SEARCH_DOMAINS })
  }
  if (enabled.fetch) {
    tools.push({ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 5, max_content_tokens: 60000, citations: { enabled: true } })
  }
  return tools.length ? tools : null
}

/** Mensagem amigável quando a resposta termina com stop_reason "refusal". */
export function claudeRefusalMessage(category: string | null | undefined): string {
  const detail = category ? ` (categoria: ${category})` : ''
  return `O Claude recusou este pedido pelas políticas de segurança${detail}. Reformule a solicitação ou tente outro modelo.`
}
