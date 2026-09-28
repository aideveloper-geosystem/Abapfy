import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Download, FileText, X } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfjsWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { StructuredValue } from '@renderer/lib/structuredResponse'
import { buildDtecPdfHtml, dtecPdfFileName } from '@renderer/lib/dtecPdf'
import './DtecDocument.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

export function DtecDocument({ data }: { data: Record<string, StructuredValue> }): JSX.Element {
  const [url, setUrl] = useState<string | null>(null)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileName = dtecPdfFileName(data)

  useEffect(() => {
    let active = true
    let objectUrl: string | null = null
    let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | null = null
    setError(null)
    window.api.documents.renderPdf(buildDtecPdfHtml(data)).then(async (encoded) => {
      const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))
      const blob = new Blob([bytes], { type: 'application/pdf' })
      objectUrl = URL.createObjectURL(blob)
      loadingTask = pdfjsLib.getDocument({ data: bytes })
      const loadedPdf = await loadingTask.promise
      if (active) { setUrl(objectUrl); setPdf(loadedPdf) }
      else { URL.revokeObjectURL(objectUrl); void loadingTask.destroy() }
    }).catch((cause: Error) => { if (active) setError(cause.message) })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      if (loadingTask) void loadingTask.destroy()
    }
    // The response is immutable after streaming; regenerate only when retrying.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt])

  useEffect(() => {
    if (!open || !pdf || !canvasRef.current) return
    let cancelled = false
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | null = null
    void pdf.getPage(page).then((pdfPage) => {
      if (cancelled || !canvasRef.current) return
      const canvas = canvasRef.current
      const pageWidth = pdfPage.getViewport({ scale: 1 }).width
      const availableWidth = canvas.parentElement?.clientWidth ?? 900
      const viewport = pdfPage.getViewport({ scale: Math.min((availableWidth - 40) / pageWidth, 2.2) })
      canvas.width = viewport.width
      canvas.height = viewport.height
      const context = canvas.getContext('2d')
      if (!context) return
      task = pdfPage.render({ canvasContext: context, canvas, viewport })
      return task.promise
    }).catch((cause: Error) => { if (!cancelled && cause.name !== 'RenderingCancelledException') setError(cause.message) })
    return () => { cancelled = true; task?.cancel() }
  }, [open, page, pdf])

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open])

  return <>
    <div className="dtec-document-card">
      <FileText size={22} strokeWidth={1.5} />
      <div className="dtec-document-info">
        <strong>Documentação técnica</strong>
        <span>{error ? `Falha ao gerar PDF: ${error}` : url ? fileName : 'Preparando PDF…'}</span>
      </div>
      {error && !url && <button type="button" onClick={() => setAttempt((value) => value + 1)}>Tentar novamente</button>}
      {url && <>
        <button type="button" onClick={() => setOpen(true)}>Abrir no Abapfy</button>
        <a href={url} download={fileName}><Download size={14} /> Baixar PDF</a>
      </>}
    </div>
    {open && pdf && createPortal(<div className="dtec-preview-backdrop" role="presentation" onClick={() => setOpen(false)}>
      <div className="dtec-preview" role="dialog" aria-modal="true" aria-label={`Documentação técnica ${fileName}`} onClick={(event) => event.stopPropagation()}>
        <header><strong>{fileName}</strong><a href={url ?? undefined} download={fileName}><Download size={15} /> Baixar</a><button type="button" aria-label="Fechar" onClick={() => setOpen(false)}><X size={18} /></button></header>
        <div className="dtec-preview-page"><canvas ref={canvasRef} /></div>
        <footer><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={17} /> Anterior</button><span>Página {page} de {pdf.numPages}</span><button type="button" disabled={page >= pdf.numPages} onClick={() => setPage((value) => value + 1)}>Próxima <ChevronRight size={17} /></button></footer>
      </div>
    </div>, document.body)}
  </>
}
