export type AiProviderId = 'openai' | 'gemini' | 'claude'
/** Provedores de chat: as APIs com chave própria mais o Antigravity (login do IDE, sem chave). */
export type ChatProviderId = AiProviderId | 'antigravity'

export interface AiProviderDefinition {
  id: AiProviderId
  name: string
  keyPlaceholder: string
  keyHelpUrl: string
  keyHint: string
}

// Provider transports and key instructions live in the app; models live in ai_models.
export const AI_PROVIDERS: AiProviderDefinition[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    keyPlaceholder: 'sk-...',
    keyHelpUrl: 'https://platform.openai.com/api-keys',
    keyHint: 'Gerada em platform.openai.com → API keys.'
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    keyPlaceholder: 'AIza...',
    keyHelpUrl: 'https://aistudio.google.com/apikey',
    keyHint: 'Gerada no Google AI Studio → Get API key.'
  },
  {
    id: 'claude',
    name: 'Anthropic Claude',
    keyPlaceholder: 'sk-ant-...',
    keyHelpUrl: 'https://console.anthropic.com/settings/keys',
    keyHint: 'Gerada em console.anthropic.com → API Keys.'
  }
]

export function getProvider(id: AiProviderId | string | null | undefined): AiProviderDefinition | undefined {
  return AI_PROVIDERS.find((provider) => provider.id === id)
}
