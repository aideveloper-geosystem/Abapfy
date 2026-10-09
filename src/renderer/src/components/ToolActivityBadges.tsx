import { AlertCircle, Bot, CheckCircle2, FileText, Loader2, Monitor, XCircle } from 'lucide-react'
import { AiPresentation } from './AiPresentation'
import type { ToolActivityItem } from './ChatMessageItem'
import './AiInterface.css'
import { RichText } from './RichText'
export function ToolActivityBadges({ items }: { items: ToolActivityItem[] }): JSX.Element {
  const sapItems = items.filter((item) => item.kind === 'sap')
  const activity = items.filter((item) => item.kind !== 'source')
  const needsAttention = activity.some((item) => item.status !== 'done')
  const status = activity.some((item) => item.status === 'confirm')
    ? 'Aguardando autorização'
    : activity.some((item) => item.status === 'running')
      ? 'Em andamento'
      : activity.some((item) => item.status === 'error')
        ? 'Com interrupções'
        : 'Concluída'
  return (
    <details className="ai-tool-details" open={needsAttention || undefined}>
      <summary>
        <Bot size={13} /> Atividade · {activity.length} {activity.length === 1 ? 'etapa' : 'etapas'}{' '}
        · {status}
        {activity.some((item) => item.kind === 'local') && ' · Catálogo SAP local'}
      </summary>
      <div>
        {items
          .filter((item) => item.compaction)
          .map((item) => (
            <details className="ai-tool-details" key={`${item.id}-summary`}>
              <summary>
                <FileText size={13} /> Resumo de contexto · {item.compaction!.coveredCount}{' '}
                mensagens
              </summary>
              <div>
                <p>
                  Router: {item.compaction!.model} ·{' '}
                  {item.compaction!.beforeTokens.toLocaleString('pt-BR')} →{' '}
                  {item.compaction!.afterTokens.toLocaleString('pt-BR')} tokens estimados.
                </p>
                <RichText
                  content={Object.entries(item.compaction!.summary)
                    .map(
                      ([key, value]) =>
                        `**${({ objective: 'Objetivo', facts: 'Fatos e fontes', decisions: 'Decisões', constraints: 'Restrições', corrections: 'Correções', identifiers: 'Identificadores', pending: 'Pendências', uncertainties: 'A confirmar' } as Record<string, string>)[key] ?? key}**\n\n${Array.isArray(value) ? value.map((entry) => `- ${entry}`).join('\n') || 'Nenhum item.' : value}`
                    )
                    .join('\n\n')}
                />
              </div>
            </details>
          ))}
        {sapItems.length > 0 && (
          <div
            className={`chat-sap-activity ${sapItems.some((item) => item.status === 'running') ? 'chat-sap-activity-live' : ''}`}
          >
            <div className="chat-sap-activity-heading">
              <Monitor size={14} /> Contexto SAP{' '}
              <span>
                {sapItems.some((item) => item.status === 'confirm')
                  ? 'aguardando autorização'
                  : sapItems.some((item) => item.status === 'running')
                    ? 'interagindo com SAP'
                    : sapItems.some((item) => item.status === 'error')
                      ? 'ação interrompida'
                      : 'pronto'}
              </span>
            </div>
            <div className="chat-sap-activity-steps">
              {sapItems.map((item) => (
                <div
                  key={item.id}
                  className={`chat-sap-activity-step chat-sap-activity-step-${item.status}`}
                >
                  {item.status === 'running' ? (
                    <Loader2 size={12} className="chat-tool-badge-spin" />
                  ) : item.status === 'confirm' ? (
                    <AlertCircle size={12} className="chat-tool-badge-pulse" />
                  ) : item.status === 'error' ? (
                    <XCircle size={12} />
                  ) : (
                    <CheckCircle2 size={12} />
                  )}
                  {item.label}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="chat-tool-activity">
          {items
            .filter((item) => item.kind !== 'sap' && item.kind !== 'source')
            .map((item) => (
              <span key={item.id} className={`chat-tool-badge chat-tool-badge-${item.status}`}>
                {item.status === 'running' ? (
                  <Loader2 size={11} strokeWidth={2} className="chat-tool-badge-spin" />
                ) : item.status === 'confirm' ? (
                  <AlertCircle size={11} strokeWidth={2} className="chat-tool-badge-pulse" />
                ) : item.status === 'error' ? (
                  <XCircle size={11} strokeWidth={2} />
                ) : (
                  <CheckCircle2 size={11} strokeWidth={2} />
                )}
                {item.status === 'confirm' ? `${item.label} · aguardando autorização` : item.label}
              </span>
            ))}
        </div>
        {items
          .filter((item) => item.localSearch)
          .map((item) => (
            <details className="ai-tool-details" key={`${item.id}-results`}>
              <summary>
                <FileText size={13} /> Consulta local · {item.localSearch!.result.results.length}{' '}
                {item.localSearch!.result.results.length === 1
                  ? 'candidato enviado'
                  : 'candidatos enviados'}{' '}
                ao agente
              </summary>
              <div>
                <p>
                  <strong>Consulta:</strong> {item.localSearch!.query}
                </p>
                <p>
                  <strong>Modo:</strong>{' '}
                  {item.localSearch!.result.mode === 'hybrid'
                    ? 'Híbrido · embeddings + palavras-chave'
                    : item.localSearch!.result.mode === 'lexical'
                      ? 'Palavras-chave'
                      : 'Desativado'}
                </p>
                {item.localSearch!.result.warning && (
                  <p role="status">{item.localSearch!.result.warning}</p>
                )}
                <AiPresentation
                  data={{
                    version: 1,
                    blocks: [
                      {
                        type: 'records',
                        title: 'Dados da busca local',
                        columns: [
                          'Objeto',
                          'Tipo',
                          'Descrição',
                          'Interface / programa',
                          'Pacote',
                          'Origem'
                        ],
                        rows: item.localSearch!.result.results.map((r) => [
                          r.name,
                          r.type.toUpperCase(),
                          r.description,
                          r.interface || r.program || null,
                          r.package || null,
                          r.source
                        ])
                      }
                    ]
                  }}
                />
              </div>
            </details>
          ))}
      </div>
    </details>
  )
}
