import { useEffect, useState } from 'react'
import { ChevronRight, Sparkles } from 'lucide-react'
import './ThinkingBlock.css'

interface ThinkingBlockProps {
  /** Date.now() de quando o bloco de thinking atual começou; ausente quando não está pensando. */
  activeSince?: number
  /** Resumo do raciocínio (display "summarized"); vazio quando o provedor não devolve. */
  text?: string
  /** Tempo já gasto em blocos de thinking concluídos. */
  ms?: number
}

function formatSeconds(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const rest = seconds % 60
  return rest ? `${Math.floor(seconds / 60)}min ${rest}s` : `${seconds / 60}min`
}

/**
 * Indicador de raciocínio no estilo do Claude web: "Pensando…" animado durante o
 * thinking e, depois, uma linha recolhida "Pensou por Xs". O resumo só aparece se
 * o usuário expandir — a resposta continua sendo o conteúdo principal da mensagem.
 */
export function ThinkingBlock({ activeSince, text, ms = 0 }: ThinkingBlockProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const active = activeSince !== undefined
  const hasText = Boolean(text?.trim())

  // Contador ao vivo enquanto pensa — re-render local a cada segundo, sem tocar no store.
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active])

  const totalMs = ms + (active ? Math.max(0, now - activeSince) : 0)

  return (
    <div className={`thinking-block ${active ? 'thinking-block-active' : ''}`}>
      <button
        type="button"
        className="thinking-block-toggle"
        onClick={() => setOpen((value) => !value)}
        disabled={!hasText}
        aria-expanded={hasText ? open : undefined}
      >
        <Sparkles size={13} strokeWidth={1.75} className="thinking-block-icon" />
        <span className="thinking-block-label">
          {active ? 'Pensando' : totalMs >= 1000 ? `Pensou por ${formatSeconds(totalMs)}` : 'Pensou'}
        </span>
        {active && totalMs >= 1000 && <span className="thinking-block-timer">{formatSeconds(totalMs)}</span>}
        {hasText && (
          <ChevronRight
            size={13}
            strokeWidth={1.75}
            className={`thinking-block-chevron ${open ? 'thinking-block-chevron-open' : ''}`}
          />
        )}
      </button>
      {open && hasText && <div className="thinking-block-text">{text}</div>}
    </div>
  )
}
