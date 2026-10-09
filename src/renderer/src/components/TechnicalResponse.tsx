import { CodeComparison } from './CodeComparison'
import { StructuredJson } from './StructuredJson'
import { RichText } from './RichText'
import { AiPresentation } from './AiPresentation'
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
      {kind === 'enhancement' ? (
        <>
          {['summary', 'additional_notes'].map((key) =>
            typeof metadata[key] === 'string' && metadata[key] ? (
              <section className="ai-card" key={key}>
                <header>
                  <strong>
                    {key === 'summary' ? 'Resumo da análise' : 'Evidências e próximos passos'}
                  </strong>
                </header>
                <RichText content={metadata[key] as string} />
              </section>
            ) : null
          )}
          <StructuredJson
            data={Object.fromEntries(
              Object.entries(metadata).filter(
                ([key]) => !['summary', 'additional_notes'].includes(key)
              )
            )}
            localized
          />
        </>
      ) : (
        <StructuredJson data={metadata} localized />
      )}
      {kind === 'performance' && data.score === null && (
        <p>
          Nota não atribuída: informação insuficiente. Consulte os critérios e limitações da
          análise.
        </p>
      )}
      <section>
        <h3>{heading}</h3>
        {kind === 'enhancement' && records.length > 0 && (
          <AiPresentation
            data={{
              version: 1,
              blocks: [
                {
                  type: 'records',
                  title: 'Comparar candidatos',
                  columns: ['Opção', 'Tipo', 'Transação', 'S/4HANA'],
                  rows: records
                    .slice(0, 200)
                    .map((item) => [
                      text(item.name),
                      text(item.type),
                      text(item.transaction),
                      typeof item.s4hana_compatible === 'boolean' ? item.s4hana_compatible : null
                    ])
                }
              ]
            }}
          />
        )}
        {records.length === 0 && (
          <p className={kind === 'enhancement' ? 'ai-card ai-empty' : undefined}>
            {kind === 'enhancement'
              ? 'Nenhuma opção recomendada nesta análise. Consulte as evidências e próximos passos acima.'
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
            <article
              className={`technical-response-card${kind === 'enhancement' ? ' ai-card' : ''}`}
              key={index}
            >
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
