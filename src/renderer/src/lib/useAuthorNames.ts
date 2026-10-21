import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuthStore } from '@renderer/store/authStore'
export function useAuthorNames(ids: (string | null | undefined)[]): Record<string, string> {
  const { user, profile } = useAuthStore()
  const key = JSON.stringify([...new Set(ids.filter((id): id is string => Boolean(id)))].sort())
  const [result, setResult] = useState<{
    account: string
    key: string
    names: Record<string, string>
  } | null>(null)
  useEffect(() => {
    let active = true
    const account = user?.id
    if (!account) return
    const values = JSON.parse(key) as string[]
    void (async () => {
      const names: Record<string, string> = {}
      for (let start = 0; start < values.length; start += 100) {
        const { data } = await supabase
          .from('profiles')
          .select('id, nome')
          .in('id', values.slice(start, start + 100))
        if (!active) return
        for (const row of data ?? []) if (row.nome?.trim()) names[row.id] = row.nome.trim()
      }
      if (active) setResult({ account, key, names })
    })().catch(() => {
      if (active) setResult({ account, key, names: {} })
    })
    return () => {
      active = false
    }
  }, [key, user?.id])
  return {
    ...(result?.account === user?.id && result?.key === key ? result?.names : {}),
    ...(user && profile?.nome ? { [user.id]: profile.nome } : {})
  }
}
