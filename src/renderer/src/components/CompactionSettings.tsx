import { useEffect, useState } from 'react'
import { Archive } from 'lucide-react'
import {
  DEFAULT_COMPACTION,
  compactionSettingsSchema,
  type CompactionSettings as Settings
} from '../../../shared/compaction'

export function CompactionSettings({
  value,
  disabled,
  onSave
}: {
  value: Settings
  disabled: boolean
  onSave: (settings: Settings) => Promise<void>
}): JSX.Element {
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => setDraft(value), [value])
  async function save(settings: Settings): Promise<void> {
    const parsed = compactionSettingsSchema.safeParse(settings)
    if (!parsed.success) {
      setError('Verifique os limites indicados em cada campo.')
      return
    }
    setError(null)
    await onSave(parsed.data)
  }
  return (
    <section className="local-feature-card">
      <div className="local-feature-heading">
        <Archive size={20} />
        <div>
          <h3>Compactação de contexto</h3>
          <p>O router resume o histórico antigo. As mensagens originais continuam salvas.</p>
        </div>
        <button
          type="button"
          className="local-feature-switch"
          role="switch"
          aria-label="Compactação automática"
          aria-checked={draft.automatic}
          disabled={disabled}
          onClick={() => {
            const next = { ...draft, automatic: !draft.automatic }
            setDraft(next)
            void save(next)
          }}
        >
          <span />
        </button>
      </div>
      <span className="local-feature-state">
        {draft.automatic
          ? 'Automática ativada'
          : 'Automática desligada · /compact continua disponível'}
      </span>
      <div className="compaction-settings-grid">
        {[
          ['inputBudget', 'Orçamento de entrada (tokens)', 8000, 256000, 1000],
          ['triggerPercent', 'Ativar a partir de (%)', 40, 90, 1],
          ['recentTurns', 'Trocas recentes preservadas', 2, 12, 1],
          ['summaryTokens', 'Orçamento do resumo (tokens)', 1024, 4096, 256]
        ].map(([key, label, min, max, step]) => (
          <label key={key}>
            <strong>{label}</strong>
            <input
              type="number"
              min={min}
              max={max}
              step={step}
              disabled={disabled}
              value={draft[key as keyof Settings] as number}
              onChange={(event) =>
                setDraft((current) => ({ ...current, [key]: Number(event.target.value) }))
              }
            />
            <small>
              {min.toLocaleString('pt-BR')}–{max.toLocaleString('pt-BR')}
            </small>
          </label>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      <p className="local-feature-hint">
        Padrão: 64.000 tokens de entrada, gatilho em 70%, quatro trocas recentes e resumo de até
        2.048 tokens estimados. O orçamento é configurado, não o limite confirmado do modelo:
        reserve espaço para resposta e ferramentas. Exige acesso ao router e chave Claude; a geração
        do resumo consome tokens da API. O comando /compact funciona sem enviar uma pergunta ao
        agente.
      </p>
      <div className="local-feature-actions">
        <button type="button" disabled={disabled} onClick={() => void save(draft)}>
          Salvar preferências
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setDraft({ ...DEFAULT_COMPACTION })
            void save({ ...DEFAULT_COMPACTION })
          }}
        >
          Restaurar padrão
        </button>
      </div>
    </section>
  )
}
