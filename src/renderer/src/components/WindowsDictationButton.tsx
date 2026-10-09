import { useState } from 'react'
import { Mic } from 'lucide-react'

export function WindowsDictationButton({
  disabled,
  focusInput
}: {
  disabled: boolean
  focusInput: () => void
}): JSX.Element {
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function open(): Promise<void> {
    if (opening || disabled) return
    focusInput()
    setOpening(true)
    setError(null)
    try {
      await window.api.localFeatures.openWindowsDictation()
    } catch {
      setError('Clique na mensagem e pressione Win + H para iniciar o ditado do Windows.')
    } finally {
      setOpening(false)
    }
  }
  return (
    <div className="local-dictation-control">
      <button
        type="button"
        className="home-composer-icon-btn"
        disabled={disabled || opening || !window.api.localFeatures.windowsDictationSupported}
        aria-label="Ditar mensagem com Windows · Win + H"
        title="Ditado do Windows · Win + H"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => void open()}
      >
        <Mic size={16} />
      </button>
      {error && (
        <span role="alert" className="local-dictation-error">
          {error}
        </span>
      )}
    </div>
  )
}
