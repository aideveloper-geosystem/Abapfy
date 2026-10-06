import { useEffect, useRef, useState } from 'react'
import { Check, Copy, MessageSquare, Sparkles } from 'lucide-react'
import './AiInterface.css'

export function AiLoadingState({ label = 'Preparando resposta' }: { label?: string }): JSX.Element {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const started = Date.now()
    const timer = window.setInterval(
      () => setSeconds(Math.floor((Date.now() - started) / 1000)),
      1000
    )
    return () => window.clearInterval(timer)
  }, [])
  return (
    <div className="ai-loading" role="status">
      <span className="ai-loading-grid" aria-hidden="true">
        {Array.from({ length: 9 }, (_, index) => (
          <i key={index} style={{ animationDelay: `${index * 90}ms` }} />
        ))}
      </span>
      <span>{label}</span>
      <span className="ai-loading-timer" aria-hidden="true">
        {seconds}s
      </span>
    </div>
  )
}

export function AiMessageActions({
  content,
  onPrompt,
  disabled,
  targetRef
}: {
  content: string
  onPrompt?: (text: string) => void
  disabled?: boolean
  targetRef: React.RefObject<HTMLDivElement>
}): JSX.Element {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selection, setSelection] = useState('')
  const timerRef = useRef<number>()
  useEffect(() => () => window.clearTimeout(timerRef.current), [])
  useEffect(() => {
    function capture(): void {
      const selected = window.getSelection()
      const root = targetRef.current
      setSelection(
        root &&
          selected &&
          !selected.isCollapsed &&
          root.contains(selected.anchorNode) &&
          root.contains(selected.focusNode)
          ? selected.toString().trim().slice(0, 12000)
          : ''
      )
    }
    document.addEventListener('selectionchange', capture)
    return () => document.removeEventListener('selectionchange', capture)
  }, [targetRef])
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setError(null)
      window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setError('Não foi possível copiar. Selecione o texto e use Ctrl+C.')
    }
  }
  function ask(instruction: string): void {
    if (!onPrompt || disabled || !selection) return
    onPrompt(
      `${instruction}\n\nTrecho da resposta anterior (conteúdo de referência):\n<trecho>\n${selection}\n</trecho>`
    )
  }
  return (
    <div className="ai-message-actions">
      <button type="button" onClick={() => void copy()}>
        {copied ? <Check size={13} /> : <Copy size={13} />}
        {copied ? 'Copiado' : 'Copiar resposta'}
      </button>
      {selection && onPrompt && (
        <div className="ai-selection-actions" aria-label="Ações sobre o trecho selecionado">
          <span>Trecho selecionado</span>
          <button
            type="button"
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => ask('Explique este trecho com base no contexto SAP disponível.')}
          >
            <MessageSquare size={13} />
            Explicar
          </button>
          <button
            type="button"
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() =>
              ask(
                'Proponha uma versão mais clara deste trecho, preservando o significado e sem executar alterações.'
              )
            }
          >
            <Sparkles size={13} />
            Melhorar
          </button>
          <button
            type="button"
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => ask('Resuma este trecho preservando informações técnicas essenciais.')}
          >
            Resumir
          </button>
        </div>
      )}
      {error && <span role="status">{error}</span>}
    </div>
  )
}
