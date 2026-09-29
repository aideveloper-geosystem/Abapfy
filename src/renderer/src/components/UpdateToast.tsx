import { useEffect, useState } from 'react'
import { Download, RotateCw, X } from 'lucide-react'
import type { UpdateAvailableInfo, UpdateStatus } from '../../../preload/index.d'
import './UpdateToast.css'

/**
 * Aviso de nova versão. O main process checa atualizações sozinho (ao abrir e
 * periodicamente); este toast monta uma vez em App.tsx e deixa o usuário baixar
 * e instalar sem ir até Configurações → Atualizações. "Depois" esconde o aviso
 * daquela versão até o app reiniciar; quando o download termina ele volta, já
 * com a ação de reiniciar.
 */
export function UpdateToast(): JSX.Element | null {
  const [status, setStatus] = useState<UpdateStatus>('idle')
  const [latest, setLatest] = useState<UpdateAvailableInfo | null>(null)
  const [percent, setPercent] = useState(0)
  const [dismissed, setDismissed] = useState<string | null>(null)

  useEffect(() => {
    window.api.updates.getState().then((snapshot) => {
      setStatus(snapshot.status)
      setLatest(snapshot.latest)
      setPercent(snapshot.progress?.percent ?? 0)
    })

    const unsubscribers = [
      window.api.updates.onAvailable((info) => {
        setStatus('available')
        setLatest(info)
      }),
      window.api.updates.onProgress((info) => {
        setStatus('downloading')
        setPercent(info.percent)
      }),
      window.api.updates.onDownloaded(() => {
        setStatus('downloaded')
        setDismissed(null)
      }),
      window.api.updates.onNotAvailable(() => setStatus('up-to-date')),
      // Erro durante o download volta para "disponível" para permitir tentar de novo;
      // erros de checagem (ex.: sem rede) não interrompem o usuário.
      window.api.updates.onError(() => setStatus((current) => (current === 'downloading' ? 'available' : current)))
    ]
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
  }, [])

  const visible = status === 'available' || status === 'downloading' || status === 'downloaded'
  const dismissKey = `${status === 'downloaded' ? 'ready' : 'offer'}:${latest?.version ?? ''}`
  if (!visible || !latest || dismissed === dismissKey) return null

  async function handleDownload(): Promise<void> {
    setStatus('downloading')
    setPercent(0)
    try {
      await window.api.updates.download()
    } catch {
      setStatus('available')
    }
  }

  return (
    <div className="update-toast" role="status" aria-live="polite">
      <div className="update-toast-icon">
        {status === 'downloaded' ? <RotateCw size={16} strokeWidth={1.75} /> : <Download size={16} strokeWidth={1.75} />}
      </div>
      <div className="update-toast-body">
        <p className="update-toast-title">
          {status === 'downloaded' ? `Abapfy ${latest.version} pronto para instalar` : `Nova versão ${latest.version} disponível`}
        </p>
        <p className="update-toast-detail">
          {status === 'available' && 'Atualize para receber as melhorias e correções mais recentes.'}
          {status === 'downloading' && `Baixando atualização… ${Math.round(percent)}%`}
          {status === 'downloaded' && 'Reinicie o app para concluir a atualização.'}
        </p>
        {status === 'downloading' && (
          <div className="update-toast-progress">
            <div className="update-toast-progress-fill" style={{ width: `${percent}%` }} />
          </div>
        )}
        {status !== 'downloading' && (
          <div className="update-toast-actions">
            <button type="button" className="update-toast-btn-later" onClick={() => setDismissed(dismissKey)}>
              Depois
            </button>
            {status === 'available' ? (
              <button type="button" className="update-toast-btn-primary" onClick={handleDownload}>
                Atualizar agora
              </button>
            ) : (
              <button type="button" className="update-toast-btn-primary" onClick={() => window.api.updates.install()}>
                Reiniciar e instalar
              </button>
            )}
          </div>
        )}
      </div>
      {status !== 'downloading' && (
        <button type="button" className="update-toast-close" aria-label="Fechar" onClick={() => setDismissed(dismissKey)}>
          <X size={14} strokeWidth={1.75} />
        </button>
      )}
    </div>
  )
}
