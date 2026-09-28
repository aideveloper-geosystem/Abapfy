import { create } from 'zustand'
import { supabase } from '@renderer/lib/supabaseClient'
import { useAuthStore } from '@renderer/store/authStore'
import type { AgentSource } from '@renderer/store/agentsStore'

export interface ChatSummary {
  id: string
  title: string
  projectId: string | null
  agentName: string | null
  updatedAt: string
  clientId: string
  moduleId: string
  userId: string
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
}

export interface PersistedToolActivity {
  id: string
  label: string
  kind: 'skill' | 'mcp' | 'sap'
  status: 'running' | 'confirm' | 'done' | 'error'
}

export interface PersistedMessage {
  role: 'user' | 'assistant'
  content: string
  tokensInput: number | null
  tokensOutput: number | null
  responseMs: number | null
  toolActivity: PersistedToolActivity[] | null
  createdAt: string
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
  loaded: boolean
  recentChats: ChatSummary[]
  projects: ProjectSummary[]
  projectChats: Record<string, ChatSummary[]>
  load: () => Promise<void>
  loadProjectChats: (projectId: string) => Promise<void>
  createProject: (input: CreateProjectInput) => Promise<ProjectSummary | null>
  createChat: (input: CreateChatInput) => Promise<string | null>
  loadChatMeta: (chatId: string) => Promise<ChatMeta | null>
  loadChatMessages: (chatId: string) => Promise<PersistedMessage[]>
  persistMessage: (chatId: string, message: Omit<PersistedMessage, 'createdAt'>) => Promise<void>
  touchChat: (chatId: string, title?: string) => Promise<void>
  deleteChat: (chatId: string) => Promise<boolean>
  archiveChat: (chatId: string) => Promise<boolean>
  moveChatToProject: (chatId: string, projectId: string | null) => Promise<boolean>
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
}): ChatSummary {
  return {
    id: row.id,
    title: row.title,
    projectId: row.project_id,
    agentName: row.agent_name,
    updatedAt: row.updated_at,
    clientId: row.client_id,
    moduleId: row.module_id,
    userId: row.user_id
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  loaded: false,
  recentChats: [],
  projects: [],
  projectChats: {},

  load: async () => {
    const userId = currentUserId()
    if (!userId) return

    const [{ data: chatRows }, { data: projectRows }] = await Promise.all([
      supabase
        .from('chats')
        .select('id, title, project_id, agent_name, updated_at, client_id, module_id, user_id')
        .eq('archived', false)
        .is('project_id', null)
        .order('updated_at', { ascending: false })
        .limit(30),
      supabase
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false })
    ])

    set({
      loaded: true,
      recentChats: (chatRows ?? []).map(toChatSummary),
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
      .select('id, title, project_id, agent_name, updated_at, client_id, module_id, user_id')
      .eq('archived', false)
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false })

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
      .select('id, title, project_id, agent_name, updated_at, client_id, module_id, user_id')
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
      folderId: data.folder_id ?? null
    }
  },

  loadChatMessages: async (chatId) => {
    const { data } = await supabase
      .from('chat_messages')
      .select('role, content, tokens_input, tokens_output, response_ms, tool_activity, created_at')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true })

    return (data ?? []).map((row) => ({
      role: row.role,
      content: row.content,
      tokensInput: row.tokens_input,
      tokensOutput: row.tokens_output,
      responseMs: row.response_ms,
      toolActivity: row.tool_activity ?? null,
      createdAt: row.created_at
    }))
  },

  persistMessage: async (chatId, message) => {
    const userId = currentUserId()
    if (!userId) return

    await supabase.from('chat_messages').insert({
      chat_id: chatId,
      user_id: userId,
      role: message.role,
      content: message.content,
      tokens_input: message.tokensInput,
      tokens_output: message.tokensOutput,
      response_ms: message.responseMs,
      tool_activity: message.toolActivity
    })

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

    const { error } = await supabase.from('chats').delete().eq('id', chatId)
    if (error) return false

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

    const { error } = await supabase
      .from('chats')
      .update({ archived: true })
      .eq('id', chatId)
    if (error) return false

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
      .select('id, title, project_id, agent_name, updated_at, client_id, module_id, user_id')
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

  reset: () => set({ loaded: false, recentChats: [], projects: [], projectChats: {} })
}))
