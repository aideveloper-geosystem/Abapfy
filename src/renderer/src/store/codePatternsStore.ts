import { create } from 'zustand'
import {
  approveCodePattern,
  deleteCodePattern,
  loadApprovedPatterns,
  normalizeCode,
  revokeCodePattern,
  updatePatternDetails,
  type ApproveInput,
  type CodePattern
} from '@renderer/lib/codePatterns'

/** Where the open chat session works: gives each ABAP code block somewhere to be approved. */
export interface PatternScope {
  clientId: string
  moduleId: string
  chatId: string | null
  /** A reply is still being written: its code blocks may be incomplete. */
  streaming: boolean
}

interface CodePatternsState {
  scope: PatternScope | null
  byClient: Record<string, CodePattern[]>
  loadedClients: Record<string, boolean>
  setScope: (scope: PatternScope | null) => void
  load: (clientId: string, force?: boolean) => Promise<CodePattern[]>
  approve: (input: ApproveInput) => Promise<{ pattern: CodePattern; driveError: string | null }>
  update: (clientId: string, id: string, title: string, description: string, tags: string[]) => Promise<void>
  revoke: (clientId: string, id: string) => Promise<void>
  remove: (clientId: string, id: string) => Promise<void>
  isApproved: (clientId: string, code: string) => boolean
}

export const useCodePatternsStore = create<CodePatternsState>((set, get) => ({
  scope: null,
  byClient: {},
  loadedClients: {},

  setScope: (scope) => set({ scope }),

  load: async (clientId, force = false) => {
    if (!force && get().loadedClients[clientId]) return get().byClient[clientId] ?? []
    set((state) => ({ loadedClients: { ...state.loadedClients, [clientId]: true } }))
    try {
      const patterns = await loadApprovedPatterns(clientId)
      set((state) => ({ byClient: { ...state.byClient, [clientId]: patterns } }))
      return patterns
    } catch (error) {
      // Without migration 046 the library is simply empty; allow a retry later.
      set((state) => ({ loadedClients: { ...state.loadedClients, [clientId]: false } }))
      throw error
    }
  },

  approve: async (input) => {
    const result = await approveCodePattern(input)
    set((state) => ({
      byClient: {
        ...state.byClient,
        [input.clientId]: [result.pattern, ...(state.byClient[input.clientId] ?? [])]
      }
    }))
    return result
  },

  update: async (clientId, id, title, description, tags) => {
    await updatePatternDetails(id, title, description, tags)
    set((state) => ({
      byClient: {
        ...state.byClient,
        [clientId]: (state.byClient[clientId] ?? []).map((pattern) =>
          pattern.id === id
            ? { ...pattern, title: title.trim(), description: description.trim() || null, tags }
            : pattern
        )
      }
    }))
  },

  revoke: async (clientId, id) => {
    await revokeCodePattern(id)
    set((state) => ({
      byClient: {
        ...state.byClient,
        [clientId]: (state.byClient[clientId] ?? []).filter((pattern) => pattern.id !== id)
      }
    }))
  },

  remove: async (clientId, id) => {
    await deleteCodePattern(id)
    set((state) => ({
      byClient: {
        ...state.byClient,
        [clientId]: (state.byClient[clientId] ?? []).filter((pattern) => pattern.id !== id)
      }
    }))
  },

  isApproved: (clientId, code) => {
    const wanted = normalizeCode(code)
    return (get().byClient[clientId] ?? []).some(
      (pattern) => !pattern.revokedAt && pattern.content === wanted
    )
  }
}))
