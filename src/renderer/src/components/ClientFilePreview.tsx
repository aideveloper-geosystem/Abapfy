import { useEffect, useRef, useState } from 'react'
import mammoth from 'mammoth'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfjsWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { supabase } from '@renderer/lib/supabaseClient'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

export interface ClientFileRecord {
  id: string
  name: string
  content: string
  folder_id: string | null
  storage_path: string | null
  user_id: string
  created_at: string
}

const ABAP_TOKENS = /("[^\n]*|'(?:''|[^'])*'|`(?:``|[^`])*`|\b(?:CLASS|ENDCLASS|METHOD|ENDMETHOD|DATA|TYPES|CONSTANTS|FIELD-SYMBOLS|SELECT|FROM|WHERE|INTO|TABLE|LOOP|ENDLOOP|IF|ELSE|ELSEIF|ENDIF|CASE|WHEN|ENDCASE|TRY|CATCH|ENDTRY|RAISE|RETURN|APPEND|READ|MODIFY|DELETE|INSERT|UPDATE|CREATE|OBJECT|NEW|VALUE|CALL|FUNCTION|PERFORM|FORM|ENDFORM|PUBLIC|PRIVATE|PROTECTED|SECTION|IMPORTING|EXPORTING|CHANGING|RECEIVING|TYPE|LIKE|AS|BEGIN|END|OF|REPORT|PARAMETERS|WRITE|MESSAGE|CHECK|CONTINUE|EXIT|AND|OR|NOT|IS|INITIAL|ABAP_TRUE|ABAP_FALSE)\b|\b\d+(?:\.\d+)?\b)/gi

function AbapPreview({ content }: { content: string }): JSX.Element {
  const lines = content.split('\n')
  return (
    <pre className="clients-code-preview"><code>
      {lines.map((line, lineIndex) => {
        const commentStart = line.indexOf('"')
        const source = line.startsWith('*') ? '' : commentStart >= 0 ? line.slice(0, commentStart) : line
        const comment = line.startsWith('*') ? line : commentStart >= 0 ? line.slice(commentStart) : ''
        const pieces: JSX.Element[] = []
        let last = 0
        for (const match of source.matchAll(ABAP_TOKENS)) {
          const at = match.index ?? 0
          if (at > last) pieces.push(<span key={`${lineIndex}-${last}`}>{source.slice(last, at)}</span>)
          const token = match[0]
          const kind = /^[\d]/.test(token) ? 'number' : /^[`']/.test(token) ? 'string' : 'keyword'
          pieces.push(<span className={`clients-code-${kind}`} key={`${lineIndex}-${at}`}>{token}</span>)
          last = at + token.length
        }
        if (last < source.length) pieces.push(<span key={`${lineIndex}-end`}>{source.slice(last)}</span>)
        return <span key={lineIndex}>{pieces}{comment && <span className="clients-code-comment">{comment}</span>}{lineIndex < lines.length - 1 ? '\n' : ''}</span>
      })}
    </code></pre>
  )
}

function PdfPreview({ data }: { data: ArrayBuffer }): JSX.Element {
  const container = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    const target = container.current
    if (!target) return
    target.replaceChildren()
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(data.slice(0)) })
    void (async () => {
      const pdf = await loadingTask.promise
      for (let number = 1; number <= pdf.numPages && !cancelled; number += 1) {
        const page = await pdf.getPage(number)
        const viewport = page.getViewport({ scale: 1.35 })
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        canvas.setAttribute('aria-label', `Página ${number} de ${pdf.numPages}`)
        target.appendChild(canvas)
        await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise
      }
    })().catch((cause: Error) => { if (!cancelled) setError(cause.message) })
    return () => { cancelled = true; void loadingTask.destroy(); target.replaceChildren() }
  }, [data])
  return error ? <p className="clients-error">{error}</p> : <div className="clients-pdf-preview" ref={container} />
}

export function ClientFilePreview({ file, onClose }: { file: ClientFileRecord; onClose: () => void }): JSX.Element {
  const [binary, setBinary] = useState<ArrayBuffer | null>(null)
  const [docxHtml, setDocxHtml] = useState<string | null>(null)
  const [loading, setLoading] = useState(Boolean(file.storage_path))
  const [error, setError] = useState<string | null>(null)
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  const text = binary && extension !== 'pdf' && extension !== 'docx'
    ? new TextDecoder().decode(binary)
    : file.content

  useEffect(() => {
    let active = true
    if (!file.storage_path) return
    void (async () => {
      const { data, error: downloadError } = await supabase.storage.from('client-files').download(file.storage_path!)
      if (downloadError) throw downloadError
      const buffer = await data.arrayBuffer()
      if (!active) return
      setBinary(buffer)
      if (extension === 'docx') {
        const result = await mammoth.convertToHtml({ arrayBuffer: buffer })
        if (active) setDocxHtml(result.value)
      }
      if (active) setLoading(false)
    })().catch((cause: Error) => { if (active) { setError(cause.message); setLoading(false) } })
    return () => { active = false }
  }, [file.storage_path, extension])

  const wordDocument = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><style>body{font:15px/1.55 Arial,sans-serif;max-width:800px;margin:32px auto;padding:0 28px;color:#1d2d3e;background:white}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:6px}pre{white-space:pre-wrap}</style><body>${docxHtml ?? ''}</body></html>`

  return (
    <div className="clients-file-overlay" onMouseDown={onClose}>
      <article className="clients-preview" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><small>Pré-visualização</small><h2>{file.name}</h2></div><button onClick={onClose}>Fechar</button></header>
        {loading && <p>Carregando arquivo…</p>}
        {error && <p className="clients-error">Não foi possível abrir o original: {error}</p>}
        {!loading && !error && extension === 'pdf' && binary && <PdfPreview data={binary} />}
        {!loading && !error && extension === 'docx' && docxHtml !== null && <iframe title={`Documento ${file.name}`} sandbox="" srcDoc={wordDocument} />}
        {!loading && !error && extension === 'abap' && <AbapPreview content={text} />}
        {!loading && !error && extension !== 'pdf' && extension !== 'docx' && extension !== 'abap' && <pre className="clients-text-preview">{text}</pre>}
        {!file.storage_path && (extension === 'pdf' || extension === 'docx') && <p className="clients-preview-note">Arquivo anterior à atualização: somente o texto extraído está disponível.</p>}
        {!file.storage_path && (extension === 'pdf' || extension === 'docx') && <pre className="clients-text-preview">{file.content}</pre>}
      </article>
    </div>
  )
}
