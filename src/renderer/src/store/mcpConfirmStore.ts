import { create } from 'zustand'

/**
 * Fila de confirmações MCP pendentes ("iniciar servidor local" / "autorizar
 * ferramenta que escreve dado") — substitui o dialog nativo do Electron por um
 * card dentro do próprio app (McpConfirmationBanner), não-modal, que não
 * depende da janela estar em foco pra ser visto. O main process manda o
 * pedido via `mcp:confirmation-pending` (ver src/main/index.ts) e fica
 * esperando a resposta; aprovar/recusar aqui resolve essa promise do lado main.
 */
export interface McpConfirmationRequest {
  callId: string
  kind: 'server' | 'tool'
  scope?: 'session'
  serverName: string
  toolName?: string
  detail: string
}

interface McpConfirmState {
  queue: McpConfirmationRequest[]
  push: (request: McpConfirmationRequest) => void
  remove: (callId: string) => void
  respond: (callId: string, approved: boolean) => void
  reset: () => void
}

export const useMcpConfirmStore = create<McpConfirmState>((set) => ({
  queue: [],

  push: (request) =>
    set((state) =>
      state.queue.some((item) => item.callId === request.callId)
        ? state
        : { queue: [...state.queue, request] }
    ),

  remove: (callId) => set((state) => ({ queue: state.queue.filter((item) => item.callId !== callId) })),

  respond: (callId, approved) => {
    window.api.mcp.respondConfirmation(callId, approved)
    set((state) => ({ queue: state.queue.filter((item) => item.callId !== callId) }))
  },

  reset: () => set({ queue: [] })
}))
