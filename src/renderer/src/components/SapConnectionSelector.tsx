import { useEffect, useRef, useState } from 'react'
import { Server } from 'lucide-react'
import { ChipMenu } from '@renderer/components/ChipMenu'
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
  onManage,
  onConnectionChange
}: {
  userId?: string
  value: SapSelection | null
  onChange: (value: SapSelection | null) => void
  refreshKey: boolean
  disabled: boolean
  onManage: () => void
  onConnectionChange?: (connection: SapAdtConnectionView | null) => void
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
  useEffect(() => {
    onConnectionChange?.(
      rows.find((row) => row.id === selected && row.enabled && row.hasPassword) ?? null
    )
  }, [rows, selected, onConnectionChange])
  const selectedConnection = rows.find((row) => row.id === selected)
  const label = loading
    ? 'Carregando SAP…'
    : selectedConnection
      ? `${selectedConnection.name} · ${environments[selectedConnection.environment]}`
      : 'Sem conexão SAP'
  return (
    <div className="sap-connection-picker">
      <ChipMenu
        icon={<Server size={14} strokeWidth={1.75} />}
        label={label}
        title={error || 'Conexão SAP desta conversa. Apenas ela será disponibilizada ao agente.'}
        disabled={disabled || loading || !userId}
        active={Boolean(selectedConnection)}
        low
      >
        {(close) => (
          <>
            <button type="button" role="menuitem" className={`chip-menu-item ${!selected ? 'chip-menu-item-active' : ''}`} onClick={() => { onChange(null); close() }}>
              Sem conexão SAP
            </button>
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                role="menuitem"
                className={`chip-menu-item ${row.id === selected ? 'chip-menu-item-active' : ''}`}
                disabled={!row.enabled || !row.hasPassword}
                onClick={() => { if (userId) onChange({ userId, connectionId: row.id }); close() }}
              >
                {row.name} · {environments[row.environment]} · {row.client}
                {(!row.enabled || !row.hasPassword) && <small>{!row.enabled ? 'Desativada' : 'Sem senha'}</small>}
              </button>
            ))}
            {selectedConnection && (
              <p className="chip-menu-note">
                {(
                  [
                    ['allowSource', 'Ler fontes'],
                    ['allowWrite', 'Editar e salvar inativo'],
                    ['allowQuality', 'Validar sintaxe e qualidade'],
                    ['allowTransports', 'Gerenciar requests'],
                    ['allowActivate', 'Ativar objetos']
                  ] as const
                ).map(([key, text]) => (
                  <span key={key} className="sap-permission">
                    {text}: {selectedConnection[key] ? 'habilitado' : 'desativado'}
                  </span>
                ))}
              </p>
            )}
            <div className="chip-menu-divider" role="separator" />
            <button type="button" role="menuitem" className="chip-menu-item" onClick={() => { close(); onManage() }}>
              Gerenciar conexões SAP…
            </button>
          </>
        )}
      </ChipMenu>
      {error && (
        <span className="sap-connection-error" role="alert" title={error}>
          Conexões indisponíveis
        </span>
      )}
    </div>
  )
}
