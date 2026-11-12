import { create } from 'zustand'
import { supabase } from '@renderer/lib/supabaseClient'
import {
  canManageClients,
  clientPermissions,
  effectiveRole,
  type ClientPermissions,
  isWorkspaceAdmin,
  isWorkspaceRole,
  normalizeJoinCode,
  workspaceErrorMessage,
  type WorkspaceRole
} from '@renderer/lib/workspaceAccess'
import { useAuthStore } from './authStore'

export interface WorkspaceInfo {
  id: string
  name: string
  role: WorkspaceRole
  /** Only visible to OWNER/ADMIN. */
  joinCode: string | null
}

export interface WorkspaceMember {
  userId: string
  nome: string | null
  cargo: string | null
  /** Only returned to OWNER/ADMIN. */
  email: string | null
  role: WorkspaceRole
  joinedAt: string
}

export interface JoinRequest {
  id: string
  userId: string
  nome: string | null
  email: string
  message: string | null
  createdAt: string
}

export interface MyJoinRequest {
  id: string
  workspaceName: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  createdAt: string
}

interface WorkspaceState {
  /** idle → loading → ready. `legacy` means migration 041 is not applied: the app keeps working without workspaces. */
  status: 'idle' | 'loading' | 'ready'
  legacy: boolean
  workspace: WorkspaceInfo | null
  members: WorkspaceMember[]
  requests: JoinRequest[]
  myRequests: MyJoinRequest[]
  error: string | null
  load: () => Promise<void>
  loadAdmin: () => Promise<void>
  createWorkspace: (name: string) => Promise<boolean>
  requestJoin: (code: string, message: string) => Promise<boolean>
  cancelRequest: (id: string) => Promise<void>
  decide: (id: string, approve: boolean, role?: WorkspaceRole) => Promise<boolean>
  setMemberRole: (userId: string, role: WorkspaceRole) => Promise<boolean>
  removeMember: (userId: string) => Promise<boolean>
  regenerateCode: () => Promise<void>
  rename: (name: string) => Promise<boolean>
  clearError: () => void
  reset: () => void
}

type Row = Record<string, unknown>
const str = (value: unknown): string => (typeof value === 'string' ? value : '')
const strOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null)

/** PostgREST answers PGRST202 / 42883 when an RPC does not exist yet (migration 041 pending). */
function isMissingMigration(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message ?? '')
}

const initial = {
  status: 'idle' as const,
  legacy: false,
  workspace: null,
  members: [],
  requests: [],
  myRequests: [],
  error: null
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => {
  async function run(action: () => PromiseLike<{ error: { message: string } | null }>): Promise<boolean> {
    set({ error: null })
    const { error } = await action()
    if (error) {
      set({ error: workspaceErrorMessage(error.message) })
      return false
    }
    return true
  }

  return {
    ...initial,

    load: async () => {
      set({ status: 'loading', error: null })
      const mine = await supabase.rpc('my_workspace')
      if (isMissingMigration(mine.error)) {
        set({ ...initial, status: 'ready', legacy: true })
        return
      }
      if (mine.error) {
        // Keep the user out of the gate on transient errors; they can retry from the gate screen.
        set({ status: 'ready', workspace: null, error: workspaceErrorMessage(mine.error.message) })
        return
      }
      const row = ((mine.data ?? []) as Row[])[0]
      const role = row?.role
      const workspace: WorkspaceInfo | null =
        row && isWorkspaceRole(role)
          ? { id: str(row.id), name: str(row.name), role, joinCode: strOrNull(row.join_code) }
          : null
      set({ status: 'ready', legacy: false, workspace })
      if (!workspace) {
        const pending = await supabase.rpc('my_workspace_join_requests')
        set({
          myRequests: ((pending.data ?? []) as Row[]).map((item) => ({
            id: str(item.id),
            workspaceName: str(item.workspace_name),
            status: str(item.status) as MyJoinRequest['status'],
            createdAt: str(item.created_at)
          }))
        })
      } else {
        await get().loadAdmin()
      }
    },

    loadAdmin: async () => {
      const workspace = get().workspace
      if (!workspace) return
      const members = await supabase.rpc('list_workspace_members', { p_workspace: workspace.id })
      if (members.error) {
        set({ error: workspaceErrorMessage(members.error.message) })
        return
      }
      const requests = isWorkspaceAdmin(workspace.role)
        ? await supabase.rpc('list_workspace_join_requests', { p_workspace: workspace.id })
        : { data: [] as Row[], error: null }
      set({
        members: ((members.data ?? []) as Row[]).flatMap((item) =>
          isWorkspaceRole(item.role)
            ? [
                {
                  userId: str(item.user_id),
                  nome: strOrNull(item.nome),
                  cargo: strOrNull(item.cargo),
                  email: strOrNull(item.email),
                  role: item.role,
                  joinedAt: str(item.created_at)
                }
              ]
            : []
        ),
        requests: ((requests.data ?? []) as Row[]).map((item) => ({
          id: str(item.id),
          userId: str(item.user_id),
          nome: strOrNull(item.nome),
          email: str(item.email),
          message: strOrNull(item.message),
          createdAt: str(item.created_at)
        }))
      })
    },

    createWorkspace: async (name) => {
      const ok = await run(() => supabase.rpc('create_workspace', { p_name: name.trim() }))
      if (ok) await get().load()
      return ok
    },

    requestJoin: async (code, message) => {
      const ok = await run(() =>
        supabase.rpc('request_workspace_join', { p_code: normalizeJoinCode(code), p_message: message.trim() || null })
      )
      if (ok) await get().load()
      return ok
    },

    cancelRequest: async (id) => {
      if (await run(() => supabase.rpc('cancel_workspace_join', { p_request: id }))) await get().load()
    },

    decide: async (id, approve, role = 'MEMBER') => {
      const ok = await run(() => supabase.rpc('decide_workspace_join', { p_request: id, p_approve: approve, p_role: role }))
      await get().loadAdmin()
      return ok
    },

    setMemberRole: async (userId, role) => {
      const workspace = get().workspace
      if (!workspace) return false
      const ok = await run(() =>
        supabase.rpc('set_workspace_member_role', { p_workspace: workspace.id, p_user: userId, p_role: role })
      )
      await get().loadAdmin()
      if (userId === useAuthStore.getState().user?.id) await get().load()
      return ok
    },

    removeMember: async (userId) => {
      const workspace = get().workspace
      if (!workspace) return false
      const ok = await run(() => supabase.rpc('remove_workspace_member', { p_workspace: workspace.id, p_user: userId }))
      if (ok && userId === useAuthStore.getState().user?.id) {
        set({ ...initial, status: 'idle' })
        await get().load()
      } else {
        await get().loadAdmin()
      }
      return ok
    },

    regenerateCode: async () => {
      const workspace = get().workspace
      if (!workspace) return
      set({ error: null })
      const { data, error } = await supabase.rpc('regenerate_workspace_join_code', { p_workspace: workspace.id })
      if (error) set({ error: workspaceErrorMessage(error.message) })
      else if (typeof data === 'string') set({ workspace: { ...workspace, joinCode: data } })
    },

    rename: async (name) => {
      const workspace = get().workspace
      if (!workspace) return false
      const trimmed = name.trim()
      const ok = await run(() => supabase.from('workspaces').update({ name: trimmed }).eq('id', workspace.id))
      if (ok) set({ workspace: { ...workspace, name: trimmed } })
      return ok
    },

    clearError: () => set({ error: null }),
    reset: () => set({ ...initial })
  }
})

/** True when the signed-in user may manage clients (create/edit/delete, purge trash). */
export function useCanManageClients(): boolean {
  const role = useAuthStore((state) => state.role)
  const legacy = useWorkspaceStore((state) => state.legacy)
  const workspaceRole = useWorkspaceStore((state) => state.workspace?.role ?? null)
  return canManageClients(workspaceRole, role, legacy)
}

/** Permissions of the signed-in user on workspace content (clients, modules, projects, drive). */
export function useClientPermissions(): ClientPermissions {
  const role = useAuthStore((state) => state.role)
  const legacy = useWorkspaceStore((state) => state.legacy)
  const workspaceRole = useWorkspaceStore((state) => state.workspace?.role ?? null)
  return clientPermissions(effectiveRole(workspaceRole, role, legacy))
}

export function currentClientPermissions(): ClientPermissions {
  const { legacy, workspace } = useWorkspaceStore.getState()
  return clientPermissions(effectiveRole(workspace?.role ?? null, useAuthStore.getState().role, legacy))
}

export function currentCanManageClients(): boolean {
  const { legacy, workspace } = useWorkspaceStore.getState()
  return canManageClients(workspace?.role ?? null, useAuthStore.getState().role, legacy)
}

export function currentWorkspaceId(): string | null {
  return useWorkspaceStore.getState().workspace?.id ?? null
}
