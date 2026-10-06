import { Monitor } from 'lucide-react'
import './AiInterface.css'

export interface AgentScreenSnapshot {
  chatId: string
  imageDataUrl: string
  title: string
  recordedAt: number
}

/** Ephemeral capture already used by the SAP request. Expanding never captures or controls the window. */
export function AiAgentScreen({
  snapshot,
  working
}: {
  snapshot: AgentScreenSnapshot
  working: boolean
}): JSX.Element {
  return (
    <details className="ai-agent-screen">
      <summary>
        <Monitor size={14} />
        <strong>Tela SAP consultada</strong>
        <span>{working ? 'Agente em atividade' : 'Última captura da interação'}</span>
      </summary>
      <div>
        <p>
          {snapshot.title} · {new Date(snapshot.recordedAt).toLocaleTimeString('pt-BR')}
        </p>
        <img
          src={snapshot.imageDataUrl}
          alt={`Captura consultada pelo agente: ${snapshot.title}`}
        />
        <small>Captura da interação; confira a janela SAP para verificar o estado atual.</small>
      </div>
    </details>
  )
}
