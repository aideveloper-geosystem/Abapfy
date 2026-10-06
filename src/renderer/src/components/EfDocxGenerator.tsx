import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Download, FileText } from 'lucide-react'
import { efDocxFileName, generateEfDocx, type EfDocxData } from '@renderer/lib/efDocx'
import './EfDocxGenerator.css'
import { SharedEfDocument } from './SharedEfDocument'
import type { EfDocumentJob } from '@renderer/lib/efDrive'

interface EfDocxGeneratorProps {
  data: EfDocxData
  job?: EfDocumentJob
}

type Status = 'generating' | 'ready' | 'error'

export function EfDocxGenerator({ data, job }: EfDocxGeneratorProps): JSX.Element {
  return job ? <SharedEfDocument data={data} job={job} /> : <LegacyEfDocxGenerator data={data} />
}

function LegacyEfDocxGenerator({ data }: EfDocxGeneratorProps): JSX.Element {
  const [status, setStatus] = useState<Status>('generating')
  const [error, setError] = useState('')
  const [fileUrl, setFileUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    generateEfDocx(data)
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setFileUrl(objectUrl)
        setStatus('ready')
      })
      .catch((err: Error) => {
        if (cancelled) return
        setError(err.message)
        setStatus('error')
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleDownload(): void {
    if (!fileUrl) return
    const anchor = document.createElement('a')
    anchor.href = fileUrl
    anchor.download = efDocxFileName(data)
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  }

  return (
    <div className="ef-docx-card">
      {status === 'generating' && (
        <>
          <div className="ef-docx-icon ef-docx-icon-generating">
            <FileText size={20} strokeWidth={1.5} />
          </div>
          <div className="ef-docx-info">
            <span className="ef-docx-title">Gerando Especificação Funcional…</span>
            <span className="ef-docx-subtitle">
              Preenchendo o modelo oficial com &ldquo;{data.project_name}&rdquo;
            </span>
            <div className="ef-docx-progress">
              <div className="ef-docx-progress-bar" />
            </div>
          </div>
        </>
      )}

      {status === 'ready' && (
        <>
          <div className="ef-docx-icon ef-docx-icon-ready">
            <CheckCircle2 size={20} strokeWidth={1.75} />
          </div>
          <div className="ef-docx-info">
            <span className="ef-docx-title">Documento pronto</span>
            <span className="ef-docx-subtitle">{efDocxFileName(data)}</span>
          </div>
          <button type="button" className="ef-docx-download" onClick={handleDownload}>
            <Download size={13} strokeWidth={1.75} />
            Baixar .docx
          </button>
        </>
      )}

      {status === 'error' && (
        <>
          <div className="ef-docx-icon ef-docx-icon-error">
            <AlertCircle size={20} strokeWidth={1.75} />
          </div>
          <div className="ef-docx-info">
            <span className="ef-docx-title">Não foi possível gerar o documento</span>
            <span className="ef-docx-subtitle">{error}</span>
          </div>
        </>
      )}
    </div>
  )
}
