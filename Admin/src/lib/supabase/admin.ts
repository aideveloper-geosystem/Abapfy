import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * Client com service_role — ignora RLS por completo. Só pode ser importado
 * de código que roda no server (Server Component, Server Action, Route
 * Handler): é o único jeito do dashboard enxergar dado agregado de TODOS os
 * usuários do Abapfy, já que a RLS de `chats`/`chat_messages` normalmente
 * restringe cada usuário ao próprio dado (ver supabase/rls/005 no app
 * principal). Nunca importe isso em um Client Component nem devolva a chave
 * pro navegador.
 */
export function createSupabaseAdminClient() {
  if (!SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY não configurada — veja external/.env.example.'
    )
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}
