import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './Markdown.css'

/** Prose inside structured fields; never dispatches embedded agent/UI commands. */
export function RichText({ content }: { content: string }): JSX.Element {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer">
              {children}
            </a>
          )
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
