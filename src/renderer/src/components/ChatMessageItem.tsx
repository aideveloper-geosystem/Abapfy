import { memo, useRef } from 'react'
import { Archive, Bot, FileText, Globe, RefreshCw } from 'lucide-react'
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
import { customizingMarkdown, isCustomizingResponse } from '@renderer/lib/customizingResponse'
import { technicalResponseKind } from '@renderer/lib/technicalResponse'
import { TechnicalResponse } from './TechnicalResponse'
import { AiLoadingState, AiMessageActions } from './AiMessageActions'
import type { EfDocumentJob } from '@renderer/lib/efDrive'
import type { KnowledgeMatch } from '@renderer/lib/projectKnowledge'
import type { LocalSearchActivity } from '../../../shared/localFeatures'
import { ToolActivityBadges } from './ToolActivityBadges'
import type { CompactionActivity } from '../../../shared/compaction'
import './ContextMeter.css'

export interface ToolActivityItem {
  id: string
  label: string
  /** web = pesquisa/leitura via server tools do Claude; source = fonte citada na resposta. */
  kind: 'skill' | 'mcp' | 'sap' | 'web' | 'source' | 'document' | 'local' | 'compact'
  status: 'running' | 'confirm' | 'done' | 'error'
  url?: string
  efDocument?: EfDocumentJob
  localSearch?: LocalSearchActivity
  compaction?: CompactionActivity
}

export interface UiMessage {
  imageDataUrls?: string[]
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
  knowledge?: KnowledgeMatch[]
}

function SourceLinks({ items }: { items: ToolActivityItem[] }): JSX.Element {
  return (
    <details className="ai-tool-details">
      <summary><Globe size={13} /> Fontes · {items.length}</summary>
      <div className="chat-sources">
      {items.map((item) => (
        <a key={item.id} className="chat-source-link" href={item.url} target="_blank" rel="noreferrer" title={item.url}>
          <Globe size={11} strokeWidth={1.75} />
          <span>{item.label}</span>
        </a>
      ))}
      </div>
    </details>
  )
}

interface ChatMessageItemProps {
  message: UiMessage
  efDocumentMode?: boolean
  onClarifyAnswer?: (text: string) => void
  clarifyDisabled?: boolean
  onPrompt?: (text: string) => void
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
  clarifyDisabled,
  onPrompt
}: ChatMessageItemProps): JSX.Element {
  const contentRef = useRef<HTMLDivElement>(null)
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
    !isUser && !message.streaming && !clarify && !efDocx && !estimate && !/^```ai-ui\s/.test(message.content.trim())
      ? parseStructuredJson(message.content)
      : null
  const sources = message.toolActivity?.filter((item) => item.kind === 'source' && item.url && /^https?:\/\//i.test(item.url)) ?? []
  const technicalKind = structured ? technicalResponseKind(structured) : null
  const efJob = message.toolActivity?.find((item) => item.kind === 'document' && item.efDocument)?.efDocument

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
          {!!message.imageDataUrls?.length && <div className="chat-message-image-previews">{message.imageDataUrls.map((url, index) => <img src={url} alt={`Imagem anexada ${index + 1}`} key={index} />)}</div>}
          {parsedUser?.attachments.length ? (
            <div className="chat-message-attachments">
              {parsedUser.attachments.map((attachment, index) => (
                <span key={`${attachment.name}-${index}`} className="chat-message-attachment-chip">
                  <FileText size={11} strokeWidth={1.75} />
                  {attachment.name}
                </span>
              ))}
            </div>
          ) : null}
          {parsedUser?.text && <p className="chat-message-user-content">{parsedUser.text}</p>}
        </div>
      ) : (
        <div className="chat-message-assistant-content" ref={contentRef}>
          {message.toolActivity?.some((item) => item.kind === 'compact' && item.status === 'running') && <div className="context-compacting" role="status"><Archive size={20} className="context-spin" /><div><strong>Compactando contexto</strong><small>{message.toolActivity.find((item) => item.kind === 'compact' && item.status === 'running')?.label} · histórico original preservado</small></div></div>}
          {!!message.knowledge?.length && <details className="ai-tool-details"><summary><FileText size={13} /> Contexto consultado · {message.knowledge.length} trechos</summary><div className="ai-knowledge-cards">{message.knowledge.map((match, index) => <article key={`${match.documentId}-${index}`}><strong>{match.documentName}</strong><small>Versão {match.version} · {new Date(match.updatedAt).toLocaleDateString('pt-BR')} · relevância {Math.round(match.confidence * 100)}%</small><p>{match.excerpt}</p></article>)}</div></details>}
          {message.toolActivity?.some((item) => item.kind !== 'source' || item.id === 'local-enhancements') && (
            <ToolActivityBadges items={message.toolActivity.map((item) => item.id === 'local-enhancements' && item.kind === 'source' ? { ...item, kind: 'local' } : item)} />
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
            <EfDocxGenerator data={efDocx} job={efJob} />
          ) : estimate ? (
            <EstimateScenarioCards data={estimate} />
          ) : structured && /dtec/i.test(message.agentName ?? '') ? (
            <DtecDocument data={structured} />
          ) : structured && isCustomizingResponse(structured) ? (
            <Markdown content={customizingMarkdown(structured)} />
          ) : structured && technicalKind ? (
            <TechnicalResponse data={structured} kind={technicalKind} />
          ) : structured ? (
            <StructuredJson data={structured} />
          ) : (
            <Markdown
              content={message.content}
              deferEfDocument={message.streaming}
              onClarifyAnswer={onClarifyAnswer}
              clarifyDisabled={clarifyDisabled}
              onPrompt={onPrompt}
            />
          )}
          {message.streaming && !message.content && message.thinkingSince === undefined && !message.toolActivity?.some((item) => item.kind === 'compact' && item.status === 'running') && <AiLoadingState />}
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
          {!message.streaming && message.content && <AiMessageActions content={message.content} onPrompt={onPrompt} disabled={clarifyDisabled} targetRef={contentRef} />}
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
