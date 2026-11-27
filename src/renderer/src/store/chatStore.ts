import type { WorkProgress } from '@renderer/lib/workProgress'
import { create } from 'zustand'
import { supabase } from '@renderer/lib/supabaseClient'
import { useAuthStore } from '@renderer/store/authStore'
import type { OwnerFilter } from '@renderer/lib/contentOwnership'
import type { AgentSource } from '@renderer/store/agentsStore'
import type { EfDocumentJob } from '@renderer/lib/efDrive'
import type { LocalSearchActivity } from '../../../shared/localFeatures'
import type { CompactionActivity } from '../../../shared/compaction'

export interface ChatSummary {
  id: string
  title: string
  projectId: string | null
  agentName: string | null
  updatedAt: string
  clientId: string
  moduleId: string
  userId: string
  isPublic: boolean
  archived: boolean
}

export interface ProjectSummary {
  id: string
  name: string
  description: string | null
  context: string | null
  defaultAgentSource: AgentSource | null
  defaultAgentId: string | null
  clientId: string
  userId: string
  createdAt: string
}

export interface ChatMeta {
  id: string
  title: string
  projectId: string | null
  agentSource: AgentSource | null
  agentId: string | null
  agentName: string | null
  systemPrompt: string | null
  provider: string | null
  model: string | null
  skillIds: string[]
  sapEnvironmentId: string | null
  sapEnvironmentLabel: string | null
  clientId: string
  moduleId: string
  folderId: string | null
  userId: string
  isPublic: boolean
}

export interface PersistedToolActivity {
  id: string
  label: string
  kind: 'skill' | 'mcp' | 'sap' | 'web' | 'source' | 'document' | 'local' | 'compact'
  status: 'running' | 'confirm' | 'done' | 'error'
  workProgress?: WorkProgress
  url?: string
  efDocument?: EfDocumentJob
  localSearch?: LocalSearchActivity
  compaction?: CompactionActivity
}

export interface PersistedMessage {
  role: 'user' | 'assistant'
  content: string
  tokensInput: number | null
  tokensOutput: number | null
  responseMs: number | null
  toolActivity: PersistedToolActivity[] | null
  /** Resumo do raciocínio e tempo pensando (Claude). Coluna opcional — ver 033. */
  thinking?: PersistedThinking | null
  createdAt: string
}

export interface PersistedThinking {
  text: string
  ms: number
}

interface ChatMessageRow {
  role: 'user' | 'assistant'
  content: string
  tokens_input: number | null
  tokens_output: number | null
  response_ms: number | null
  tool_activity: PersistedToolActivity[] | null
  thinking?: PersistedThinking | null
  created_at: string
}

interface CreateChatInput {
  clientId: string
  moduleId: string
  folderId: string | null
  projectId: string | null
  title: string
  agentSource: AgentSource | null
  agentId: string | null
  agentName: string | null
  systemPrompt: string | null
  provider: string
  model: string
  skillIds: string[]
  sapEnvironmentId: string | null
  sapEnvironmentLabel: string | null
}

interface CreateProjectInput {
  clientId: string
  name: string
  description: string
  context: string
  defaultAgentSource: AgentSource | null
  defaultAgentId: string | null
}

interface ChatState {
  error: string | null
  loaded: boolean
  recentChats: ChatSummary[]
  projects: ProjectSummary[]
  projectChats: Record<string, ChatSummary[]>
  load: () => Promise<void>
  loadProjectChats: (projectId: string) => Promise<void>
  createProject: (input: CreateProjectInput) => Promise<ProjectSummary | null>
  deleteProject: (projectId: string) => Promise<void>
  createChat: (input: CreateChatInput) => Promise<string | null>
  loadChatMeta: (chatId: string) => Promise<ChatMeta | null>
  loadChatMessages: (chatId: string) => Promise<PersistedMessage[]>
  persistMessage: (chatId: string, message: Omit<PersistedMessage, 'createdAt'>) => Promise<void>
  touchChat: (chatId: string, title?: string) => Promise<void>
  deleteChat: (chatId: string) => Promise<boolean>
  archiveChat: (chatId: string) => Promise<boolean>
  moveChatToProject: (chatId: string, projectId: string | null) => Promise<boolean>
  setChatPublic: (chatId: string, isPublic: boolean) => Promise<boolean>
  restoreChat: (chatId: string) => Promise<boolean>
  duplicateChat: (chatId: string) => Promise<string>
  reset: () => void
}

function currentUserId(): string | null {
  return useAuthStore.getState().user?.id ?? null
}

function toChatSummary(row: {
  id: string
  title: string
  project_id: string | null
  agent_name: string | null
  updated_at: string
  client_id: string
  module_id: string
  user_id: string
  is_public?: boolean | null
  archived?: boolean | null
}): ChatSummary {
  return {
    id: row.id,
    title: row.title,
    projectId: row.project_id,
    agentName: row.agent_name,
    updatedAt: row.updated_at,
    clientId: row.client_id,
    moduleId: row.module_id,
    userId: row.user_id,
    isPublic: Boolean(row.is_public),
    archived: Boolean(row.archived)
  }
}

const CHAT_COLUMNS =
  'id, title, project_id, agent_name, updated_at, client_id, module_id, user_id, is_public, archived'
export const CHAT_PAGE_SIZE = 50

export interface ChatSearchFilters {
  query?: string
  clientId?: string | null
  owner?: OwnerFilter
  publicOnly?: boolean
  archived?: boolean
  since?: string | null
  offset?: number
}

export interface ChatSearchResult extends ChatSummary {
  /** Trecho da primeira mensagem que corresponde à busca. */
  excerpt: string | null
}

/** Searches titles and message contents; row level security limits what can be found (migration 048). */
export async function searchChats(
  filters: ChatSearchFilters
): Promise<{ chats: ChatSearchResult[]; hasMore: boolean }> {
  const userId = currentUserId()
  if (!userId) throw new Error('Entre novamente para carregar as sessões.')
  const owner = filters.owner ?? 'all'
  if (owner === 'unknown') return { chats: [], hasMore: false }
  const { data, error } = await supabase.rpc('search_chats', {
    p_query: filters.query?.trim() ?? '',
    p_client: filters.clientId ?? null,
    p_user: owner === 'mine' ? userId : owner.startsWith('user:') ? owner.slice(5) : null,
    p_exclude_user: owner === 'team' ? userId : null,
    p_public_only: filters.publicOnly ?? false,
    p_archived: filters.archived ?? false,
    p_since: filters.since ?? null,
    p_limit: CHAT_PAGE_SIZE + 1,
    p_offset: filters.offset ?? 0
  })
  if (currentUserId() !== userId) throw new Error('A conta mudou durante o carregamento.')
  if (error)
    throw new Error(`${error.message}. Confira se a migração 048 foi aplicada no Supabase.`)
  const rows = (data ?? []) as Array<
    Parameters<typeof toChatSummary>[0] & { excerpt: string | null }
  >
  return {
    chats: rows
      .slice(0, CHAT_PAGE_SIZE)
      .map((row) => ({ ...toChatSummary(row), excerpt: row.excerpt })),
    hasMore: rows.length > CHAT_PAGE_SIZE
  }
}

export async function loadModuleChatPage(clientId: string, moduleId: string, offset = 0, owner: OwnerFilter = 'all'): Promise<{ chats: ChatSummary[]; hasMore: boolean }> {
  const userId = currentUserId()
  if (!userId) throw new Error('Entre novamente para carregar os chats.')
  let query = supabase.from('chats').select(CHAT_COLUMNS)
    .eq('archived', false).eq('client_id', clientId).eq('module_id', moduleId)
  if (owner === 'mine') query = query.eq('user_id', userId)
  else if (owner === 'team') query = query.neq('user_id', userId)
  else if (owner === 'unknown') query = query.is('user_id', null)
  else if (owner.startsWith('user:')) query = query.eq('user_id', owner.slice(5))
  const { data, error } = await query.order('updated_at', { ascending: false }).order('id').range(offset, offset + 50)
  if (currentUserId() !== userId) throw new Error('A conta mudou durante o carregamento.')
  if (error) throw error
  return { chats: (data ?? []).slice(0, 50).map(toChatSummary), hasMore: (data?.length ?? 0) > 50 }
}

export const useChatStore = create<ChatState>((set, get) => ({
  error: null,
  loaded: false,
  recentChats: [],
  projects: [],
  projectChats: {},

  load: async () => {
    const userId = currentUserId()
    if (!userId) return

    const [{ data: ownRows, error: ownError }, { data: teamRows, error: teamError }, { data: projectRows }] = await Promise.all([
      supabase
        .from('chats')
        .select(CHAT_COLUMNS)
        .eq('archived', false)
        .is('project_id', null)
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(30),
      supabase.from('chats')
        .select(CHAT_COLUMNS)
        .eq('archived', false).is('project_id', null).neq('user_id', userId)
        .order('updated_at', { ascending: false }).limit(30),
      supabase
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false })
    ])

    if (currentUserId() !== userId) return
    if (ownError || teamError) { set({ error: (ownError ?? teamError)?.message ?? 'Falha ao carregar chats.' }); return }
    const chatRows = [...(ownRows ?? []), ...(teamRows ?? [])].sort((a,b) => b.updated_at.localeCompare(a.updated_at))
    set({
      error: null,
      loaded: true,
      recentChats: chatRows.map(toChatSummary),
      projects: (projectRows ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        context: row.context,
        defaultAgentSource: row.default_agent_source,
        defaultAgentId: row.default_agent_id,
        clientId: row.client_id,
        userId: row.user_id,
        createdAt: row.created_at
      }))
    })
  },

  loadProjectChats: async (projectId) => {
    const userId = currentUserId()
    if (!userId) return

    const { data } = await supabase
      .from('chats')
      .select(CHAT_COLUMNS)
      .eq('archived', false)
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false })

    if (currentUserId() !== userId || !get().projects.some(project => project.id === projectId)) return
    set((state) => ({
      projectChats: { ...state.projectChats, [projectId]: (data ?? []).map(toChatSummary) }
    }))
  },

  createProject: async (input) => {
    const userId = currentUserId()
    if (!userId) return null

    const { data, error } = await supabase
      .from('projects')
      .insert({
        user_id: userId,
        client_id: input.clientId,
        name: input.name.trim(),
        description: input.description.trim() || null,
        context: input.context.trim() || null,
        default_agent_source: input.defaultAgentSource,
        default_agent_id: input.defaultAgentId
      })
      .select('*')
      .single()

    if (error || !data) return null

    const project: ProjectSummary = {
      id: data.id,
      name: data.name,
      description: data.description,
      context: data.context,
      defaultAgentSource: data.default_agent_source,
      defaultAgentId: data.default_agent_id,
      clientId: data.client_id,
      userId: data.user_id,
      createdAt: data.created_at
    }

    set((state) => ({ projects: [project, ...state.projects] }))
    return project
  },

  deleteProject: async (projectId) => {
    const userId = currentUserId()
    if (!userId) throw new Error('Sua sessão expirou. Entre novamente para excluir o projeto.')
    const { data, error } = await supabase.from('projects').delete().eq('id', projectId).select('id').single()
    if (error) throw new Error(error.code === 'PGRST116' ? 'Projeto não encontrado ou exclusão não autorizada.' : error.message)
    if (!data || data.id !== projectId) throw new Error('O servidor não confirmou a exclusão do projeto.')
    if (currentUserId() !== userId) return
    set(state => {
      const restored = (state.projectChats[projectId] ?? []).map(chat => ({ ...chat, projectId: null }))
      const projectChats = { ...state.projectChats }
      delete projectChats[projectId]
      const chats = [...restored, ...state.recentChats].filter((chat, index, all) => all.findIndex(item => item.id === chat.id) === index)
      return { projects: state.projects.filter(project => project.id !== projectId), projectChats,
        recentChats: chats.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)) }
    })
    // Refresh detached chats without replaying a deletion if refresh fails.
    try { await get().load() } catch { if (currentUserId() === userId) set({ error: 'Projeto excluído. Não foi possível atualizar os chats; tente atualizar a lista.' }) }
  },

  createChat: async (input) => {
    const userId = currentUserId()
    if (!userId) return null

    const { data, error } = await supabase
      .from('chats')
      .insert({
        user_id: userId,
        client_id: input.clientId,
        module_id: input.moduleId,
        folder_id: input.folderId,
        project_id: input.projectId,
        title: input.title,
        agent_source: input.agentSource,
        agent_id: input.agentId,
        agent_name: input.agentName,
        system_prompt: input.systemPrompt,
        provider: input.provider,
        model: input.model,
        skill_ids: input.skillIds,
        sap_environment_id: input.sapEnvironmentId,
        sap_environment_label: input.sapEnvironmentLabel
      })
      .select(CHAT_COLUMNS)
      .single()

    if (error || !data) return null

    const summary = toChatSummary(data)
    if (summary.projectId) {
      set((state) => ({
        projectChats: {
          ...state.projectChats,
          [summary.projectId as string]: [
            summary,
            ...(state.projectChats[summary.projectId as string] ?? [])
          ]
        }
      }))
    } else {
      set((state) => ({ recentChats: [summary, ...state.recentChats] }))
    }

    return data.id as string
  },

  loadChatMeta: async (chatId) => {
    const { data } = await supabase.from('chats').select('*').eq('id', chatId).single()
    if (!data) return null

    return {
      id: data.id,
      title: data.title,
      projectId: data.project_id,
      agentSource: data.agent_source,
      agentId: data.agent_id,
      agentName: data.agent_name,
      systemPrompt: data.system_prompt,
      provider: data.provider,
      model: data.model,
      skillIds: data.skill_ids ?? [],
      sapEnvironmentId: data.sap_environment_id ?? null,
      sapEnvironmentLabel: data.sap_environment_label ?? null,
      clientId: data.client_id,
      moduleId: data.module_id,
      folderId: data.folder_id ?? null,
      userId: data.user_id,
      isPublic: Boolean(data.is_public)
    }
  },

  loadChatMessages: async (chatId) => {
    const baseColumns = 'role, content, tokens_input, tokens_output, response_ms, tool_activity, created_at'
    const select = (columns: string) =>
      supabase.from('chat_messages').select(columns).eq('chat_id', chatId).order('created_at', { ascending: true })

    // `thinking` vem da migração 033; enquanto ela não estiver aplicada o select
    // com a coluna falha, então repetimos sem ela para o histórico continuar abrindo.
    let { data, error } = await select(`${baseColumns}, thinking`)
    if (error) ({ data, error } = await select(baseColumns))

    return ((data ?? []) as unknown as ChatMessageRow[]).map((row) => ({
      role: row.role,
      content: row.content,
      tokensInput: row.tokens_input,
      tokensOutput: row.tokens_output,
      responseMs: row.response_ms,
      toolActivity: row.tool_activity ?? null,
      thinking: row.thinking ?? null,
      createdAt: row.created_at
    }))
  },

  persistMessage: async (chatId, message) => {
    const userId = currentUserId()
    if (!userId) return

    const row = {
      chat_id: chatId,
      user_id: userId,
      role: message.role,
      content: message.content,
      tokens_input: message.tokensInput,
      tokens_output: message.tokensOutput,
      response_ms: message.responseMs,
      tool_activity: message.toolActivity
    }
    // Sem a migração 033 a coluna `thinking` não existe: nunca perder a mensagem
    // por causa do resumo de raciocínio — grava de novo sem ele.
    const { error } = await supabase
      .from('chat_messages')
      .insert({ ...row, ...(message.thinking ? { thinking: message.thinking } : {}) })
    if (error && message.thinking) await supabase.from('chat_messages').insert(row)

    await get().touchChat(chatId)
  },

  touchChat: async (chatId, title) => {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (title) patch.title = title

    await supabase.from('chats').update(patch).eq('id', chatId)

    set((state) => {
      const bump = (chats: ChatSummary[]): ChatSummary[] => {
        const index = chats.findIndex((chat) => chat.id === chatId)
        if (index === -1) return chats
        const updated = {
          ...chats[index],
          title: title ?? chats[index].title,
          updatedAt: patch.updated_at as string
        }
        return [updated, ...chats.slice(0, index), ...chats.slice(index + 1)]
      }

      const nextProjectChats = { ...state.projectChats }
      Object.keys(nextProjectChats).forEach((projectId) => {
        nextProjectChats[projectId] = bump(nextProjectChats[projectId])
      })

      return {
        recentChats: bump(state.recentChats),
        projectChats: nextProjectChats
      }
    })
  },

  deleteChat: async (chatId) => {
    const userId = currentUserId()
    if (!userId) return false

    // RLS ignora em silêncio quem não é o autor: só confirma se a linha voltar.
    const { data, error } = await supabase.from('chats').delete().eq('id', chatId).select('id')
    if (error || !data?.length) return false

    set((state) => ({
      recentChats: state.recentChats.filter((chat) => chat.id !== chatId),
      projectChats: Object.fromEntries(
        Object.entries(state.projectChats).map(([projectId, chats]) => [
          projectId,
          chats.filter((chat) => chat.id !== chatId)
        ])
      )
    }))
    return true
  },

  archiveChat: async (chatId) => {
    const userId = currentUserId()
    if (!userId) return false

    const { data, error } = await supabase
      .from('chats')
      .update({ archived: true })
      .eq('id', chatId)
      .select('id')
    if (error || !data?.length) return false

    set((state) => ({
      recentChats: state.recentChats.filter((chat) => chat.id !== chatId),
      projectChats: Object.fromEntries(
        Object.entries(state.projectChats).map(([projectId, chats]) => [
          projectId,
          chats.filter((chat) => chat.id !== chatId)
        ])
      )
    }))
    return true
  },

  moveChatToProject: async (chatId, projectId) => {
    const userId = currentUserId()
    if (!userId) return false

    const { data, error } = await supabase
      .from('chats')
      .update({ project_id: projectId })
      .eq('id', chatId)
      .select(CHAT_COLUMNS)
      .single()
    if (error || !data) return false

    const summary = toChatSummary(data)

    set((state) => {
      const withoutChat = (chats: ChatSummary[]): ChatSummary[] =>
        chats.filter((chat) => chat.id !== chatId)

      const nextProjectChats = Object.fromEntries(
        Object.entries(state.projectChats).map(([id, chats]) => [id, withoutChat(chats)])
      )
      if (projectId) {
        nextProjectChats[projectId] = [summary, ...(nextProjectChats[projectId] ?? [])]
      }

      return {
        recentChats: projectId
          ? withoutChat(state.recentChats)
          : [summary, ...withoutChat(state.recentChats)],
        projectChats: nextProjectChats
      }
    })
    return true
  },

  setChatPublic: async (chatId, isPublic) => {
    if (!currentUserId()) return false

    const { data, error } = await supabase
      .from('chats')
      .update({ is_public: isPublic })
      .eq('id', chatId)
      .select('id')
    if (error || !data?.length) return false

    const mark = (chats: ChatSummary[]): ChatSummary[] =>
      chats.map((chat) => (chat.id === chatId ? { ...chat, isPublic } : chat))
    set((state) => ({
      recentChats: mark(state.recentChats),
      projectChats: Object.fromEntries(
        Object.entries(state.projectChats).map(([projectId, chats]) => [projectId, mark(chats)])
      )
    }))
    return true
  },

  restoreChat: async (chatId) => {
    if (!currentUserId()) return false

    const { data, error } = await supabase
      .from('chats')
      .update({ archived: false })
      .eq('id', chatId)
      .select('id')
    if (error || !data?.length) return false
    await get().load()
    return true
  },

  /** Private copy of a session published by someone else, so the reader can continue it. */
  duplicateChat: async (chatId) => {
    const userId = currentUserId()
    if (!userId) throw new Error('Entre novamente para duplicar a sessão.')
    const meta = await get().loadChatMeta(chatId)
    if (!meta) throw new Error('A sessão não está mais disponível.')
    const messages = await get().loadChatMessages(chatId)

    const newId = await get().createChat({
      clientId: meta.clientId,
      moduleId: meta.moduleId,
      folderId: meta.folderId,
      projectId: meta.projectId,
      title: `Cópia · ${meta.title}`.slice(0, 120),
      agentSource: meta.agentSource,
      agentId: meta.agentId,
      agentName: meta.agentName,
      systemPrompt: meta.systemPrompt,
      provider: meta.provider ?? '',
      model: meta.model ?? '',
      skillIds: meta.skillIds,
      sapEnvironmentId: meta.sapEnvironmentId,
      sapEnvironmentLabel: meta.sapEnvironmentLabel
    })
    if (!newId) throw new Error('Não foi possível criar a cópia da sessão.')

    // Copia só o texto: documentos, tokens e progresso pertencem à execução original.
    // O horário original é mantido porque ele define a ordem das mensagens.
    const rows = messages
      .filter((message) => message.content.trim())
      .map((message) => ({
        chat_id: newId,
        user_id: userId,
        role: message.role,
        content: message.content,
        created_at: message.createdAt
      }))
    if (rows.length) {
      const { error } = await supabase.from('chat_messages').insert(rows)
      if (error) {
        await get().deleteChat(newId)
        throw new Error(`Não foi possível copiar as mensagens: ${error.message}`)
      }
    }
    return newId
  },

  reset: () => set({ error: null, loaded: false, recentChats: [], projects: [], projectChats: {} })
}))
