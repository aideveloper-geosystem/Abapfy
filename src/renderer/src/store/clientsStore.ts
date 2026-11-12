import { create } from 'zustand'
import { supabase } from '@renderer/lib/supabaseClient'
import { useAuthStore } from './authStore'
import { currentClientPermissions, currentWorkspaceId } from './workspaceStore'

export interface ClientModule {
  id: string
  clientId: string
  createdBy?: string | null
  name: string
  description: string | null
  createdAt: string
}
export interface Client {
  id: string
  name: string
  description: string | null
  workbookMd: string | null
  createdAt: string
  createdBy: string | null
  /** Set when the client is archived (hidden from the default list, nothing is deleted). */
  archivedAt: string | null
}
export interface ClientStats {
  projects: number
  chats: number
  files: number
  /** Latest chat update or file upload, ISO string. */
  lastActivity: string | null
}
export interface CreateClientOptions {
  /** Extra modules besides the default ones seeded by the database (Programas, EFs, DTECs). */
  extraModules?: string[]
  /** Copy the workbook (rules and context) from another client. */
  workbookFrom?: string | null
}
interface ClientsState {
  clients: Client[]
  modules: ClientModule[]
  favorites: string[]
  stats: Record<string, ClientStats>
  error: string | null
  load: () => Promise<void>
  loadStats: () => Promise<void>
  toggleFavorite: (clientId: string) => Promise<void>
  archiveClient: (client: Client, archived: boolean) => Promise<void>
  createClient: (name: string, description: string, options?: CreateClientOptions) => Promise<string | null>
  deleteClient: (clientId: string) => Promise<void>
  updateClient: (
    client: Client,
    name: string,
    description: string,
    workbookMd: string | null
  ) => Promise<void>
  createModule: (clientId: string, name: string, description: string) => Promise<void>
  updateModule: (module: ClientModule, name: string, description: string) => Promise<void>
  reset: () => void
}

export const useClientsStore = create<ClientsState>((set, get) => ({
  clients: [],
  modules: [],
  favorites: [],
  stats: {},
  error: null,
  load: async () => {
    const [clientsResult, modulesResult] = await Promise.all([
      supabase.from('clients').select('*').order('name'),
      supabase.from('client_modules').select('*').order('name')
    ])
    if (clientsResult.error || modulesResult.error) {
      set({
        error:
          clientsResult.error?.message ??
          modulesResult.error?.message ??
          'Falha ao carregar clientes'
      })
      return
    }
    set({
      error: null,
      clients: (clientsResult.data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        workbookMd: row.workbook_md,
        createdAt: row.created_at,
        createdBy: row.created_by,
        archivedAt: row.archived_at ?? null
      })),
      modules: (modulesResult.data ?? []).map((row) => ({
        id: row.id,
        clientId: row.client_id,
        createdBy: row.created_by ?? null,
        name: row.name,
        description: row.description,
        createdAt: row.created_at
      }))
    })
  },
  createClient: async (name, description, options = {}) => {
    const userId = useAuthStore.getState().user?.id
    if (!userId) throw new Error('Sua sessão expirou. Entre novamente para criar o cliente.')
    if (!currentClientPermissions().canEdit) throw new Error('Somente proprietários e administradores podem criar clientes.')
    const workspaceId = currentWorkspaceId()
    const source = options.workbookFrom ? get().clients.find((client) => client.id === options.workbookFrom) : undefined
    const { data, error } = await supabase
      .from('clients')
      .insert({
        // workspace_id is optional: before migration 041 the column does not exist.
        ...(workspaceId ? { workspace_id: workspaceId } : {}),
        name: name.trim(),
        description: description.trim() || null,
        ...(source?.workbookMd ? { workbook_md: source.workbookMd } : {}),
        created_by: userId,
        updated_by: userId
      })
      .select('id')
      .single()
    if (error) throw error
    const id = (data as { id: string } | null)?.id ?? null
    const defaults = new Set(['programas', 'efs', 'dtecs'])
    const seen = new Set(defaults)
    const extras = (options.extraModules ?? [])
      .map((item) => item.trim())
      .filter((item) => {
        const key = item.toLowerCase()
        if (!item || seen.has(key)) return false
        seen.add(key)
        return true
      })
    if (id) {
      for (const module of extras) {
        const { error: moduleError } = await supabase
          .from('client_modules')
          .insert({ client_id: id, name: module, created_by: userId })
        if (moduleError) throw moduleError
      }
    }
    await get().load()
    return id
  },
  loadStats: async () => {
    const [chats, files, projects] = await Promise.all([
      supabase.from('chats').select('client_id, updated_at').order('updated_at', { ascending: false }).limit(5000),
      supabase.from('client_files').select('client_id, created_at').is('deleted_at', null).limit(10000),
      supabase.from('projects').select('client_id').limit(5000)
    ])
    const stats: Record<string, ClientStats> = {}
    const bucket = (id: string): ClientStats => (stats[id] ??= { projects: 0, chats: 0, files: 0, lastActivity: null })
    const touch = (entry: ClientStats, at: string | null | undefined): void => {
      if (at && (!entry.lastActivity || at > entry.lastActivity)) entry.lastActivity = at
    }
    for (const row of (chats.data ?? []) as { client_id: string; updated_at: string }[]) {
      const entry = bucket(row.client_id)
      entry.chats += 1
      touch(entry, row.updated_at)
    }
    for (const row of (files.data ?? []) as { client_id: string; created_at: string }[]) {
      const entry = bucket(row.client_id)
      entry.files += 1
      touch(entry, row.created_at)
    }
    for (const row of (projects.data ?? []) as { client_id: string }[]) bucket(row.client_id).projects += 1
    set({ stats })
    const userId = useAuthStore.getState().user?.id
    if (userId) {
      const { data } = await supabase.from('client_favorites').select('client_id').eq('user_id', userId)
      set({ favorites: ((data ?? []) as { client_id: string }[]).map((row) => row.client_id) })
    }
  },
  toggleFavorite: async (clientId) => {
    const userId = useAuthStore.getState().user?.id
    if (!userId) return
    const isFavorite = get().favorites.includes(clientId)
    // Optimistic: favorites are personal and cheap to roll back.
    set((state) => ({ favorites: isFavorite ? state.favorites.filter((id) => id !== clientId) : [...state.favorites, clientId] }))
    const { error } = isFavorite
      ? await supabase.from('client_favorites').delete().eq('user_id', userId).eq('client_id', clientId)
      : await supabase.from('client_favorites').insert({ user_id: userId, client_id: clientId })
    if (error) {
      set((state) => ({ favorites: isFavorite ? [...state.favorites, clientId] : state.favorites.filter((id) => id !== clientId) }))
      throw error
    }
  },
  archiveClient: async (client, archived) => {
    const userId = useAuthStore.getState().user?.id
    if (!userId) throw new Error('Sua sessão expirou. Entre novamente.')
    if (!currentClientPermissions().canEdit) throw new Error('Somente proprietários e administradores podem arquivar clientes.')
    const { error } = await supabase
      .from('clients')
      .update({ archived_at: archived ? new Date().toISOString() : null, updated_by: userId })
      .eq('id', client.id)
    if (error) throw error
    await get().load()
  },
  deleteClient: async (clientId) => {
    const { user } = useAuthStore.getState()
    if (!user || !currentClientPermissions().canDelete) {
      throw new Error('Somente o proprietário do workspace pode excluir clientes. Administradores podem arquivar.')
    }
    const contents = await Promise.all(
      ['client_files', 'chats', 'projects'].map((table) =>
        supabase.from(table).select('id', { count: 'exact', head: true }).eq('client_id', clientId)
      )
    )
    for (const result of contents) {
      if (result.error) throw result.error
      if (result.count === null) throw new Error('Não foi possível verificar o conteúdo do cliente.')
      if (result.count > 0) {
        throw new Error('Este cliente possui arquivos, chats ou projetos. Remova ou transfira esse conteúdo antes de excluir o cliente, incluindo os arquivos na lixeira.')
      }
    }
    const { data, error } = await supabase.from('clients').delete().eq('id', clientId).select('id').single()
    if (error) {
      if (error.code === '23503' || error.code === 'P0001') {
        throw new Error('O cliente possui conteúdo vinculado e não pode ser excluído.')
      }
      throw error
    }
    if (!data) throw new Error('Cliente não encontrado ou exclusão não autorizada.')
    set((state) => ({
      clients: state.clients.filter((client) => client.id !== clientId),
      modules: state.modules.filter((module) => module.clientId !== clientId)
    }))
  },
  updateClient: async (client, name, description, workbookMd) => {
    const userId = useAuthStore.getState().user?.id
    if (!userId) return
    const { error } = await supabase
      .from('clients')
      .update({
        name: name.trim(),
        description: description.trim() || null,
        workbook_md: workbookMd,
        updated_by: userId
      })
      .eq('id', client.id)
    if (error) throw error
    await get().load()
  },
  createModule: async (clientId, name, description) => {
    const userId = useAuthStore.getState().user?.id
    if (!userId) return
    const { error } = await supabase.from('client_modules').insert({
      client_id: clientId,
      name: name.trim(),
      description: description.trim() || null,
      created_by: userId
    })
    if (error) throw error
    await get().load()
  },
  updateModule: async (module, name, description) => {
    const { error } = await supabase
      .from('client_modules')
      .update({ name: name.trim(), description: description.trim() || null })
      .eq('id', module.id)
    if (error) throw error
    await get().load()
  },
  reset: () => set({ clients: [], modules: [], favorites: [], stats: {}, error: null })
}))
