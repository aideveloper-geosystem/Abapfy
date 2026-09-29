import { memo } from 'react'
import { AlertCircle, Bot, CheckCircle2, FileText, Globe, Loader2, Monitor, RefreshCw, XCircle } from 'lucide-react'
import { Markdown } from './Markdown'
import { EfDocxGenerator } from './EfDocxGenerator'
import { StructuredJson } from './StructuredJson'
import { DtecDocument } from './DtecDocument'
import { EstimateScenarioCards } from './EstimateScenarioCards'
import { ClarifyQuestion } from './ClarifyQuestion'
import { ThinkingBlock } from './ThinkingBlock'
import { formatDurationMs, formatTokenCount } from '@renderer/lib/format'
import { parseMessageAttachments } from '@renderer/lib/attachments'
import { parseEfDocxResponse } from '@renderer/lib/efDocx'
import { parseStructuredJson, extractSoleJsonBlock } from '@renderer/lib/structuredResponse'
import { parseEstimateData } from '@renderer/lib/estimateCards'
import { parseClarify } from '@renderer/lib/clarify'

export interface ToolActivityItem {
  id: string
  label: string
  /** web = pesquisa/leitura via server tools do Claude; source = fonte citada na resposta. */
  kind: 'skill' | 'mcp' | 'sap' | 'web' | 'source'
  status: 'running' | 'confirm' | 'done' | 'error'
  url?: string
}

export interface UiMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  providerLabel?: string
  modelLabel?: string
  effortLabel?: string
  agentName?: string
  streaming?: boolean
  continuing?: number
  elapsedMs?: number
  tokensInput?: number | null
  tokensOutput?: number | null
  error?: string
  toolActivity?: ToolActivityItem[]
  /** Resumo do raciocínio do Claude (exibido só se o usuário expandir). */
  thinkingText?: string
  /** Tempo somado dos blocos de thinking já concluídos. */
  thinkingMs?: number
  /** Date.now() do início do bloco de thinking em andamento. */
  thinkingSince?: number
}

function ToolActivityBadges({ items }: { items: ToolActivityItem[] }): JSX.Element {
  const sapItems = items.filter((item) => item.kind === 'sap')
  return (
    <>
    {sapItems.length > 0 && <div className={`chat-sap-activity ${sapItems.some((item) => item.status === 'running') ? 'chat-sap-activity-live' : ''}`}>
      <div className="chat-sap-activity-heading"><Monitor size={14} /> Contexto SAP <span>{sapItems.some((item) => item.status === 'confirm') ? 'aguardando autorização' : sapItems.some((item) => item.status === 'running') ? 'interagindo com SAP' : sapItems.some((item) => item.status === 'error') ? 'ação interrompida' : 'pronto'}</span></div>
      <div className="chat-sap-activity-steps">{sapItems.map((item) => <div key={item.id} className={`chat-sap-activity-step chat-sap-activity-step-${item.status}`}>
        {item.status === 'running' ? <Loader2 size={12} className="chat-tool-badge-spin" /> : item.status === 'confirm' ? <AlertCircle size={12} className="chat-tool-badge-pulse" /> : item.status === 'error' ? <XCircle size={12} /> : <CheckCircle2 size={12} />}
        {item.label}
      </div>)}</div>
    </div>}
    <div className="chat-tool-activity">
      {items.filter((item) => item.kind !== 'sap' && item.kind !== 'source').map((item) => (
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
    </>
  )
}

function SourceLinks({ items }: { items: ToolActivityItem[] }): JSX.Element {
  return (
    <div className="chat-sources">
      <span className="chat-sources-title">Fontes</span>
      {items.map((item) => (
        <a key={item.id} className="chat-source-link" href={item.url} target="_blank" rel="noreferrer" title={item.url}>
          <Globe size={11} strokeWidth={1.75} />
          <span>{item.label}</span>
        </a>
      ))}
    </div>
  )
}

interface ChatMessageItemProps {
  message: UiMessage
  efDocumentMode?: boolean
  onClarifyAnswer?: (text: string) => void
  clarifyDisabled?: boolean
}

// Sem memo, toda mensagem do histórico re-renderiza (e o Markdown de cada
// uma reprocessa o conteúdo inteiro) a cada delta da mensagem que está
// gerando — o setState de streaming troca a referência do array de
// mensagens inteiro. Com memo + `onClarifyAnswer` estabilizado no chamador
// (ver handleClarifyAnswer em HomeScreen.tsx), só a mensagem cujo `message`
// prop realmente mudou re-renderiza.
export const ChatMessageItem = memo(function ChatMessageItem({
  message,
  efDocumentMode = false,
  onClarifyAnswer,
  clarifyDisabled
}: ChatMessageItemProps): JSX.Element {
  const isUser = message.role === 'user'
  const hasStats =
    !message.streaming && (message.elapsedMs !== undefined || message.tokensInput !== undefined)
  const parsedUser = isUser ? parseMessageAttachments(message.content) : null
  // Cada agente do harness tem seu próprio formato de resposta — alguns devolvem
  // markdown livre, outros um objeto JSON como mensagem inteira (com ou sem fence).
  // Detecta pelo formato, não por agente: clarify (pergunta de esclarecimento) tem
  // prioridade máxima — sem isso, uma mensagem que é só o bloco ```clarify``` cai no
  // renderizador JSON genérico e as opções viram chips estáticos, não clicáveis.
  // Depois EF (gera .docx); qualquer outro objeto JSON cai no renderizador genérico.
  const clarify = !isUser && !message.streaming ? parseClarify(message.content) : null
  const efDocx =
    !isUser && !message.streaming && !clarify
      ? parseEfDocxResponse(message.content, efDocumentMode)
      : null
  const estimate =
    !isUser && !message.streaming && !clarify && !efDocx
      ? parseEstimateData(extractSoleJsonBlock(message.content))
      : null
  const structured =
    !isUser && !message.streaming && !clarify && !efDocx && !estimate
      ? parseStructuredJson(message.content)
      : null
  const sources = message.toolActivity?.filter((item) => item.kind === 'source' && item.url) ?? []

  return (
    <div className={`chat-message ${isUser ? 'chat-message-user' : 'chat-message-assistant'}`}>
      {!isUser && (message.providerLabel || message.modelLabel || message.agentName) && (
        <div className="chat-message-meta">
          {message.agentName && (
            <span className="chat-message-agent">
              <Bot size={11} strokeWidth={1.75} />
              {message.agentName}
            </span>
          )}
          <span>{message.providerLabel}</span>
          {message.modelLabel && <span className="chat-message-model">{message.modelLabel}</span>}
          {message.effortLabel && (
            <span className="chat-message-effort">effort: {message.effortLabel}</span>
          )}
        </div>
      )}

      {isUser ? (
        <div className="chat-message-user-bubble">
          {parsedUser?.attachments.length ? (
            <div className="chat-message-attachments">
              {parsedUser.attachments.map((attachment) => (
                <span key={attachment.name} className="chat-message-attachment-chip">
                  <FileText size={11} strokeWidth={1.75} />
                  {attachment.name}
                </span>
              ))}
            </div>
          ) : null}
          {parsedUser?.text && <p className="chat-message-user-content">{parsedUser.text}</p>}
        </div>
      ) : (
        <div className="chat-message-assistant-content">
          {message.toolActivity?.some((item) => item.kind !== 'source') && (
            <ToolActivityBadges items={message.toolActivity} />
          )}
          {(message.thinkingSince !== undefined || message.thinkingMs !== undefined) && (
            <ThinkingBlock activeSince={message.thinkingSince} text={message.thinkingText} ms={message.thinkingMs} />
          )}
          {clarify ? (
            <ClarifyQuestion
              question={clarify.question}
              options={clarify.options}
              onAnswer={onClarifyAnswer}
              disabled={clarifyDisabled}
            />
          ) : efDocx ? (
            <EfDocxGenerator data={efDocx} />
          ) : estimate ? (
            <EstimateScenarioCards data={estimate} />
          ) : structured && /dtec/i.test(message.agentName ?? '') ? (
            <DtecDocument data={structured} />
          ) : structured ? (
            <StructuredJson data={structured} />
          ) : (
            <Markdown
              content={message.content}
              onClarifyAnswer={onClarifyAnswer}
              clarifyDisabled={clarifyDisabled}
            />
          )}
          {sources.length > 0 && !message.streaming && <SourceLinks items={sources} />}
          {message.streaming && message.thinkingSince === undefined && (
            <span className="chat-message-cursor" aria-hidden="true" />
          )}
          {!!message.continuing && (
            <div className="chat-message-continuing">
              <RefreshCw size={11} strokeWidth={2} className="chat-message-continuing-icon" />
              Continuando automaticamente… (resposta {message.continuing})
            </div>
          )}
        </div>
      )}

      {hasStats && (
        <div className="chat-message-stats">
          {message.elapsedMs !== undefined && <span>{formatDurationMs(message.elapsedMs)}</span>}
          {message.tokensInput !== undefined && (
            <span>
              {formatTokenCount(message.tokensInput)} → {formatTokenCount(message.tokensOutput)}{' '}
              tokens
            </span>
          )}
        </div>
      )}

      {message.error && <p className="chat-message-error">{message.error}</p>}
    </div>
  )
})
