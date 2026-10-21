import { useEffect, useRef, useState } from 'react'
import { Settings2 } from 'lucide-react'
import { supabase } from '@renderer/lib/supabaseClient'
import type { SapAdtConnectionView } from '../../../shared/sapAdt'
import './SapConnectionSelector.css'

export interface SapSelection {
  userId: string
  connectionId: string
}
const environments = { development: 'DEV', quality: 'QA', production: 'PRD' }
export function SapConnectionSelector({
  userId,
  value,
  onChange,
  refreshKey,
  disabled,
  onManage
}: {
  userId?: string
  value: SapSelection | null
  onChange: (value: SapSelection | null) => void
  refreshKey: boolean
  disabled: boolean
  onManage: () => void
}): JSX.Element {
  const [rows, setRows] = useState<SapAdtConnectionView[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const current = useRef({ value, onChange })
  current.current = { value, onChange }
  useEffect(() => {
    let active = true
    let generation = 0
    setRows([])
    async function load(): Promise<void> {
      const request = ++generation
      const valid = (): boolean => active && request === generation
      if (!userId) {
        current.current.onChange(null)
        return
      }
      setLoading(true)
      setError('')
      try {
        const { data, error: sessionError } = await supabase.auth.getSession()
        if (sessionError || data.session?.user.id !== userId)
          throw new Error('Entre novamente para carregar suas conexões SAP.')
        const connections = await window.api.sapAdt.list(data.session.access_token)
        if (!valid()) return
        setRows(connections)
        const selection = current.current.value
        if (
          selection &&
          (selection.userId !== userId ||
            !connections.some(
              (row) => row.id === selection.connectionId && row.enabled && row.hasPassword
            ))
        )
          current.current.onChange(null)
      } catch (cause) {
        if (!valid()) return
        setRows([])
        current.current.onChange(null)
        setError((cause as Error).message)
      } finally {
        if (valid()) setLoading(false)
      }
    }
    void load()
    const refresh = (): void => {
      void load()
    }
    window.addEventListener('focus', refresh)
    return () => {
      active = false
      window.removeEventListener('focus', refresh)
    }
  }, [userId, refreshKey])
  const selected = value && value.userId === userId ? value.connectionId : ''
  return (
    <div className="sap-connection-picker">
      <select
        aria-label="Ambiente SAP"
        className={selected ? 'sap-connection-active' : ''}
        value={selected}
        disabled={disabled || loading || !userId}
        title={
          error ||
          'Selecione a conexão SAP para esta conversa. Apenas ela será disponibilizada ao agente.'
        }
        onChange={(event) =>
          onChange(
            event.target.value && userId ? { userId, connectionId: event.target.value } : null
          )
        }
      >
        <option value="">{loading ? 'Carregando SAP…' : 'Sem conexão SAP'}</option>
        {rows.map((row) => (
          <option key={row.id} value={row.id} disabled={!row.enabled || !row.hasPassword}>
            {row.name} · {environments[row.environment]} · {row.client}
            {!row.enabled ? ' · desativada' : !row.hasPassword ? ' · sem senha' : ''}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onManage}
        disabled={disabled}
        title="Gerenciar minhas conexões SAP"
        aria-label="Gerenciar minhas conexões SAP"
      >
        <Settings2 size={15} />
      </button>
      {error && (
        <span className="sap-connection-error" role="alert" title={error}>
          Conexões indisponíveis
        </span>
      )}
    </div>
  )
}
