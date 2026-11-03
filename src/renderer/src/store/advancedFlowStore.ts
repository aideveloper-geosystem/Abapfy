import { z } from 'zod'
import { create } from 'zustand'
import { useAuthStore } from './authStore'
import {
  DEFAULT_ADVANCED_FLOW,
  parseAdvancedFlow,
  type AdvancedFlow
} from '../../../shared/advancedFlow'

const keyFor = (userId: string) => `abapfy:advanced-flow:v1:${userId}`
const fresh = () => structuredClone(DEFAULT_ADVANCED_FLOW)
export function readAdvancedFlow(userId: string): AdvancedFlow {
  const library = readFlowLibrary(userId)
  return library.flows.find((f) => f.id === library.selectedId)?.config ?? fresh()
}
const libraryKey = (userId: string) => 'abapfy:flow-library:v2:' + userId
const librarySchema = z
  .object({
    enabled: z.boolean(),
    selectedId: z.string().nullable(),
    flows: z
      .array(z.object({ id: z.string().min(1).max(80), config: z.unknown() }).strict())
      .max(500)
  })
  .strict()
export interface SavedFlow {
  id: string
  config: AdvancedFlow
}
export function readFlowLibrary(userId: string) {
  const stored = localStorage.getItem(libraryKey(userId))
  if (stored) {
    const parsed = librarySchema.parse(JSON.parse(stored))
    const flows = parsed.flows.map((row) => ({ id: row.id, config: parseAdvancedFlow(row.config) }))
    if (new Set(flows.map((f) => f.id)).size !== flows.length) throw new Error('Fluxos duplicados.')
    return {
      ...parsed,
      flows,
      selectedId: flows.some((f) => f.id === parsed.selectedId)
        ? parsed.selectedId
        : (flows[0]?.id ?? null)
    }
  }
  const legacy = localStorage.getItem(keyFor(userId))
  if (!legacy) return { enabled: false, selectedId: null, flows: [] as SavedFlow[] }
  const config = parseAdvancedFlow(JSON.parse(legacy))
  return {
    enabled: config.enabled,
    selectedId: 'migrated-flow',
    flows: [{ id: 'migrated-flow', config }]
  }
}
interface State {
  userId: string | null
  config: AdvancedFlow
  flows: SavedFlow[]
  enabled: boolean
  selectedId: string | null
  error: string | null
  load: (userId: string) => void
  save: (userId: string, value: AdvancedFlow, id?: string) => void
  select: (userId: string, id: string) => void
  setEnabled: (userId: string, enabled: boolean) => void
  remove: (userId: string, id: string) => void
}
function authorize(userId: string): void {
  if (useAuthStore.getState().user?.id !== userId)
    throw new Error('A conta mudou. Abra os fluxos novamente.')
}
export const useAdvancedFlowStore = create<State>((set, get) => {
  function persist(
    userId: string,
    value: { flows: SavedFlow[]; selectedId: string | null; enabled: boolean }
  ): void {
    authorize(userId)
    localStorage.setItem(libraryKey(userId), JSON.stringify(value))
    set({
      ...value,
      userId,
      config: value.flows.find((f) => f.id === value.selectedId)?.config ?? fresh(),
      error: null
    })
  }
  return {
    userId: null,
    config: fresh(),
    flows: [],
    enabled: false,
    selectedId: null,
    error: null,
    load: (userId) => {
      try {
        const library = readFlowLibrary(userId)
        set({
          userId,
          ...library,
          config: library.flows.find((f) => f.id === library.selectedId)?.config ?? fresh(),
          error: null
        })
      } catch {
        set({
          userId,
          config: fresh(),
          flows: [],
          enabled: false,
          selectedId: null,
          error: 'Não foi possível ler os fluxos salvos. Os dados originais foram preservados.'
        })
      }
    },
    save: (userId, value, requestedId) => {
      authorize(userId)
      const current = get()
      if (current.userId !== userId || current.error)
        throw new Error('Recarregue os fluxos desta conta antes de salvar.')
      const config = parseAdvancedFlow(value),
        id = requestedId ?? current.selectedId ?? crypto.randomUUID()
      if (current.flows.length >= 500 && !current.flows.some((f) => f.id === id))
        throw new Error('Limite de 500 fluxos atingido.')
      persist(userId, {
        enabled: current.enabled,
        selectedId: id,
        flows: current.flows.some((f) => f.id === id)
          ? current.flows.map((f) => (f.id === id ? { id, config } : f))
          : [...current.flows, { id, config }]
      })
    },
    select: (userId, id) => {
      const state = get()
      authorize(userId)
      if (state.userId !== userId || state.error || !state.flows.some((f) => f.id === id))
        throw new Error('Fluxo indisponível.')
      persist(userId, { flows: state.flows, enabled: state.enabled, selectedId: id })
    },
    setEnabled: (userId, enabled) => {
      const state = get()
      authorize(userId)
      if (state.userId !== userId || state.error)
        throw new Error('Recarregue os fluxos desta conta.')
      persist(userId, { flows: state.flows, enabled, selectedId: state.selectedId })
    },
    remove: (userId, id) => {
      const state = get()
      authorize(userId)
      if (state.userId !== userId || state.error)
        throw new Error('Recarregue os fluxos desta conta.')
      const flows = state.flows.filter((f) => f.id !== id)
      persist(userId, {
        flows,
        enabled: state.enabled,
        selectedId: state.selectedId === id ? (flows[0]?.id ?? null) : state.selectedId
      })
    }
  }
})
