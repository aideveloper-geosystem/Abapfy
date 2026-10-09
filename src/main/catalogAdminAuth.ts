export async function requireCatalogAdmin(userId: string, token: unknown): Promise<void> {
  if (typeof token !== 'string' || !token || token.length > 10000)
    throw new Error('Sessão administrativa obrigatória.')
  const url = process.env.ABAPFY_SUPABASE_URL
  const key = process.env.ABAPFY_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Configuração de autorização administrativa indisponível.')
  const headers = { apikey: key, Authorization: `Bearer ${token}` }
  const identity = await fetch(`${url}/auth/v1/user`, {
    headers,
    signal: AbortSignal.timeout(15000)
  })
  if (!identity.ok || (await identity.json()).id !== userId)
    throw new Error('Sessão administrativa inválida.')
  const response = await fetch(
    `${url}/rest/v1/app_roles?user_id=eq.${encodeURIComponent(userId)}&select=role`,
    { headers, signal: AbortSignal.timeout(15000) }
  )
  const roles = response.ok ? await response.json() : []
  if (!Array.isArray(roles) || !roles.some((row) => row.role === 'ADMIN' || row.role === 'MASTER'))
    throw new Error('Somente administradores podem preparar/publicar o catálogo.')
}
