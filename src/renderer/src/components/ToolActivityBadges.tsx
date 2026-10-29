import { AlertCircle, Bot, CheckCircle2, FileText, Loader2, Monitor, XCircle } from 'lucide-react'
import { AiPresentation } from './AiPresentation'
import type { ToolActivityItem } from './ChatMessageItem'
import './AiInterface.css'
import { RichText } from './RichText'
export function ToolActivityBadges({
  items,
  interrupted = false
}: {
  items: ToolActivityItem[]
  interrupted?: boolean
}): JSX.Element {
  const sapItems = items.filter((item) => item.kind === 'sap')
  const activity = items.filter((item) => item.kind !== 'source')
  const needsAttention = interrupted || activity.some((item) => item.status !== 'done')
  const status = interrupted
    ? 'Interrompida'
    : activity.some((item) => item.status === 'confirm')
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
          .filter((item) => item.workProgress)
          .map((item) => (
            <details className="ai-tool-details work-progress-panel" key={item.id + '-progress'}>
              <summary>
                <FileText size={13} /> Progresso e pendências da tarefa
              </summary>
              <p>As fontes e permissões são conferidas novamente ao continuar.</p>
              {item.workProgress!.notes && <RichText content={item.workProgress!.notes} />}
              <div className="work-progress-table">
                <table>
                  <thead>
                    <tr>
                      <th>Arquivo / objeto</th>
                      <th>Operação</th>
                      <th>Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.workProgress!.steps.slice(-25).map((step, index) => (
                      <tr key={index}>
                        <td>
                          {step.label ?? step.target}
                          {step.sourcePath && <small>{step.sourcePath}</small>}
                        </td>
                        <td>
                          {(
                            {
                              read_file: 'Leitura',
                              read_source: 'Leitura SAP',
                              edit_source: 'Salvar inativo',
                              preview_edits: 'Proposta',
                              activate_object: 'Ativação',
                              syntax_check: 'Sintaxe',
                              pending: 'Continuação'
                            } as Record<string, string>
                          )[step.tool] ?? step.tool}
                        </td>
                        <td>
                          {(
                            {
                              saved_inactive: 'Salvo inativo',
                              proposed: 'Proposto',
                              activated: 'Ativado',
                              uncertain: 'Conferir no SAP',
                              activation_not_verified: 'Ativação não confirmada',
                              read_complete: 'Leitura completa',
                              read_partial: 'Leitura parcial',
                              pending: 'Pendente',
                              done: 'Concluído',
                              error: 'Erro',
                              syntax_valid: 'Sintaxe válida',
                              syntax_errors: 'Erros de sintaxe'
                            } as Record<string, string>
                          )[step.status] ?? step.status}
                          {step.nextOffset != null && <small>Continuar em {step.nextOffset}</small>}
                          {step.validation && (
                            <small>
                              {(
                                {
                                  syntax_valid: 'Sintaxe válida',
                                  syntax_errors: 'Corrigir erros de sintaxe',
                                  check_failed: 'Validação indisponível',
                                  not_authorized: 'Validação sem permissão'
                                } as Record<string, string>
                              )[step.validation] ?? step.validation}
                            </small>
                          )}
                          {step.error && <small>{step.error}</small>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}

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
