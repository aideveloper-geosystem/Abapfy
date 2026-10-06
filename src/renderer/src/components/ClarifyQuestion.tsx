import { FormEvent, useId, useState } from 'react'
import { ArrowRight, CheckCircle2, HelpCircle } from 'lucide-react'
import './ClarifyQuestion.css'

interface ClarifyQuestionProps {
  question: string
  options: string[]
  onAnswer?: (text: string) => void
  disabled?: boolean
}

export function ClarifyQuestion({
  question,
  options,
  onAnswer,
  disabled
}: ClarifyQuestionProps): JSX.Element {
  const [answered, setAnswered] = useState(false)
  const [customText, setCustomText] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const headingId = useId()

  const isDisabled = disabled || answered || !onAnswer

  function handleOption(option: string): void {
    if (isDisabled) return
    setAnswered(true)
    onAnswer?.(option)
  }

  function handleCustomSubmit(event: FormEvent): void {
    event.preventDefault()
    if (isDisabled || !customText.trim()) return
    setAnswered(true)
    onAnswer?.(customText.trim())
  }

  return (
    <section className="clarify-question" aria-labelledby={headingId}>
      <div className="clarify-question-text" id={headingId}>
        <HelpCircle size={15} strokeWidth={1.75} />
        {question}
      </div>

      {options.length > 0 && (
        <div className="clarify-options">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              className="clarify-option"
              disabled={isDisabled}
              aria-pressed={selected === option}
              onClick={() => { setSelected(option); setCustomText('') }}
            >
              {option}
            </button>
          ))}
        </div>
      )}

      <form className="clarify-custom" onSubmit={handleCustomSubmit}>
        <input
          type="text"
          placeholder="Ou digite algo diferente…"
          aria-label="Resposta personalizada"
          value={customText}
          disabled={isDisabled}
          onChange={(event) => { setCustomText(event.target.value); setSelected(null) }}
        />
        <button type="submit" disabled={isDisabled || !customText.trim()} aria-label="Enviar">
          <ArrowRight size={13} strokeWidth={2} />
        </button>
      </form>

      {options.length > 0 && <button type="button" className="clarify-continue" disabled={isDisabled || !selected} onClick={() => selected && handleOption(selected)}>Confirmar opção <ArrowRight size={13} /></button>}

      {answered && <span className="clarify-answered" role="status"><CheckCircle2 size={13} /> Resposta enviada</span>}
    </section>
  )
}
