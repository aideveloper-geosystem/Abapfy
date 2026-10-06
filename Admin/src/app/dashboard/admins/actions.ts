'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin, logAuditAction } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

function assertOwner(role: string): void {
  if (role !== 'owner') throw new Error('Só o administrador principal (owner) pode gerenciar outros administradores.')
}

export async function inviteAdminAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin()
  assertOwner(admin.role)

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const role = String(formData.get('role') ?? 'admin')
  if (!email) return

  const supabase = createSupabaseAdminClient()
  await supabase
    .from('admin_invites')
    .upsert({ email, role, invited_by: admin.id, accepted_at: null }, { onConflict: 'email' })

  await logAuditAction(admin, 'invite_admin', email, { role })
  revalidatePath('/dashboard/admins')
}

export async function revokeInviteAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin()
  assertOwner(admin.role)

  const id = String(formData.get('id') ?? '')
  if (!id) return

  const supabase = createSupabaseAdminClient()
  await supabase.from('admin_invites').delete().eq('id', id)

  await logAuditAction(admin, 'revoke_invite', id)
  revalidatePath('/dashboard/admins')
}

export async function removeAdminAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin()
  assertOwner(admin.role)

  const id = String(formData.get('id') ?? '')
  if (!id || id === admin.id) return

  const supabase = createSupabaseAdminClient()
  await supabase.from('admin_users').delete().eq('id', id)

  await logAuditAction(admin, 'remove_admin', id)
  revalidatePath('/dashboard/admins')
}
