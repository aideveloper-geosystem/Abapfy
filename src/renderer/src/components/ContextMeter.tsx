import { Archive, Loader2 } from 'lucide-react'
import type { CompactionSettings } from '../../../shared/compaction'
import './ContextMeter.css'

export function ContextMeter({
  used,
  settings,
  phase,
  detail,
  error,
  covered,
  disabled,
  onCompact
}: {
  used: number
  settings: CompactionSettings
  phase: 'idle' | 'compacting'
  detail: string
  error?: string | null
  covered: number
  disabled: boolean
  onCompact: () => void
}): JSX.Element {
  const percent = Math.round((used / settings.inputBudget) * 100)
  const label =
    phase === 'compacting'
      ? 'Compactando contexto…'
      : `Contexto estimado: ${percent}% · ${used.toLocaleString('pt-BR')} / ${settings.inputBudget.toLocaleString('pt-BR')} tokens`
  return (
    <details
      className={`context-meter ${phase === 'compacting' ? 'context-meter-busy' : ''} ${error || percent >= 90 ? 'context-meter-warning' : ''}`}
    >
      <summary title={label} aria-label={label}>
        {phase === 'compacting' ? (
          <Loader2 size={16} className="context-spin" aria-hidden="true" />
        ) : (
          <span
            className="context-orb"
            aria-hidden="true"
            style={{
              background: `conic-gradient(currentColor ${Math.max(0, Math.min(percent, 100))}%, transparent 0)`
            }}
          />
        )}
      </summary>
      <div className="context-meter-panel">
        <strong>Contexto da conversa</strong>
        <p>
          Uso estimado: {used.toLocaleString('pt-BR')} tokens. Orçamento de entrada:{' '}
          {settings.inputBudget.toLocaleString('pt-BR')}.
        </p>
        <p>
          {settings.automatic
            ? `Automático a partir de ${settings.triggerPercent}%.`
            : 'Compactação automática desligada.'}{' '}
          Mantém {settings.recentTurns} trocas recentes, além da solicitação atual.
        </p>
        <p>
          {covered
            ? `${covered} mensagens antigas resumidas; histórico original preservado.`
            : 'Nenhum histórico compactado nesta conversa.'}
        </p>
        <p>
          A estimativa inclui o histórico, o rascunho e as instruções/fontes preparadas na última
          solicitação. O orçamento deve deixar espaço para resposta e ferramentas no modelo
          escolhido.
        </p>
        {detail && <p role="status">{detail}</p>}
        {error && <p role="status">{error}</p>}
        <button type="button" disabled={disabled} onClick={onCompact}>
          <Archive size={13} /> Compactar agora · /compact
        </button>
      </div>
    </details>
  )
}
