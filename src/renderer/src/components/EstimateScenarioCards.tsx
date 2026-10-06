import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, RotateCcw, Shield, ShieldCheck, Zap } from 'lucide-react'
import {
  recalculateEstimate,
  type EstimateData,
  type EstimateScenario
} from '@renderer/lib/estimateCards'
import { useEstimativaParametrosStore } from '@renderer/store/estimativaParametrosStore'
import './EstimateScenarioCards.css'

const PHASE_LABELS: { key: keyof EstimateScenario['distribuicao']; label: string }[] = [
  { key: 'analise_ef', label: 'Análise EF' },
  { key: 'espec', label: 'Especificação' },
  { key: 'codific', label: 'Codificação' },
  { key: 'testes', label: 'Testes' },
  { key: 'outros', label: 'Outros' }
]

const SCENARIOS: {
  key: 'agressiva' | 'segura' | 'tranquila'
  label: string
  subtitle: string
  icon: typeof Zap
  tone: 'danger' | 'primary' | 'success'
}[] = [
  {
    key: 'agressiva',
    label: 'Agressiva',
    subtitle: 'Poucas horas · maior risco',
    icon: Zap,
    tone: 'danger'
  },
  {
    key: 'segura',
    label: 'Segura',
    subtitle: 'Equilíbrio · recomendada',
    icon: Shield,
    tone: 'primary'
  },
  {
    key: 'tranquila',
    label: 'Tranquila',
    subtitle: 'Mais horas · menor risco',
    icon: ShieldCheck,
    tone: 'success'
  }
]

function formatHours(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function ScenarioCard({
  label,
  subtitle,
  icon: Icon,
  tone,
  scenario
}: {
  label: string
  subtitle: string
  icon: typeof Zap
  tone: 'danger' | 'primary' | 'success'
  scenario: EstimateScenario
}): JSX.Element {
  const total = scenario.totalHoras || 1
  const phases = PHASE_LABELS.map(({ key, label: phaseLabel }) => ({
    label: phaseLabel,
    hours: scenario.distribuicao[key] ?? 0
  })).filter((phase) => phase.hours > 0)

  return (
    <div className={`estimate-card estimate-card-${tone}`}>
      <header className="estimate-card-header">
        <div className="estimate-card-title">
          <Icon size={16} strokeWidth={2} />
          <div>
            <span className="estimate-card-label">{label}</span>
            <span className="estimate-card-subtitle">{subtitle}</span>
          </div>
        </div>
        <div className="estimate-card-total">
          <span className="estimate-card-total-value">{formatHours(scenario.totalHoras)}</span>
          <span className="estimate-card-total-unit">horas</span>
        </div>
      </header>

      <div className="estimate-card-body">
        {phases.length > 0 && (
          <section className="estimate-card-section">
            <h4>Distribuição</h4>
            <div className="estimate-distribution">
              {phases.map((phase) => {
                const pct = Math.round((phase.hours / total) * 100)
                return (
                  <div className="estimate-distribution-row" key={phase.label}>
                    <div className="estimate-distribution-label-row">
                      <span className="estimate-distribution-label">{phase.label}</span>
                      <span className="estimate-distribution-value">
                        {formatHours(phase.hours)}h ({pct}%)
                      </span>
                    </div>
                    <div className="estimate-distribution-bar">
                      <div
                        className="estimate-distribution-bar-fill"
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {scenario.premissas.length > 0 && (
          <details className="estimate-card-details">
            <summary>Premissas ({scenario.premissas.length})</summary>
            <ul className="estimate-list estimate-list-premissas">
              {scenario.premissas.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </details>
        )}

        {scenario.riscos.length > 0 && (
          <details className="estimate-card-details estimate-card-details-danger">
            <summary>Riscos ({scenario.riscos.length})</summary>
            <ul className="estimate-list estimate-list-riscos">
              {scenario.riscos.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  )
}

export function EstimateScenarioCards({ data }: { data: EstimateData }): JSX.Element {
  const { loaded, estimativas, clientes, load } = useEstimativaParametrosStore((state) => ({
    loaded: state.loaded,
    estimativas: state.estimativas,
    clientes: state.clientes,
    load: state.load
  }))
  const [complexities, setComplexities] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  useEffect(() => {
    setComplexities(
      Object.fromEntries(
        data.objetosIdentificados.map((object, index) => [
          `${index}-${object.nome}`,
          object.complexidade
        ])
      )
    )
  }, [data])

  const recalculation = useMemo(
    () => recalculateEstimate(data, complexities, estimativas, clientes),
    [data, complexities, estimativas, clientes]
  )
  const canRecalculate =
    loaded && recalculation.canRecalculate
  const displayData = canRecalculate ? recalculation.data : data
  const wasEdited = data.objetosIdentificados.some(
    (object, index) => complexities[`${index}-${object.nome}`] !== object.complexidade
  )

  function complexityOptions(index: number): string[] {
    const object = data.objetosIdentificados[index]
    const normalize = (value: string): string =>
      value
        .trim()
        .toLocaleLowerCase('pt-BR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
    const matches = estimativas.filter(
      (parameter) =>
        normalize(parameter.tipo) === normalize(object.tipo) &&
        (!object.objeto || normalize(parameter.objeto) === normalize(object.objeto))
    )
    return Array.from(new Set([object.complexidade, ...matches.map((item) => item.complexidade)]))
  }

  return (
    <div className="estimate-scenarios">
      <header className="estimate-scenarios-header">
        <div className="estimate-scenarios-title-row">
          <span className="estimate-scenarios-project">{data.projeto}</span>
          {data.cliente && <span className="estimate-client-badge">{data.cliente}</span>}
        </div>
        <span className="estimate-scenarios-meta">
          {data.versaoSap} · Complexidade geral: {data.complexidadeGeral}
        </span>
      </header>

      {data.objetosIdentificados.length > 0 && (
        <section className="estimate-objects-section">
          <div className="estimate-objects-header">
            <div>
              <h3>Objetos identificados</h3>
              <p>Altere a complexidade para recalcular os três cenários.</p>
            </div>
            {wasEdited && (
              <button
                type="button"
                onClick={() =>
                  setComplexities(
                    Object.fromEntries(
                      data.objetosIdentificados.map((object, index) => [
                        `${index}-${object.nome}`,
                        object.complexidade
                      ])
                    )
                  )
                }
              >
                <RotateCcw size={12} /> Restaurar
              </button>
            )}
          </div>
          <div className="estimate-objects-table-wrap">
            <table className="estimate-objects-table">
              <thead>
                <tr>
                  <th>Objeto</th>
                  <th>Tipo</th>
                  <th>Complexidade</th>
                  <th>Resumo</th>
                </tr>
              </thead>
              <tbody>
                {data.objetosIdentificados.map((object, index) => {
                  const key = `${index}-${object.nome}`
                  return (
                    <tr key={key}>
                      <td>
                        <strong>{object.nome}</strong>
                        {object.objeto && <small>{object.objeto}</small>}
                      </td>
                      <td>{object.tipo}</td>
                      <td>
                        <select
                          disabled={!loaded || recalculation.warnings.length > 0}
                          value={complexities[key] ?? object.complexidade}
                          onChange={(event) =>
                            setComplexities((current) => ({
                              ...current,
                              [key]: event.target.value
                            }))
                          }
                        >
                          {complexityOptions(index).map((complexity) => (
                            <option key={complexity} value={complexity}>
                              {complexity}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td title={object.justificativa}>{object.resumo || object.justificativa}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {!canRecalculate && loaded && (
            <div className="estimate-recalculation-warning">
              <AlertTriangle size={13} />
              {recalculation.unmatchedObjects.length > 0 && `Sem combinação exata nos parâmetros para: ${recalculation.unmatchedObjects.join(', ')}. `}
              {recalculation.warnings.join(' ')}{' '}
              Os totais originais foram preservados.
            </div>
          )}
          {canRecalculate && (
            <p className="estimate-recalculation-source">
              Totais calculados com os parâmetros atuais de Configurações
              {data.cliente
                ? recalculation.clientMatched
                  ? ` e fatores do cliente ${data.cliente}`
                  : `; cliente ${data.cliente} não encontrado, fator 1,00 aplicado`
                : '; nenhum cliente identificado, fator 1,00 aplicado'}
              .
              {' '}O recálculo cobre Análise EF, Especificação, Codificação e Testes unitários.
              {' '}Horas de outras atividades foram preservadas conforme a estimativa original.
            </p>
          )}
        </section>
      )}

      <div className="estimate-scenarios-grid">
        {SCENARIOS.map(({ key, label, subtitle, icon, tone }) => (
          <ScenarioCard
            key={key}
            label={label}
            subtitle={subtitle}
            icon={icon}
            tone={tone}
            scenario={displayData.estimativas[key]}
          />
        ))}
      </div>

      {displayData.notasGerais && (
        <p className="estimate-scenarios-notes">{displayData.notasGerais}</p>
      )}
    </div>
  )
}
