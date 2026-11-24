import { useEffect } from 'react'
import { useAuthStore } from '@renderer/store/authStore'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { useAntigravityStore } from '@renderer/store/antigravityStore'
import type { ChatProviderId } from '@renderer/lib/aiProviders'

export interface EffectiveModel {
  provider: ChatProviderId | null
  model: string | null
  /** Antigravity ligado: as APIs com chave própria ficam desativadas. */
  antigravity: boolean
}

/**
 * Provedor e modelo realmente usados no chat. Com a integração Antigravity ligada ela
 * substitui o modelo padrão de API (somente modelos Gemini do IDE).
 */
export function useEffectiveModel(): EffectiveModel {
  const userId = useAuthStore((state) => state.user?.id)
  const stored = useSettingsStore((state) => ({
    provider: state.defaultProvider,
    model: state.defaultModel
  }))
  const agy = useAntigravityStore((state) => ({ enabled: state.enabled, model: state.model }))
  useEffect(() => {
    if (userId) void useAntigravityStore.getState().load(userId)
  }, [userId])
  if (agy.enabled) return { provider: 'antigravity', model: agy.model, antigravity: true }
  return { provider: stored.provider, model: stored.model, antigravity: false }
}
