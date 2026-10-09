import { create } from 'zustand'
import type { LocalFeatureStatus } from '../../../shared/localFeatures'

interface State {
  userId: string | null
  status: LocalFeatureStatus | null
  error: string | null
  load: (userId: string) => Promise<void>
  apply: (userId: string, status: LocalFeatureStatus) => void
}
export const useLocalFeaturesStore = create<State>((set, get) => ({
  userId: null, status: null, error: null,
  load: async (userId) => {
    if (get().userId !== userId) set({ userId, status: null, error: null })
    try {
      if (!window.api.localFeatures) throw new Error('Reinicie o Abapfy para carregar as Features locais.')
      const status = await window.api.localFeatures.status(userId)
      if (get().userId === userId) set({ status, error: null })
    } catch (error) { if (get().userId === userId) set({ status: null, error: (error as Error).message }) }
  },
  apply: (userId, status) => { if (get().userId === userId) set({ status, error: null }) }
}))
