import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export type AdminRole = 'owner' | 'admin' | 'viewer'

export interface CurrentAdmin {
  id: string
  email: string
  name: string
  role: AdminRole
}

/**
 * Confere sessão + linha em admin_users (via service_role, já que a RLS de
 * admin_users é deny-all pro client). Chamado no layout de /dashboard — toda
 * página dentro dele já entra protegida sem repetir a checagem.
 */
export async function requireAdmin(): Promise<CurrentAdmin> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const admin = createSupabaseAdminClient()
  const { data } = await admin
    .from('admin_users')
    .select('id, email, name, role')
    .eq('id', user.id)
    .single()

  if (!data) redirect('/login?error=not_admin')

  return data as CurrentAdmin
}

/**
 * Grava uma linha em admin_audit_log — chame em toda Server Action que muda
 * estado (convidar admin, editar preço, etc.). Falha em silêncio de
 * propósito: um erro de auditoria não deveria travar a ação principal.
 */
export async function logAuditAction(
  admin: CurrentAdmin,
  action: string,
  target?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const supabase = createSupabaseAdminClient()
  await supabase.from('admin_audit_log').insert({
    admin_id: admin.id,
    admin_email: admin.email,
    action,
    target: target ?? null,
    metadata: metadata ?? null
  })
}
