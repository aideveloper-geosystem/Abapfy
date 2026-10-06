import { cookies } from 'next/headers'
import { createServerClient, type SetAllCookies } from '@supabase/ssr'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * Client Supabase amarrado à sessão (cookies) do admin logado — respeita RLS
 * normalmente, é o que usamos pra saber "quem está logado", nunca pra
 * agregar dado de outros usuários (isso é `admin.ts`, com service_role).
 *
 * Em Server Component o `setAll` pode falhar (Server Component não pode
 * escrever cookie) — é esperado, ignora: o middleware já refresca a sessão a
 * cada request. Em Server Action/Route Handler o `setAll` funciona de
 * verdade e é o que persiste login/logout.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll: ((cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // Chamado de dentro de um Server Component — sem escrita de
          // cookie disponível. Inofensivo: o middleware cobre o refresh.
        }
      }) as SetAllCookies
    }
  })
}
