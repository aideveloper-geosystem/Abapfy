'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export interface AuthFormState {
  error: string | null
}

export async function signInAction(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) return { error: 'Preencha e-mail e senha.' }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.user) return { error: 'E-mail ou senha inválidos.' }

  // Login Supabase válido não é suficiente — precisa ter linha em
  // admin_users. Sem essa checagem, qualquer usuário comum do Abapfy (mesmo
  // projeto/auth.users) conseguiria logar no dashboard administrativo.
  const admin = createSupabaseAdminClient()
  const { data: adminRow } = await admin
    .from('admin_users')
    .select('id')
    .eq('id', data.user.id)
    .single()

  if (!adminRow) {
    await supabase.auth.signOut()
    return { error: 'Essa conta não tem acesso ao dashboard administrativo.' }
  }

  redirect('/dashboard')
}
