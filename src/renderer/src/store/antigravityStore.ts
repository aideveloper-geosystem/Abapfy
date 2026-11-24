import { create } from 'zustand'
import type { AntigravityModel, AntigravityStatus } from '../../../shared/antigravity'

interface AntigravityState {
  userId: string | null
  loaded: boolean
  enabled: boolean
  /** Modelo Gemini escolhido para o chat quando a integração está ligada. */
  model: string | null
  status: AntigravityStatus | null
  checking: boolean
  load: (userId: string) => Promise<void>
  refresh: () => Promise<AntigravityStatus | null>
  setEnabled: (enabled: boolean) => Promise<void>
  setModel: (model: string) => Promise<void>
  reset: () => void
}

function pickModel(current: string | null, models: AntigravityModel[]): string | null {
  if (current && models.some((model) => model.id === current)) return current
  return models.find((model) => model.id === 'gemini-4-neon-high')?.id ?? models[0]?.id ?? null
}

function api(): NonNullable<Window['api']['antigravity']> {
  if (!window.api.antigravity) throw new Error('Reinicie o Abapfy para carregar a integração Antigravity.')
  return window.api.antigravity
}

export const useAntigravityStore = create<AntigravityState>((set, get) => ({
  userId: null,
  loaded: false,
  enabled: false,
  model: null,
  status: null,
  checking: false,

  load: async (userId) => {
    if (get().userId === userId && get().loaded) return
    set({ userId, loaded: false, enabled: false, model: null, status: null })
    try {
      const preferences = await api().getPreferences(userId)
      if (get().userId !== userId) return
      set({ enabled: preferences.enabled, model: preferences.model, loaded: true })
      // Com a integração ligada o modelo do menu depende da lista do IDE.
      if (preferences.enabled) await get().refresh()
    } catch {
      if (get().userId === userId) set({ loaded: true })
    }
  },

  refresh: async () => {
    const userId = get().userId
    if (!userId) return null
    set({ checking: true })
    try {
      const status = await api().status()
      if (get().userId !== userId) return null
      const model = pickModel(get().model, status.models)
      set({ status, model: status.available ? model : get().model })
      return status
    } catch (error) {
      if (get().userId !== userId) return null
      const status: AntigravityStatus = {
        available: false,
        reason: error instanceof Error ? error.message : String(error),
        models: [],
        quota: [],
        usage: { requests: 0, inputTokens: 0, outputTokens: 0, since: new Date().toISOString() },
        checkedAt: new Date().toISOString()
      }
      set({ status })
      return status
    } finally {
      if (get().userId === userId) set({ checking: false })
    }
  },

  setEnabled: async (enabled) => {
    const userId = get().userId
    if (!userId) return
    let model = get().model
    if (enabled) {
      const status = await get().refresh()
      if (!status?.available) throw new Error(status?.reason ?? 'Antigravity indisponível.')
      if (!status.models.length) throw new Error('Nenhum modelo Gemini liberado no Antigravity desta conta.')
      model = pickModel(get().model, status.models)
    }
    const saved = await api().setPreferences(userId, { enabled, model })
    if (get().userId === userId) set({ enabled: saved.enabled, model: saved.model })
  },

  setModel: async (model) => {
    const userId = get().userId
    if (!userId) return
    const saved = await api().setPreferences(userId, { enabled: get().enabled, model })
    if (get().userId === userId) set({ model: saved.model })
  },

  reset: () => set({ userId: null, loaded: false, enabled: false, model: null, status: null, checking: false })
}))
