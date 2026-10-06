import { CodeComparison } from './CodeComparison'
import { StructuredJson } from './StructuredJson'
import type { StructuredValue } from '@renderer/lib/structuredResponse'
import {
  technicalLocation,
  technicalRecords,
  type TechnicalResponseKind
} from '@renderer/lib/technicalResponse'
import './TechnicalResponse.css'

const text = (value: StructuredValue | undefined, fallback = 'A confirmar'): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : fallback

export function TechnicalResponse({
  data,
  kind
}: {
  data: Record<string, StructuredValue>
  kind: TechnicalResponseKind
}): JSX.Element {
  const listKey =
    kind === 'review' ? 'findings' : kind === 'performance' ? 'issues' : 'recommendations'
  const records = technicalRecords(data[listKey])
  const metadata = Object.fromEntries(Object.entries(data).filter(([key]) => key !== listKey))
  const heading =
    kind === 'review'
      ? 'Achados da revisão'
      : kind === 'performance'
        ? 'Diagnóstico de performance'
        : 'Opções de enhancement'
  return (
    <div className="technical-response">
      <StructuredJson data={metadata} localized />
      {kind === 'performance' && data.score === null && (
        <p>
          Nota não atribuída: informação insuficiente. Consulte os critérios e limitações da
          análise.
        </p>
      )}
      <section>
        <h3>{heading}</h3>
        {kind === 'enhancement' && records.length > 0 && (
          <div className="technical-response-table">
            <table>
              <thead>
                <tr>
                  <th>Opção</th>
                  <th>Tipo</th>
                  <th>Transação</th>
                  <th>S/4HANA</th>
                </tr>
              </thead>
              <tbody>
                {records.map((item, index) => (
                  <tr key={index}>
                    <td>{text(item.name)}</td>
                    <td>{text(item.type)}</td>
                    <td>{text(item.transaction)}</td>
                    <td>
                      {item.s4hana_compatible === true
                        ? 'Sim'
                        : item.s4hana_compatible === false
                          ? 'Não'
                          : 'A confirmar'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {records.length === 0 && (
          <p>
            {kind === 'enhancement'
              ? 'Nenhuma opção confirmada nesta análise. Consulte as pendências e evidências acima.'
              : 'Nenhum achado listado. Isso não comprova cobertura completa nem validação em execução.'}
          </p>
        )}
        {records.map((item, index) => {
          const original = typeof item.original_code === 'string' ? item.original_code : ''
          const suggested = typeof item.suggested_code === 'string' ? item.suggested_code : ''
          const fields = Object.fromEntries(
            Object.entries(item).filter(
              ([key]) => !['title', 'original_code', 'suggested_code'].includes(key)
            )
          )
          return (
            <article className="technical-response-card" key={index}>
              <h4>
                {index + 1}. {text(item.title ?? item.name, 'Achado')}
              </h4>
              {kind !== 'enhancement' && (
                <p className="technical-response-location">{technicalLocation(item)}</p>
              )}
              <StructuredJson data={fields} localized />
              {kind === 'review' && (original || suggested) && (
                <CodeComparison original={original} suggested={suggested} />
              )}
            </article>
          )
        })}
      </section>
    </div>
  )
}
