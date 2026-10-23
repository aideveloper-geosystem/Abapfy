import { Archive, Bot, ChevronRight, FileText, Plug, Server, Sparkles, X } from 'lucide-react'
import type { SapAdtConnectionView } from '../../../shared/sapAdt'
import type { ContextUsageRow } from '../lib/sessionContextUsage'
import './SessionContextPanel.css'

interface SessionContextPanelProps {
  agentName: string | null
  files: string[]
  skills: string[]
  mcps: string[]
  environment: string
  sapConnection: SapAdtConnectionView | null
  usage: ContextUsageRow[]
  budget: number
  covered: number
  contextDetail?: string
  contextError?: string | null
  compacting: boolean
  compactDisabled: boolean
  onCompact: () => void
  onClose: () => void
}

const number = (value: number): string => value.toLocaleString('pt-BR')
const compact = (value: number): string =>
  value >= 1000
    ? `${(value / (value >= 1000000 ? 1000000 : 1000)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}${value >= 1000000 ? 'M' : 'k'}`
    : number(value)
const environments = {
  development: 'Desenvolvimento',
  quality: 'Qualidade',
  production: 'Produção'
}

export function SessionContextPanel({
  agentName,
  files,
  skills,
  mcps,
  environment,
  sapConnection,
  usage,
  budget,
  covered,
  contextDetail,
  contextError,
  compacting,
  compactDisabled,
  onCompact,
  onClose
}: SessionContextPanelProps): JSX.Element {
  const used = usage.reduce((sum, row) => sum + row.tokens, 0)
  const percent = budget > 0 ? Math.round((used / budget) * 100) : 0
  const free = Math.max(0, budget - used)
  const connectors = [...new Set(skills)]
  return (
    <aside
      className="session-context-panel"
      aria-label="Contexto da sessão"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <header>
        <strong>Sessão</strong>
        <button type="button" onClick={onClose} aria-label="Fechar contexto">
          <X size={15} />
        </button>
      </header>
      <details className="session-context-card">
        <summary>
          <span className="session-context-card-title">
            Ambiente <ChevronRight size={13} />
          </span>
          <span className="session-context-card-value" title={sapConnection?.name}>
            {sapConnection?.name ?? 'Sem conexão SAP'}
          </span>
        </summary>
        <div className="session-context-card-body">
          {sapConnection ? (
            <>
              <div className="session-context-resource">
                <Server size={15} />
                <strong>{sapConnection.name}</strong>
                <span className="session-context-status">Selecionado</span>
              </div>
              <dl className="session-context-metadata">
                <div>
                  <dt>Ambiente</dt>
                  <dd>{environments[sapConnection.environment]}</dd>
                </div>
                <div>
                  <dt>Mandante</dt>
                  <dd>{sapConnection.client}</dd>
                </div>
                <div>
                  <dt>Acesso</dt>
                  <dd>SAP · ADT</dd>
                </div>
              </dl>
              <p>
                A conexão será usada nas solicitações SAP. A disponibilidade é verificada ao acessar
                o sistema.
              </p>
            </>
          ) : (
            <p>Selecione um ambiente SAP no campo de conexão do chat.</p>
          )}
        </div>
      </details>
      <details
        className={`session-context-card ${percent >= 90 ? 'session-context-card-warning' : ''}`}
      >
        <summary>
          <span className="session-context-card-title">
            Contexto <ChevronRight size={13} />
          </span>
          <span className="session-context-card-value">
            {percent}%{' '}
            <span className="session-context-mini-meter" aria-hidden="true">
              <i style={{ width: `${Math.min(percent, 100)}%` }} />
            </span>
          </span>
        </summary>
        <div className="session-context-card-body">
          <div className="session-context-usage-heading">
            <strong>{percent}% usado</strong>
            <span title={`${number(used)} / ${number(budget)} tokens estimados`}>
              {compact(used)} / {compact(budget)}
            </span>
          </div>
          <div
            className="session-context-usage-bar"
            role="meter"
            aria-label="Uso estimado do orçamento de entrada"
            aria-valuemin={0}
            aria-valuemax={budget}
            aria-valuenow={Math.min(used, budget)}
            aria-valuetext={`${percent}% usado, ${number(used)} tokens estimados`}
          >
            {usage
              .filter((row) => row.tokens > 0)
              .map((row) => (
                <i
                  key={row.id}
                  style={{ flexGrow: row.tokens, background: row.color }}
                  title={`${row.label}: ${number(row.tokens)} tokens`}
                />
              ))}
            {free > 0 && <i style={{ flexGrow: free }} />}
          </div>
          <ul className="session-context-usage-list">
            {usage.map((row) => (
              <li key={row.id} title={`${row.label}: ${number(row.tokens)} tokens estimados`}>
                <i style={{ background: row.color }} aria-hidden="true" />
                <span>{row.label}</span>
                <span>{compact(row.tokens)}</span>
                <strong>
                  {budget > 0
                    ? ((row.tokens / budget) * 100).toLocaleString('pt-BR', {
                        maximumFractionDigits: 1
                      })
                    : '0'}
                  %
                </strong>
              </li>
            ))}
            <li>
              <i className="session-context-free" aria-hidden="true" />
              <span>Espaço livre</span>
              <span>{compact(free)}</span>
              <strong>
                {budget > 0
                  ? ((free / budget) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
                  : '0'}
                %
              </strong>
            </li>
          </ul>
          <p>
            Estimativa local sobre o orçamento de entrada configurado, incluindo o rascunho.
              Instruções e fontes refletem a última solicitação preparada. A contagem do provedor
              pode incluir consumo adicional de ferramentas.
          </p>
          <dl className="session-context-metadata">
            <div>
              <dt>Cliente / módulo</dt>
              <dd>{environment}</dd>
            </div>
            <div>
              <dt>Agente</dt>
              <dd>{agentName ?? 'Seleção automática pendente'}</dd>
            </div>
          </dl>
          <details className="session-context-resources">
            <summary>
              <ChevronRight size={12} /> Arquivos da sessão <span>{files.length}</span>
            </summary>
            {files.length ? (
              <ul>
                {files.map((file) => (
                  <li key={file}>
                    <FileText size={13} />
                    <span>{file}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Nenhum arquivo anexado.</p>
            )}
            <p>A lista inclui anexos do histórico; conteúdos antigos podem estar resumidos.</p>
          </details>
          <details className="session-context-resources">
            <summary>
              <ChevronRight size={12} /> MCPs vinculados ao agente <span>{mcps.length}</span>
            </summary>
            {mcps.length ? (
              <ul>
                {mcps.map((mcp) => (
                  <li key={mcp}>
                    <Plug size={13} />
                    <span>{mcp}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Nenhum MCP vinculado.</p>
            )}
          </details>
          {covered > 0 && (
            <p>{covered} mensagens antigas resumidas. Histórico original preservado.</p>
          )}
          {compacting && <p role="status">{contextDetail || 'Compactando contexto…'}</p>}
          {contextError && (
            <p role="status" className="session-context-error">
              {contextError}
            </p>
          )}
          <button
            type="button"
            className="session-context-compact"
            onClick={onCompact}
            disabled={compactDisabled || compacting}
          >
            <Archive size={13} />
            {compacting ? 'Compactando…' : 'Compactar contexto'}
          </button>
        </div>
      </details>
      <details className="session-context-card">
        <summary>
          <span className="session-context-card-title">
            Conectores <ChevronRight size={13} />
          </span>
          <span className="session-context-card-value">Em uso: {connectors.length}</span>
        </summary>
        <div className="session-context-card-body">
          {connectors.length ? (
            <ul className="session-context-connectors">
              {connectors.map((skill) => (
                <li key={skill}>
                  <Sparkles size={15} />
                  <span>{skill}</span>
                  <span className="session-context-status">Carregada</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>Nenhuma skill carregada nesta sessão.</p>
          )}
          <p>Skills incluídas nas instruções desta conversa.</p>
          {agentName && (
            <div className="session-context-resource">
              <Bot size={14} />
              <span>{agentName}</span>
            </div>
          )}
        </div>
      </details>
    </aside>
  )
}
