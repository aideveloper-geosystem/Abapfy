import { Children, type ReactNode, isValidElement } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CodeBlock } from './CodeBlock'
import { ClarifyQuestion } from './ClarifyQuestion'
import { EfDocxGenerator } from './EfDocxGenerator'
import { StructuredJson } from './StructuredJson'
import { parseEfDocxData } from '@renderer/lib/efDocx'
import { parseStructuredJson } from '@renderer/lib/structuredResponse'
import { parseClarify } from '@renderer/lib/clarify'
import { customizingMarkdown, isCustomizingResponse } from '@renderer/lib/customizingResponse'
import { technicalResponseKind } from '@renderer/lib/technicalResponse'
import { TechnicalResponse } from './TechnicalResponse'
import { AiPresentation } from './AiPresentation'
import { parseAiPresentation } from '@renderer/lib/aiPresentation'
import './Markdown.css'

function extractCodeProps(children: ReactNode): { language?: string; code: string } {
  const codeElement = Children.toArray(children)[0]

  if (isValidElement<{ className?: string; children?: ReactNode }>(codeElement)) {
    const className = codeElement.props.className ?? ''
    const match = /language-([\w-]+)/.exec(className)
    const code = Children.toArray(codeElement.props.children).join('')
    return { language: match?.[1], code: code.replace(/\n$/, '') }
  }

  return { code: String(children ?? '').replace(/\n$/, '') }
}

interface MarkdownProps {
  content: string
  onClarifyAnswer?: (text: string) => void
  clarifyDisabled?: boolean
  deferEfDocument?: boolean
  onPrompt?: (text: string) => void
}

export function Markdown({
  content,
  onClarifyAnswer,
  clarifyDisabled,
  deferEfDocument = false,
  onPrompt
}: MarkdownProps): JSX.Element {
  const components: Components = {
    pre({ children }) {
      const { language, code } = extractCodeProps(children)

      if (language === 'ai-ui') {
        if (deferEfDocument) return <p role="status">Preparando apresentação…</p>
        const presentation = parseAiPresentation(code)
        return presentation ? <AiPresentation data={presentation} onPrompt={onPrompt} disabled={clarifyDisabled} /> : <CodeBlock language="json" code={code} />
      }

      if (language === 'clarify') {
        const parsed = parseClarify(code)
        if (parsed) {
          return (
            <ClarifyQuestion
              question={parsed.question}
              options={parsed.options}
              onAnswer={onClarifyAnswer}
              disabled={clarifyDisabled}
            />
          )
        }
      }

      if (language !== 'clarify') {
        const efDocx = parseEfDocxData(code)
        if (efDocx) {
          if (deferEfDocument) return <p>Finalizando o documento EF…</p>
          return <EfDocxGenerator data={efDocx} />
        }

        const structured = parseStructuredJson(code)
        if (structured) {
          if (isCustomizingResponse(structured)) {
            return <Markdown content={customizingMarkdown(structured)} />
          }
          const technicalKind = technicalResponseKind(structured)
          if (technicalKind) return <TechnicalResponse data={structured} kind={technicalKind} />
          return <StructuredJson data={structured} />
        }
      }

      return <CodeBlock language={language} code={code} />
    },
    code({ className, children, ...props }) {
      return (
        <code className={`md-inline-code ${className ?? ''}`} {...props}>
          {children}
        </code>
      )
    },
    a({ children, ...props }) {
      return (
        <a {...props} target="_blank" rel="noreferrer">
          {children}
        </a>
      )
    }
  }

  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
