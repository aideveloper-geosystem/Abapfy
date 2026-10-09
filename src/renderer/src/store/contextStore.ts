import { create } from 'zustand'
import type { ContextSnapshot } from '../../../shared/compaction'

export interface ContextState {
  snapshot: ContextSnapshot | null
  phase: 'idle' | 'compacting'
  detail: string
  usedTokens: number
  systemTokens: number
  error: string | null
}
const empty: ContextState = {
  snapshot: null,
  phase: 'idle',
  detail: '',
  usedTokens: 0,
  systemTokens: 0,
  error: null
}
export const useContextStore = create<{
  contexts: Record<string, ContextState>
  update: (key: string, value: Partial<ContextState>) => void
}>((set) => ({
  contexts: {},
  update: (key, value) =>
    set((state) => ({
      contexts: { ...state.contexts, [key]: { ...(state.contexts[key] ?? empty), ...value } }
    }))
}))
