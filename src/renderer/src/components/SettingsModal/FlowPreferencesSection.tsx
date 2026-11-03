import { useEffect } from 'react'
import { useAuthStore } from '@renderer/store/authStore'
import { useAdvancedFlowStore } from '@renderer/store/advancedFlowStore'
import { FlowTokenNotice } from '../FlowTokenNotice'
import './AdvancedFlowSection.css'
export function FlowPreferencesSection({ onManage }: { onManage: () => void }): JSX.Element {
  const userId = useAuthStore((s) => s.user?.id)
  const { userId: owner, enabled, flows, error, load, setEnabled } = useAdvancedFlowStore()
  useEffect(() => {
    if (userId) load(userId)
  }, [userId, load])
  return (
    <div className="settings-section flow-settings">
      <header className="settings-section-header">
        <h2>Preferências de fluxos</h2>
        <p>Disponibilidade do recurso nesta conta e computador.</p>
      </header>
      <section className="flow-enable-card">
        <div>
          <h3>Disponibilizar fluxos no chat</h3>
          <p>Permite escolher um fluxo salvo. O modo padrão continua sendo uma opção no seletor.</p>
        </div>
        <button
          type="button"
          className="flow-switch"
          role="switch"
          aria-label="Disponibilizar fluxos no chat"
          aria-describedby="flow-preferences-token-warning"
          aria-checked={owner === userId && enabled}
          disabled={!userId || owner !== userId || Boolean(error)}
          onClick={() => setEnabled(userId!, !enabled)}
        >
          <span />
        </button>
      </section>
      <FlowTokenNotice id="flow-preferences-token-warning" />
      {error && <p role="alert">{error}</p>}
      <section className="flow-card">
        <h3>Biblioteca de fluxos</h3>
        <p className="settings-muted">
          {owner === userId ? flows.length : 0} fluxos salvos. Equipes, etapas, hooks e limites de
          execução são configurados na área Fluxos da sidebar.
        </p>
        <button type="button" className="settings-action" onClick={onManage}>
          Abrir Fluxos
        </button>
      </section>
    </div>
  )
}
