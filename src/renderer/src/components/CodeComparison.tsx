import { useMemo, useState } from 'react'
import { CodeBlock } from './CodeBlock'
import { unifiedCodeDiff } from '@renderer/lib/codeDiff'
import './AiInterface.css'

export function CodeComparison({
  original,
  suggested
}: {
  original: string
  suggested: string
}): JSX.Element {
  const [view, setView] = useState<'code' | 'diff'>('code')
  const diff = useMemo(() => unifiedCodeDiff(original, suggested), [original, suggested])
  return (
    <div>
      <div className="ai-message-actions" aria-label="Visualização da proposta">
        <button type="button" aria-pressed={view === 'code'} onClick={() => setView('code')}>
          Código
        </button>
        <button type="button" aria-pressed={view === 'diff'} onClick={() => setView('diff')}>
          Comparar alterações
        </button>
      </div>
      {view === 'diff' ? (
        <CodeBlock language="diff" code={diff} />
      ) : (
        <div className="technical-response-comparison">
          {original && (
            <div>
              <h5>Código original</h5>
              <CodeBlock language="abap" code={original} />
            </div>
          )}
          {suggested && (
            <div>
              <h5>Proposta de correção</h5>
              <CodeBlock language="abap" code={suggested} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
