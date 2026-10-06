import { create } from 'zustand'
import { supabase } from '@renderer/lib/supabaseClient'
import { useAuthStore } from './authStore'

export interface ClientModule {
  id: string
  clientId: string
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
}
interface ClientsState {
  clients: Client[]
  modules: ClientModule[]
  error: string | null
  load: () => Promise<void>
  createClient: (name: string, description: string) => Promise<void>
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
        createdBy: row.created_by
      })),
      modules: (modulesResult.data ?? []).map((row) => ({
        id: row.id,
        clientId: row.client_id,
        name: row.name,
        description: row.description,
        createdAt: row.created_at
      }))
    })
  },
  createClient: async (name, description) => {
    const userId = useAuthStore.getState().user?.id
    if (!userId) throw new Error('Sua sessão expirou. Entre novamente para criar o cliente.')
    const { error } = await supabase.from('clients').insert({
      name: name.trim(),
      description: description.trim() || null,
      created_by: userId,
      updated_by: userId
    })
    if (error) throw error
    await get().load()
  },
  deleteClient: async (clientId) => {
    const { user, role } = useAuthStore.getState()
    if (!user || (role !== 'MASTER' && role !== 'ADMIN')) {
      throw new Error('Somente MASTER ou ADMIN podem excluir clientes.')
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
  reset: () => set({ clients: [], modules: [], error: null })
}))
