import { create } from 'zustand'
import { supabase } from '@renderer/lib/supabaseClient'
import { useAuthStore } from '@renderer/store/authStore'

export type AgentSource = 'default' | 'custom'

export interface AgentItem {
  id: string
  source: AgentSource
  name: string
  description: string
  content: string
  flowKey: string | null
  enabled: boolean
}

interface DefaultAgentRow {
  id: string
  name: string
  description: string
  content: string
  flow_key: string | null
  sort_order: number
  enabled?: boolean
}

interface UserAgentRow {
  id: string
  slug: string
  name: string
  description: string | null
  content: string
  enabled?: boolean
}

interface AgentsState {
  loaded: boolean
  loading: boolean
  agents: AgentItem[]
  load: () => Promise<boolean>
  importAgent: (input: { name: string; description: string; content: string }) => Promise<void>
  removeCustomAgent: (id: string) => Promise<void>
  saveAgent: (agent: AgentItem, input: { name: string; description: string; content: string }) => Promise<void>
  setAgentEnabled: (agent: AgentItem, enabled: boolean) => Promise<void>
  getById: (source: AgentSource, id: string) => AgentItem | undefined
  reset: () => void
}

function currentUserId(): string | null {
  return useAuthStore.getState().user?.id ?? null
}

function requireAdministrator(): string {
  const auth = useAuthStore.getState()
  if (!auth.user || (auth.role !== 'MASTER' && auth.role !== 'ADMIN')) {
    throw new Error('Somente MASTER ou ADMIN podem gerenciar agentes.')
  }
  return auth.user.id
}

function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'agente'
}

export const useAgentsStore = create<AgentsState>((set, get) => ({
  loaded: false,
  loading: false,
  agents: [],

  load: async () => {
    const userId = currentUserId()
    if (!userId) return false

    set({ loading: true })

    const [{ data: defaultRows, error: defaultError }, { data: customRows, error: customError }] = await Promise.all([
      supabase.from('default_agents').select('*').order('sort_order', { ascending: true }),
      supabase
        .from('user_agents')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
    ])
    if (defaultError || customError) {
      set({ loading: false })
      return false
    }

    const defaults: AgentItem[] = ((defaultRows as DefaultAgentRow[] | null) ?? []).map((row) => ({
      id: row.id,
      source: 'default',
      name: row.name,
      description: row.description,
      content: row.content,
      flowKey: row.flow_key,
      enabled: row.enabled ?? true
    }))

    const customs: AgentItem[] = ((customRows as UserAgentRow[] | null) ?? []).map((row) => ({
      id: row.id,
      source: 'custom',
      name: row.name,
      description: row.description ?? '',
      content: row.content,
      flowKey: null,
      enabled: row.enabled ?? true
    }))

    set({ loaded: true, loading: false, agents: [...defaults, ...customs] })
    return true
  },

  importAgent: async (input) => {
    const userId = currentUserId()
    if (!userId) return

    const existingSlugs = new Set(
      get()
        .agents.filter((agent) => agent.source === 'custom')
        .map((agent) => agent.id)
    )
    let slug = slugify(input.name)
    if (existingSlugs.has(slug)) {
      slug = `${slug}-${Date.now().toString(36)}`
    }

    const { data, error } = await supabase
      .from('user_agents')
      .insert({
        user_id: userId,
        slug,
        name: input.name.trim(),
        description: input.description.trim() || null,
        content: input.content
      })
      .select('*')
      .single()

    if (error || !data) return

    const row = data as UserAgentRow
    set((state) => ({
      agents: [
        ...state.agents,
        {
          id: row.id,
          source: 'custom',
          name: row.name,
          description: row.description ?? '',
          content: row.content,
          flowKey: null,
          enabled: row.enabled ?? true
        }
      ]
    }))
  },

  removeCustomAgent: async (id) => {
    const userId = currentUserId()
    if (!userId) return

    await supabase.from('user_agents').delete().eq('user_id', userId).eq('id', id)

    set((state) => ({
      agents: state.agents.filter((agent) => !(agent.source === 'custom' && agent.id === id))
    }))
  },

  saveAgent: async (agent, input) => {
    const userId = requireAdministrator()
    const changes = {
      name: input.name.trim(),
      description: input.description.trim(),
      content: input.content.trim()
    }
    if (!changes.name || !changes.content) throw new Error('Informe nome e instruções do agente.')
    const query = agent.source === 'default'
      ? supabase.from('default_agents').update(changes).eq('id', agent.id)
      : supabase.from('user_agents').update(changes).eq('id', agent.id).eq('user_id', userId)
    const { data, error } = await query.select('id').maybeSingle()
    if (error) throw error
    if (!data) throw new Error('O agente não foi atualizado. Verifique as permissões e a migração 031.')
    set((state) => ({ agents: state.agents.map((item) => item.source === agent.source && item.id === agent.id ? { ...item, ...changes } : item) }))
  },

  setAgentEnabled: async (agent, enabled) => {
    const userId = requireAdministrator()
    const query = agent.source === 'default'
      ? supabase.from('default_agents').update({ enabled }).eq('id', agent.id)
      : supabase.from('user_agents').update({ enabled }).eq('id', agent.id).eq('user_id', userId)
    const { data, error } = await query.select('id').maybeSingle()
    if (error) throw error
    if (!data) throw new Error('O agente não foi alterado. Verifique as permissões e a migração 031.')
    set((state) => ({ agents: state.agents.map((item) => item.source === agent.source && item.id === agent.id ? { ...item, enabled } : item) }))
  },

  getById: (source, id) => get().agents.find((agent) => agent.source === source && agent.id === id),

  reset: () => set({ loaded: false, loading: false, agents: [] })
}))
