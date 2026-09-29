import { create } from 'zustand'
import { supabase } from '@renderer/lib/supabaseClient'
import { useAuthStore } from '@renderer/store/authStore'
import { applyTheme, DEFAULT_THEME_ID, getTheme } from '@renderer/lib/themes'
import type { AiProviderId } from '@renderer/lib/aiProviders'
import { DEFAULT_AI_PREFERENCES, parseAiPreferences, type AiPreferences } from '@renderer/lib/aiPreferences'

interface ApiKeyStatus {
  configured: boolean
  updatedAt: string | null
}

const EMPTY_KEY_STATUS: Record<AiProviderId, ApiKeyStatus> = {
  openai: { configured: false, updatedAt: null },
  gemini: { configured: false, updatedAt: null },
  claude: { configured: false, updatedAt: null }
}

interface SettingsState {
  loaded: boolean
  loading: boolean
  theme: string
  defaultProvider: AiProviderId | null
  defaultModel: string | null
  apiKeys: Record<AiProviderId, ApiKeyStatus>
  aiPreferences: AiPreferences
  load: () => Promise<void>
  setAiPreferences: (patch: Partial<AiPreferences>) => Promise<void>
  setTheme: (themeId: string) => Promise<void>
  setDefaultModel: (provider: AiProviderId, model: string) => Promise<void>
  saveApiKey: (provider: AiProviderId, apiKey: string) => Promise<void>
  removeApiKey: (provider: AiProviderId) => Promise<void>
  reset: () => void
}

function currentUserId(): string | null {
  return useAuthStore.getState().user?.id ?? null
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  loaded: false,
  loading: false,
  theme: DEFAULT_THEME_ID,
  defaultProvider: null,
  defaultModel: null,
  apiKeys: EMPTY_KEY_STATUS,
  aiPreferences: DEFAULT_AI_PREFERENCES,

  load: async () => {
    const userId = currentUserId()
    if (!userId) return

    set({ loading: true })

    const selectSettings = (columns: string) =>
      supabase.from('user_settings').select(columns).eq('user_id', userId).maybeSingle()
    const [settingsResult, { data: keyRows }] = await Promise.all([
      selectSettings('theme, default_ai_provider, default_ai_model, ai_preferences'),
      supabase.from('ai_api_keys').select('provider, updated_at').eq('user_id', userId)
    ])
    // ai_preferences vem da migração 034; sem ela, carrega o resto e usa os padrões.
    const { data } = settingsResult.error
      ? await selectSettings('theme, default_ai_provider, default_ai_model')
      : settingsResult
    const settingsRow = data as {
      theme?: string | null
      default_ai_provider?: string | null
      default_ai_model?: string | null
      ai_preferences?: unknown
    } | null

    const apiKeys: Record<AiProviderId, ApiKeyStatus> = {
      openai: { configured: false, updatedAt: null },
      gemini: { configured: false, updatedAt: null },
      claude: { configured: false, updatedAt: null }
    }

    keyRows?.forEach((row) => {
      const provider = row.provider as AiProviderId
      apiKeys[provider] = { configured: true, updatedAt: row.updated_at }
    })

    const theme = getTheme(settingsRow?.theme).id
    applyTheme(theme)

    set({
      loaded: true,
      loading: false,
      theme,
      defaultProvider: (settingsRow?.default_ai_provider as AiProviderId | null) ?? null,
      defaultModel: settingsRow?.default_ai_model ?? null,
      apiKeys,
      aiPreferences: parseAiPreferences(settingsRow?.ai_preferences)
    })
  },

  setAiPreferences: async (patch) => {
    const userId = currentUserId()
    if (!userId) return

    const previous = get().aiPreferences
    const next = { ...previous, ...patch }
    set({ aiPreferences: next })

    const { error } = await supabase.from('user_settings').upsert({ user_id: userId, ai_preferences: next })
    if (error) {
      set({ aiPreferences: previous })
      throw new Error(
        /ai_preferences/.test(error.message)
          ? 'Preferências de IA indisponíveis: aplique a migração 034 no Supabase.'
          : error.message
      )
    }
  },

  setTheme: async (themeId) => {
    applyTheme(themeId)
    set({ theme: themeId })

    const userId = currentUserId()
    if (!userId) return

    await supabase.from('user_settings').upsert({ user_id: userId, theme: themeId })
  },

  setDefaultModel: async (provider, model) => {
    const userId = currentUserId()
    if (!userId) return

    const { error } = await supabase.from('user_settings').upsert({
      user_id: userId,
      default_ai_provider: provider,
      default_ai_model: model
    })
    if (error) throw error
    set({ defaultProvider: provider, defaultModel: model })
  },

  saveApiKey: async (provider, apiKey) => {
    const userId = currentUserId()
    if (!userId || !apiKey.trim()) return
    if (!useAuthStore.getState().role) throw new Error('Apenas master e administradores podem configurar chaves de API.')

    const { error } = await supabase.rpc('set_ai_api_key', {
      p_user_id: userId, p_provider: provider, p_api_key: apiKey.trim()
    })
    if (error) throw error

    set((state) => ({
      apiKeys: {
        ...state.apiKeys,
        [provider]: { configured: true, updatedAt: new Date().toISOString() }
      }
    }))
  },

  removeApiKey: async (provider) => {
    const userId = currentUserId()
    if (!userId) return
    if (!useAuthStore.getState().role) throw new Error('Apenas master e administradores podem remover chaves de API.')

    const { error } = await supabase.rpc('remove_ai_api_key', { p_user_id: userId, p_provider: provider })
    if (error) throw error

    set((state) => ({
      apiKeys: { ...state.apiKeys, [provider]: { configured: false, updatedAt: null } }
    }))

    const { defaultProvider } = get()
    if (defaultProvider === provider) {
      set({ defaultProvider: null, defaultModel: null })
    }
  },

  reset: () => {
    applyTheme(DEFAULT_THEME_ID)
    set({
      loaded: false,
      loading: false,
      theme: DEFAULT_THEME_ID,
      defaultProvider: null,
      defaultModel: null,
      apiKeys: EMPTY_KEY_STATUS,
      aiPreferences: DEFAULT_AI_PREFERENCES
    })
  }
}))
