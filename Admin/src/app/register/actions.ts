'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import type { AdminRole } from '@/lib/auth'

export interface AuthFormState {
  error: string | null
}

/**
 * Registro só cria admin_users em dois casos:
 *  1. Bootstrap — admin_users ainda vazia, esse é o primeiro (vira 'owner').
 *  2. Convite pendente em admin_invites pra esse e-mail exato.
 * Fora isso, recusa — sem essa checagem, qualquer pessoa com a anon key do
 * projeto (já pública no app desktop) conseguiria se auto-registrar como
 * administrador.
 */
export async function registerAction(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const name = String(formData.get('name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const confirmPassword = String(formData.get('confirmPassword') ?? '')

  if (!name || !email || !password) return { error: 'Preencha todos os campos.' }
  if (password.length < 8) return { error: 'Senha precisa de pelo menos 8 caracteres.' }
  if (password !== confirmPassword) return { error: 'As senhas não coincidem.' }

  const admin = createSupabaseAdminClient()

  const { count } = await admin
    .from('admin_users')
    .select('id', { count: 'exact', head: true })
  const isBootstrap = (count ?? 0) === 0

  let role: AdminRole = 'admin'
  let inviteId: string | null = null

  if (isBootstrap) {
    role = 'owner'
  } else {
    const { data: invite } = await admin
      .from('admin_invites')
      .select('id, role')
      .eq('email', email)
      .is('accepted_at', null)
      .maybeSingle()

    if (!invite) {
      return {
        error:
          'Este e-mail não tem convite de administrador pendente. Peça pra um admin existente te convidar.'
      }
    }
    role = invite.role as AdminRole
    inviteId = invite.id
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name }
  })

  if (createError || !created.user) {
    return { error: createError?.message ?? 'Não foi possível criar a conta.' }
  }

  const { error: insertError } = await admin
    .from('admin_users')
    .insert({ id: created.user.id, email, name, role })

  if (insertError) {
    // Evita deixar um usuário auth órfão (sem linha em admin_users) se o
    // insert falhar por qualquer motivo.
    await admin.auth.admin.deleteUser(created.user.id)
    return { error: 'Não foi possível registrar o administrador. Tente de novo.' }
  }

  if (inviteId) {
    await admin
      .from('admin_invites')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', inviteId)
  }

  const supabase = await createSupabaseServerClient()
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
  if (signInError) redirect('/login')

  redirect('/dashboard')
}
