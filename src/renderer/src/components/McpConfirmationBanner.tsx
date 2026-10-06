import { useEffect } from 'react'
import { ShieldAlert } from 'lucide-react'
import { useMcpConfirmStore } from '@renderer/store/mcpConfirmStore'
import './McpConfirmationBanner.css'

/**
 * Substitui o dialog nativo do Electron pra autorização MCP (iniciar servidor
 * local / rodar ferramenta que escreve dado). Monta uma vez em App.tsx —
 * assina os eventos do main process e mantém a fila global em mcpConfirmStore,
 * então funciona não importa em qual tela o usuário esteja quando o pedido
 * chega.
 */
export function McpConfirmationBanner(): JSX.Element | null {
  const queue = useMcpConfirmStore((state) => state.queue)
  const push = useMcpConfirmStore((state) => state.push)
  const remove = useMcpConfirmStore((state) => state.remove)
  const respond = useMcpConfirmStore((state) => state.respond)

  useEffect(() => {
    const unsubscribePending = window.api.mcp.onConfirmationPending((event) => {
      if (event.kind !== 'server' && event.kind !== 'tool') return
      push(event)
    })
    const unsubscribeResolved = window.api.mcp.onConfirmationResolved((event) => {
      remove(event.callId)
    })
    return () => {
      unsubscribePending()
      unsubscribeResolved()
    }
  }, [push, remove])

  if (queue.length === 0) return null

  return (
    <div className="mcp-confirm-stack" role="alert">
      {queue.map((request) => (
        <div key={request.callId} className="mcp-confirm-card">
          <div className="mcp-confirm-card-icon">
            <ShieldAlert size={16} strokeWidth={1.75} />
          </div>
          <div className="mcp-confirm-card-body">
            <p className="mcp-confirm-card-title">
              {request.kind === 'server'
                ? `Iniciar servidor MCP local "${request.serverName}"?`
                : `Autorizar "${request.toolName}" em ${request.serverName}?`}
            </p>
            <span className="mcp-confirm-card-context">{request.kind === 'server' ? 'Inicialização local' : 'Solicitação de ferramenta'} · aguardando sua decisão</span>
            <details open><summary>Detalhes da solicitação</summary><pre className="mcp-confirm-card-detail">{request.detail}</pre></details>
            <div className="mcp-confirm-card-actions">
              <button type="button" className="mcp-confirm-btn-deny" onClick={() => respond(request.callId, false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="mcp-confirm-btn-approve"
                onClick={() => respond(request.callId, true)}
              >
                {request.kind === 'server' ? 'Iniciar servidor' : 'Autorizar uma vez'}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
