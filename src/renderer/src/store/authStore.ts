import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@renderer/lib/supabaseClient'

export interface Profile {
  id: string
  nome: string
  cargo: string | null
  empresa: string | null
}

export type AppRole = 'MASTER' | 'ADMIN' | null

export interface SignUpPayload {
  nome: string
  email: string
  senha: string
  cargo: string
  empresa: string
}

export interface SignInPayload {
  email: string
  senha: string
}

interface AuthState {
  status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated'
  user: User | null
  session: Session | null
  profile: Profile | null
  role: AppRole
  error: string | null
  init: () => Promise<void>
  signIn: (payload: SignInPayload) => Promise<boolean>
  signUp: (payload: SignUpPayload) => Promise<void>
  signOut: () => Promise<boolean>
  clearError: () => void
  refreshRole: () => Promise<void>
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
  if (error) return null
  return data as Profile
}

async function fetchRole(userId: string): Promise<AppRole> {
  const { data } = await supabase.from('app_roles').select('role').eq('user_id', userId).maybeSingle()
  return data?.role === 'MASTER' || data?.role === 'ADMIN' ? data.role : null
}

let sessionVersion = 0
let authListenerRegistered = false

async function applySession(session: Session | null): Promise<void> {
  const version = ++sessionVersion
  if (!session?.user || useAuthStore.getState().user?.id !== session.user.id) {
    void window.api.sapAdt?.closeAll().catch(() => undefined)
  }
  if (!session?.user) {
    useAuthStore.setState({
      status: 'unauthenticated',
      session: null,
      user: null,
      profile: null,
      role: null
    })
    return
  }

  const [profile, role] = await Promise.all([fetchProfile(session.user.id), fetchRole(session.user.id)])
  if (version !== sessionVersion) return
  useAuthStore.setState({
    status: 'authenticated',
    session,
    user: session.user,
    profile,
    role,
    error: null
  })
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'idle',
  user: null,
  session: null,
  profile: null,
  role: null,
  error: null,

  init: async () => {
    set({ status: 'loading' })
    const {
      data: { session },
      error
    } = await supabase.auth.getSession()
    await applySession(error ? null : session)

    if (!authListenerRegistered) {
      authListenerRegistered = true
      supabase.auth.onAuthStateChange((_event, nextSession) => {
        // Supabase auth callbacks must not await another Supabase request.
        setTimeout(() => void applySession(nextSession), 0)
      })
    }
  },

  signIn: async ({ email, senha }) => {
    set({ status: 'loading', error: null })
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) {
      set({ status: 'unauthenticated', error: error.message })
      return false
    }
    if (!data.session) {
      set({ status: 'unauthenticated', error: 'Não foi possível iniciar a sessão.' })
      return false
    }
    await applySession(data.session)
    return true
  },

  signUp: async ({ nome, email, senha, cargo, empresa }) => {
    set({ status: 'loading', error: null })
    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        data: { nome, cargo, empresa }
      }
    })

    if (error) {
      set({ status: 'unauthenticated', error: error.message })
      return
    }

    if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        nome,
        cargo,
        empresa
      })
    }
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      set({ error: error.message })
      return false
    }
    await applySession(null)
    return true
  },

  clearError: () => set({ error: null }),
  refreshRole: async () => {
    const userId = useAuthStore.getState().user?.id
    if (userId) set({ role: await fetchRole(userId) })
  }
}))
