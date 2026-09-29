import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CheckCircle2, Download, RefreshCw, AlertTriangle } from 'lucide-react'
import './SettingsSections.css'

type Status =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error'

interface UpdateAvailableInfo {
  version: string
  releaseNotes: string | null
  releaseDate: string
}

interface UpdateProgressInfo {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

export function UpdatesSection(): JSX.Element {
  const [currentVersion, setCurrentVersion] = useState<string>('')
  const [status, setStatus] = useState<Status>('idle')
  const [latest, setLatest] = useState<UpdateAvailableInfo | null>(null)
  const [progress, setProgress] = useState<UpdateProgressInfo | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    window.api.updates.getVersion().then(setCurrentVersion)
    // A checagem automática pode ter rodado antes desta tela abrir.
    window.api.updates.getState().then((snapshot) => {
      setStatus(snapshot.status)
      setLatest(snapshot.latest)
      setProgress(snapshot.progress)
      setErrorMessage(snapshot.error)
    })

    const unsubscribers = [
      window.api.updates.onChecking(() => {
        setStatus('checking')
        setErrorMessage(null)
      }),
      window.api.updates.onAvailable((info) => {
        setStatus('available')
        setLatest(info)
      }),
      window.api.updates.onNotAvailable(() => {
        setStatus('up-to-date')
        setLatest(null)
      }),
      window.api.updates.onProgress((info) => {
        setStatus('downloading')
        setProgress(info)
      }),
      window.api.updates.onDownloaded(() => {
        setStatus('downloaded')
      }),
      window.api.updates.onError((message) => {
        setStatus('error')
        setErrorMessage(message)
      })
    ]

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
  }, [])

  async function handleCheck(): Promise<void> {
    setStatus('checking')
    setErrorMessage(null)
    await window.api.updates.check()
  }

  async function handleDownload(): Promise<void> {
    setStatus('downloading')
    await window.api.updates.download()
  }

  async function handleInstall(): Promise<void> {
    await window.api.updates.install()
  }

  const statusLabel: Record<Status, string> = {
    idle: '',
    checking: 'Verificando…',
    'up-to-date': 'Você está usando a versão mais recente',
    available: `Versão ${latest?.version ?? ''} disponível`,
    downloading: 'Baixando atualização…',
    downloaded: 'Atualização pronta para instalar',
    error: errorMessage ?? 'Não foi possível verificar atualizações'
  }

  return (
    <div className="settings-section">
      <header className="settings-section-header">
        <h2>Atualizações</h2>
        <p>Verifique e instale novas versões do Abapfy sem sair do app.</p>
      </header>

      <div className="settings-field-group">
        <span className="settings-field-label">Versão instalada</span>
        <div className="updates-current">
          <span className="updates-current-version">{currentVersion || '—'}</span>
          <button
            type="button"
            className="updates-check-button"
            onClick={handleCheck}
            disabled={status === 'checking' || status === 'downloading'}
          >
            <RefreshCw size={14} strokeWidth={1.75} />
            Verificar atualizações
          </button>
        </div>
      </div>

      {status !== 'idle' && (
        <div className={`updates-status-badge updates-status-${status}`}>
          {status === 'up-to-date' && <CheckCircle2 size={14} strokeWidth={1.75} />}
          {status === 'error' && <AlertTriangle size={14} strokeWidth={1.75} />}
          <span>{statusLabel[status]}</span>
        </div>
      )}

      {status === 'downloading' && progress && (
        <div className="updates-progress-track">
          <div className="updates-progress-fill" style={{ width: `${progress.percent}%` }} />
        </div>
      )}

      {(status === 'available' || status === 'downloading' || status === 'downloaded') &&
        latest && (
          <div className="settings-field-group">
            <span className="settings-field-label">Notas da versão {latest.version}</span>
            {latest.releaseNotes ? (
              <div className="updates-changelog">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{latest.releaseNotes}</ReactMarkdown>
              </div>
            ) : (
              <p className="updates-changelog-empty">Sem notas de versão para esta release.</p>
            )}

            {status === 'available' && (
              <button type="button" className="updates-action-button" onClick={handleDownload}>
                <Download size={14} strokeWidth={1.75} />
                Baixar atualização
              </button>
            )}

            {status === 'downloaded' && (
              <button type="button" className="updates-action-button" onClick={handleInstall}>
                Reiniciar e instalar
              </button>
            )}
          </div>
        )}
    </div>
  )
}
