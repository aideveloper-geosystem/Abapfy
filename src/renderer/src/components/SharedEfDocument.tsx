import { useEffect, useState } from 'react'
import { AlertCircle, Download, FileText, Loader2 } from 'lucide-react'
import type { EfDocxData } from '@renderer/lib/efDocx'
import {
  completeEfDocument,
  downloadSavedEf,
  openSavedEf,
  type EfDocumentJob
} from '@renderer/lib/efDrive'
import './EfDocxGenerator.css'

export function SharedEfDocument({
  data,
  job
}: {
  data: EfDocxData
  job: EfDocumentJob
}): JSX.Element {
  const [current, setCurrent] = useState(job)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState(job.error ?? '')
  const [openError, setOpenError] = useState(job.openError ?? '')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    let objectUrl: string | null = null
    setUrl(null)
    if (job.state === 'pending') return
    // Loading history only downloads the existing output. It never generates,
    // saves or opens another document automatically.
    downloadSavedEf(job)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob)
        if (active) {
          setUrl(objectUrl)
          setCurrent({ ...job, state: 'saved' })
          setError('')
        } else URL.revokeObjectURL(objectUrl)
      })
      .catch((cause: Error) => {
        if (active) setError(job.error ?? cause.message)
      })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [job.fileId, job.state, attempt])

  async function open(): Promise<void> {
    setBusy(true)
    setOpenError('')
    try {
      await openSavedEf(current)
    } catch (cause) {
      setOpenError((cause as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function retry(): Promise<void> {
    setBusy(true)
    const result = await completeEfDocument(data, current)
    setCurrent(result)
    setError(result.error ?? '')
    if (result.state === 'saved') {
      setAttempt((value) => value + 1)
      try {
        await openSavedEf(result)
      } catch (cause) {
        setOpenError((cause as Error).message)
      }
    }
    setBusy(false)
  }
  return (
    <div className="ef-docx-card ef-docx-shared">
      {busy || (!url && !error) ? (
        <Loader2 size={22} className="chat-tool-badge-spin" />
      ) : error ? (
        <AlertCircle size={22} />
      ) : (
        <FileText size={22} />
      )}
      <div className="ef-docx-info">
        <span className="ef-docx-title">
          {url
            ? 'EF salva e compartilhada no drive'
            : error
              ? 'Salvamento da EF não confirmado'
              : 'Finalizando EF…'}
        </span>
        <span className="ef-docx-subtitle">
          {current.fileName} · {current.destinationLabel}
        </span>
        <span className="ef-docx-subtitle">Modelo: {current.templateLabel}</span>
        {error && (
          <span role="alert" className="ef-docx-error-detail">
            {error}
          </span>
        )}
        {openError && (
          <span role="alert" className="ef-docx-error-detail">
            {openError}
          </span>
        )}
      </div>
      {url && (
        <>
          <button
            type="button"
            className="ef-docx-download"
            disabled={busy}
            onClick={() => void open()}
          >
            Abrir no Word
          </button>
          <a className="ef-docx-download" href={url} download={current.fileName}>
            <Download size={13} /> Baixar
          </a>
        </>
      )}
      {!url && error && (
        <button
          type="button"
          className="ef-docx-download"
          disabled={busy}
          onClick={() => void retry()}
        >
          Tentar salvar novamente
        </button>
      )}
    </div>
  )
}
