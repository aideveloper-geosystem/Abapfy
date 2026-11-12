import { create } from 'zustand'
import { supabase } from '@renderer/lib/supabaseClient'
import { useAuthStore } from '@renderer/store/authStore'
import type { AgentSource } from '@renderer/store/agentsStore'
import { GLOBAL_MCP_IDS, MCP_PRESETS, isGlobalMcpSlug } from '@renderer/lib/mcpPresets'
import type { McpLocalConfig, McpLocalServerConfig } from '../../../preload/index.d'

export type McpTransport = 'streamable_http' | 'stdio'

export interface McpServerItem {
  id: string
  slug: string
  name: string
  description: string
  transport: McpTransport
  url: string | null
  command: string | null
  args: string[]
  enabled: boolean
  /** global = igual para todos (docs e abap); personal = cadastrado e ativado pelo próprio usuário. */
  scope?: 'global' | 'personal'
  cwd?: string
  env?: Record<string, string>
  headers?: Record<string, string>
  disabledTools?: string[]
}

export interface McpBindingItem {
  id: string
  serverId: string
  agentSource: AgentSource
  agentId: string
  enabled: boolean
}

interface McpState {
  loaded: boolean
  loading: boolean
  servers: McpServerItem[]
  bindings: McpBindingItem[]
  localConfig: McpLocalConfig
  error: string | null
  load: () => Promise<void>
  updateServer: (id: string, changes: Partial<Omit<McpServerItem, 'id'>>) => Promise<void>
  removeServer: (id: string) => Promise<void>
  toggleBinding: (serverId: string, agentSource: AgentSource, agentId: string) => Promise<void>
  configsForAgent: (agentSource?: AgentSource, agentId?: string) => McpServerItem[]
  reset: () => void
}

interface ServerRow {
  id: string
  slug: string
  name: string
  description: string | null
  transport: McpTransport
  url: string | null
  command: string | null
  args: unknown
  enabled: boolean
}

interface BindingRow {
  id: string
  server_id: string
  agent_source: AgentSource
  agent_id: string
  enabled: boolean
}

function currentUserId(): string | null {
  return useAuthStore.getState().user?.id ?? null
}

function parseArgs(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function mapServer(row: ServerRow): McpServerItem {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? '',
    transport: row.transport,
    url: row.slug === 'sap-docs' && row.url === 'http://mcp-sap-docs.marianzeis.de/mcp'
      ? 'https://mcp-sap-docs.marianzeis.de/mcp'
      : row.url,
    command: row.command,
    args: parseArgs(row.args),
    enabled: row.enabled
  }
}

/** MCPs globais, iguais para todas as contas. Só o perfil SAP é pessoal. */
export function globalMcpServers(): McpServerItem[] {
  return MCP_PRESETS.filter((preset) => isGlobalMcpSlug(preset.slug)).map((preset) => ({
    id: GLOBAL_MCP_IDS[preset.slug], slug: preset.slug, name: preset.name, description: preset.description,
    transport: preset.transport, url: preset.url, command: preset.command,
    // O perfil padrão do preset (DEV100) nunca é herdado: cada usuário informa o próprio.
    args: stripProfile(preset.args), enabled: true, scope: 'global' as const
  }))
}

function stripProfile(args: string[]): string[] {
  const index = args.indexOf('--profile')
  return index === -1 ? args : args.filter((_arg, position) => position !== index && position !== index + 1)
}

export function effectiveMcpServer(server: McpServerItem, local?: McpLocalServerConfig): McpServerItem {
  if (!local) return server
  const profile = local.profile?.trim()
  const args = server.slug === 'sap-abap'
    ? profile ? [...stripProfile(server.args), '--profile', profile] : stripProfile(server.args)
    : server.args
  return { ...server, cwd: local.cwd, env: local.env, headers: local.headers, disabledTools: local.disabledTools,
    // A identidade do servidor não pode ser trocada pela configuração local.
    args, url: server.url, command: server.command }
}

export const useMcpStore = create<McpState>((set, get) => ({
  loaded: false,
  loading: false,
  servers: [],
  bindings: [],
  localConfig: { version: 1, servers: {}, catalog: { servers: [], bindings: [] } },
  error: null,

  load: async () => {
    const userId = currentUserId()
    if (!userId) return
    set({ loading: true, error: null })
    const [{ data: serverRows, error: serverError }, { data: bindingRows, error: bindingError }, localResult] =
      await Promise.all([
        supabase.from('mcp_servers').select('*').eq('user_id', userId).order('created_at'),
        supabase.from('mcp_agent_bindings').select('*').eq('user_id', userId),
        window.api.mcp.readLocalConfig(userId).then((config) => ({ config, error: null as string | null })).catch((cause: Error) => ({ config: { version: 1 as const, servers: {}, catalog: { servers: [], bindings: [] } }, error: cause.message }))
      ])

    const error = serverError ?? bindingError
    if (error) {
      set({ loading: false, error: error.message })
      return
    }

    if (currentUserId() !== userId) return

    // Docs e ABAP são globais (código); linhas antigas desses slugs no banco são ignoradas.
    const personalServers = ((serverRows as ServerRow[] | null) ?? []).map(mapServer)
      .filter((server) => !isGlobalMcpSlug(server.slug)).map((server) => ({ ...server, scope: 'personal' as const }))
    const mappedServers = [...globalMcpServers(), ...personalServers]
    const mappedBindings = ((bindingRows as BindingRow[] | null) ?? []).map((row) => ({
      id: row.id, serverId: row.server_id, agentSource: row.agent_source, agentId: row.agent_id, enabled: row.enabled
    }))
    let localConfig = localResult.config
    let localError = localResult.error
    if (!localError) {
      try {
        localConfig = await window.api.mcp.saveLocalCatalog(userId, {
          servers: personalServers.map((server) => ({ id: server.id, slug: server.slug, name: server.name, transport: server.transport,
            url: server.url, command: server.command, args: server.args, enabled: server.enabled })),
          bindings: []
        })
      } catch (cause) { localError = (cause as Error).message }
    }
    if (currentUserId() !== userId) return

    set({
      loaded: true,
      loading: false,
      servers: mappedServers,
      localConfig,
      error: localError,
      bindings: mappedBindings
    })
  },

  updateServer: async (id, changes) => {
    const userId = currentUserId()
    if (!userId) return
    const payload: Record<string, unknown> = {}
    if (changes.name !== undefined) payload.name = changes.name
    if (changes.description !== undefined) payload.description = changes.description || null
    if (changes.url !== undefined) payload.url = changes.url
    if (changes.command !== undefined) payload.command = changes.command
    if (changes.args !== undefined) payload.args = changes.args
    if (changes.enabled !== undefined) payload.enabled = changes.enabled
    const { error } = await supabase
      .from('mcp_servers')
      .update(payload)
      .eq('user_id', userId)
      .eq('id', id)
    if (error) {
      set({ error: error.message })
      return
    }
    set((state) => ({
      servers: state.servers.map((server) => (server.id === id ? { ...server, ...changes } : server)),
      error: null
    }))
  },

  removeServer: async (id) => {
    const userId = currentUserId()
    if (!userId) return
    const { error } = await supabase.from('mcp_servers').delete().eq('user_id', userId).eq('id', id)
    if (error) {
      set({ error: error.message })
      return
    }
    set((state) => ({
      servers: state.servers.filter((server) => server.id !== id),
      bindings: state.bindings.filter((binding) => binding.serverId !== id),
      error: null
    }))
  },

  toggleBinding: async (serverId, agentSource, agentId) => {
    const userId = currentUserId()
    if (!userId) return
    const existing = get().bindings.find(
      (binding) =>
        binding.serverId === serverId &&
        binding.agentSource === agentSource &&
        binding.agentId === agentId
    )
    if (existing) {
      const { error } = await supabase
        .from('mcp_agent_bindings')
        .delete()
        .eq('user_id', userId)
        .eq('id', existing.id)
      if (!error) {
        set((state) => ({ bindings: state.bindings.filter((item) => item.id !== existing.id) }))
      }
      return
    }

    const { data, error } = await supabase
      .from('mcp_agent_bindings')
      .insert({ user_id: userId, server_id: serverId, agent_source: agentSource, agent_id: agentId })
      .select('*')
      .single()
    if (error || !data) {
      set({ error: error?.message ?? 'Não foi possível vincular o agente.' })
      return
    }
    const row = data as BindingRow
    set((state) => ({
      bindings: [
        ...state.bindings,
        {
          id: row.id,
          serverId: row.server_id,
          agentSource: row.agent_source,
          agentId: row.agent_id,
          enabled: row.enabled
        }
      ],
      error: null
    }))
  },

  // Sem vínculo por agente: todo MCP global ou pessoal ativo vale para qualquer agente.
  configsForAgent: () => {
    const projectServers = new Set(['ui5', 'cap', 'fiori'])
    const { servers, localConfig } = get()
    return servers.filter((server) => {
      if (!server.enabled) return false
      const local = localConfig.servers[server.id]
      // Servidores que operam sobre pasta/perfil local só entram depois que o usuário os configura.
      if (projectServers.has(server.slug)) return Boolean(local?.cwd)
      if (server.slug === 'sap-abap') return Boolean(local?.profile?.trim())
      return true
    }).map((server) => effectiveMcpServer(server, localConfig.servers[server.id]))
  },

  reset: () => set({ loaded: false, loading: false, servers: [], bindings: [], localConfig: { version: 1, servers: {}, catalog: { servers: [], bindings: [] } }, error: null })
}))
