import { memo, useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import './CodeBlock.css'

interface CodeBlockProps {
  language?: string
  code: string
}

// O Markdown reprocessa a árvore inteira a cada delta da mensagem em
// streaming — sem memo, todo bloco de código já finalizado re-rodaria o
// highlight do Prism (não é barato) de novo a cada pedacinho de texto novo
// que chega, mesmo sem ter mudado uma linha. Com memo, só o bloco que está
// de fato crescendo (dentro da cerca ``` sendo digitada) recalcula.
export const CodeBlock = memo(function CodeBlock({ language, code }: CodeBlockProps): JSX.Element {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const timerRef = useRef<number>()
  const lines = code.split('\n')
  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true); setCopyError(false)
      window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => setCopied(false), 1500)
    } catch { setCopyError(true) }
  }

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span className="code-block-lang">{language || 'text'} · {lines.length} {lines.length === 1 ? 'linha' : 'linhas'}</span>
        <button type="button" className="code-block-copy" onClick={handleCopy}>
          {copied ? <Check size={12} strokeWidth={2} /> : <Copy size={12} strokeWidth={1.75} />}
          {copied ? 'Copiado' : copyError ? 'Use Ctrl+C' : 'Copiar'}
        </button>
      </div>
      <SyntaxHighlighter
        language={language || 'text'}
        style={vscDarkPlus}
        customStyle={{
          margin: 0,
          background: 'transparent',
          padding: '12px 14px',
          fontSize: '12.5px'
        }}
        codeTagProps={{ style: { fontFamily: 'var(--font-mono)' } }}
        wrapLongLines
        showLineNumbers
        lineNumberStyle={{ color: 'var(--color-ink-tertiary)', minWidth: '2.5em', userSelect: 'none' }}
        wrapLines
        lineProps={(lineNumber) => ({
          className: language === 'diff' ? lines[lineNumber - 1]?.startsWith('+') ? 'code-line-added' : lines[lineNumber - 1]?.startsWith('-') ? 'code-line-removed' : undefined : undefined
        })}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
})
