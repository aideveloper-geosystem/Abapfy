import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useAuthStore } from '@renderer/store/authStore'
import { useAntigravityStore } from '@renderer/store/antigravityStore'
import type { AntigravityQuotaGroup } from '../../../../shared/antigravity'
import './SettingsSections.css'
import './IntegrationsSection.css'
import './AntigravitySection.css'

const REFRESH_MS = 30_000

function resetText(resetTime: string | null): string {
  if (!resetTime) return 'Renovação não informada pelo IDE'
  const at = new Date(resetTime)
  if (Number.isNaN(at.getTime())) return 'Renovação não informada pelo IDE'
  const minutes = Math.max(0, Math.round((at.getTime() - Date.now()) / 60000))
  const hours = Math.floor(minutes / 60)
  const left =
    minutes >= 1440
      ? `${Math.floor(minutes / 1440)} d ${Math.floor((minutes % 1440) / 60)} h`
      : hours > 0
        ? `${hours} h ${minutes % 60} min`
        : `${minutes} min`
  return `Renova em ${left} · ${at.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
}

function QuotaRow({ group }: { group: AntigravityQuotaGroup }): JSX.Element {
  const percent =
    group.remainingFraction === null ? null : Math.round(group.remainingFraction * 1000) / 10
  const tone =
    percent === null ? 'unknown' : percent <= 10 ? 'low' : percent <= 30 ? 'medium' : 'ok'
  return (
    <li className="agy-quota-row">
      <div className="agy-quota-heading">
        <strong>{group.label}</strong>
        <span>{percent === null ? 'sem dado' : `${percent.toLocaleString('pt-BR')}% restante`}</span>
      </div>
      <div
        className="agy-quota-track"
        role="progressbar"
        aria-label={`Cota restante de ${group.label}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
      >
        <div className={`agy-quota-fill agy-${tone}`} style={{ width: `${percent ?? 0}%` }} />
      </div>
      <small className="settings-muted">
        {resetText(group.resetTime)}
        {group.usableInAbapfy ? '' : ' · modelo não utilizável no Abapfy'}
      </small>
    </li>
  )
}

export function AntigravitySection(): JSX.Element {
  const userId = useAuthStore((state) => state.user?.id)
  const { enabled, model, status, checking, loaded } = useAntigravityStore()
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!userId) return
    const store = useAntigravityStore.getState()
    void store.load(userId).then(() => store.refresh())
    const timer = window.setInterval(() => void useAntigravityStore.getState().refresh(), REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [userId])

  async function toggle(next: boolean): Promise<void> {
    setBusy(true)
    setNotice('')
    setFailed(false)
    try {
      await useAntigravityStore.getState().setEnabled(next)
      setNotice(
        next
          ? 'Antigravity ligado. O chat usa os modelos Gemini do IDE e as APIs com chave ficam desativadas.'
          : 'Antigravity desligado. O chat voltou a usar o modelo padrão por API.'
      )
    } catch (error) {
      setFailed(true)
      setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  async function chooseModel(id: string): Promise<void> {
    setBusy(true)
    setNotice('')
    setFailed(false)
    try {
      await useAntigravityStore.getState().setModel(id)
    } catch (error) {
      setFailed(true)
      setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const available = status?.available === true
  const usage = status?.usage

  return (
    <div className="settings-section settings-section-mcp agy-section">
      <header className="settings-section-header">
        <h2>Integrações · Antigravity</h2>
        <p>Use os modelos Gemini do Antigravity IDE no Abapfy com o login do próprio IDE.</p>
      </header>

      <div className="sap-context-explainer">
        <p>
          Com a integração ligada, o chat usa somente os modelos Gemini liberados no seu
          Antigravity e as APIs com chave própria ficam desativadas. Agentes, skills, arquivos,
          SAP ADT, servidores MCP e o contexto da conversa continuam disponíveis.
        </p>
        <p>
          O Abapfy não lê nem guarda o token da sua conta: ele conversa apenas com o serviço local
          do IDE, que já está autenticado. O IDE precisa estar aberto e logado. Cada resposta cria
          uma conversa chamada “Abapfy” no IDE e consome a cota do seu plano. Imagens anexadas não
          são enviadas por esta integração.
        </p>
      </div>

      <div className={`agy-status ${available ? 'agy-status-ok' : 'agy-status-off'}`} role="status">
        <div>
          <strong>{available ? 'Conectado ao Antigravity IDE' : 'Antigravity IDE indisponível'}</strong>
          <span>
            {available
              ? [status?.plan ? `Plano ${status.plan}` : null, status?.lsVersion ? `serviço ${status.lsVersion}` : null]
                  .filter(Boolean)
                  .join(' · ') || 'Login do IDE ativo'
              : (status?.reason ?? (checking || !loaded ? 'Verificando…' : 'Sem informação do IDE.'))}
          </span>
        </div>
        <button
          type="button"
          className="settings-action"
          disabled={checking}
          onClick={() => void useAntigravityStore.getState().refresh()}
        >
          <RefreshCw size={14} className={checking ? 'agy-spin' : undefined} /> Atualizar
        </button>
      </div>

      <fieldset className="agy-controls" disabled={busy || !loaded}>
        <legend>Uso no Abapfy</legend>
        <label className="sap-adt-check">
          <input
            type="checkbox"
            checked={enabled}
            disabled={!enabled && !available}
            onChange={(event) => void toggle(event.target.checked)}
          />{' '}
          Usar o Antigravity no lugar das APIs (somente modelos Gemini)
        </label>
        <label className="agy-model">
          Modelo do chat
          <select
            value={model ?? ''}
            disabled={!available || !status?.models.length}
            onChange={(event) => void chooseModel(event.target.value)}
          >
            {!model && <option value="">Selecione um modelo</option>}
            {model && !status?.models.some((item) => item.id === model) && (
              <option value={model}>{model} (indisponível agora)</option>
            )}
            {(status?.models ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        {!enabled && (
          <p className="settings-muted">
            Desligado: o chat usa o modelo padrão configurado em Inteligência Artificial.
          </p>
        )}
      </fieldset>

      <section className="agy-block" aria-label="Cota atual">
        <h3>Cota atual</h3>
        {status?.quota.length ? (
          <ul className="agy-quota">
            {status.quota.map((group) => (
              <QuotaRow key={group.key} group={group} />
            ))}
          </ul>
        ) : (
          <p className="settings-muted">
            {available ? 'O IDE não informou a cota.' : 'Conecte o IDE para ver a cota.'}
          </p>
        )}
        {status && (
          <small className="settings-muted">
            Atualizado às {new Date(status.checkedAt).toLocaleTimeString('pt-BR')} · renova a cada 30 s
            com esta aba aberta.
          </small>
        )}
      </section>

      <section className="agy-block" aria-label="Uso desta sessão">
        <h3>Uso pelo Abapfy nesta sessão</h3>
        <dl className="agy-usage">
          <div>
            <dt>Chamadas</dt>
            <dd>{(usage?.requests ?? 0).toLocaleString('pt-BR')}</dd>
          </div>
          <div>
            <dt>Tokens de entrada</dt>
            <dd>{(usage?.inputTokens ?? 0).toLocaleString('pt-BR')}</dd>
          </div>
          <div>
            <dt>Tokens de saída</dt>
            <dd>{(usage?.outputTokens ?? 0).toLocaleString('pt-BR')}</dd>
          </div>
        </dl>
        <small className="settings-muted">
          Cada chamada inclui o contexto interno do IDE, por isso os tokens de entrada são maiores
          que o texto enviado. Zera quando o Abapfy é fechado.
        </small>
      </section>

      {notice && (
        <p role={failed ? 'alert' : 'status'} className={failed ? 'mcp-error' : 'sap-adt-notice'}>
          {notice}
        </p>
      )}
    </div>
  )
}
