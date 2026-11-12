import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, KeyRound, LogOut, RefreshCw } from 'lucide-react'
import { AbapfyMark } from '@renderer/components/AbapfyMark'
import { useAuthStore } from '@renderer/store/authStore'
import { useWorkspaceStore } from '@renderer/store/workspaceStore'
import { isValidJoinCode } from '@renderer/lib/workspaceAccess'
import './WorkspaceGateScreen.css'

type Mode = 'create' | 'join'

const STATUS_LABELS = {
  PENDING: 'Aguardando aprovação',
  APPROVED: 'Aprovado',
  REJECTED: 'Recusado',
  CANCELLED: 'Cancelado'
} as const

/**
 * Shown to signed-in users who do not belong to a workspace yet: they either create one
 * (and become its owner) or ask to join with a code; an owner/admin approves the request.
 */
export function WorkspaceGateScreen(): JSX.Element {
  const navigate = useNavigate()
  const signOut = useAuthStore((state) => state.signOut)
  const { myRequests, error, createWorkspace, requestJoin, cancelRequest, load, clearError } = useWorkspaceStore()
  const [mode, setMode] = useState<Mode>('join')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = myRequests.filter((request) => request.status === 'PENDING')

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setBusy(true)
    if (mode === 'create') await createWorkspace(name)
    else await requestJoin(code, message)
    setBusy(false)
  }

  function switchMode(next: Mode): void {
    clearError()
    setMode(next)
  }

  async function handleSignOut(): Promise<void> {
    if (await signOut()) navigate('/auth', { replace: true })
  }

  const canSubmit = mode === 'create' ? name.trim().length >= 2 : isValidJoinCode(code)

  return (
    <main className="workspace-gate">
      <section className="workspace-gate-card" aria-labelledby="workspace-gate-title">
        <AbapfyMark className="workspace-gate-mark" />
        <h1 id="workspace-gate-title">Escolha seu workspace</h1>
        <p className="workspace-gate-lead">
          Workspaces reúnem pessoas, clientes e o drive compartilhado. Crie o seu ou peça para entrar em um existente.
        </p>

        <div className="workspace-gate-tabs" role="tablist" aria-label="Como começar">
          <button type="button" role="tab" aria-selected={mode === 'join'} onClick={() => switchMode('join')}>
            <KeyRound size={14} /> Entrar com código
          </button>
          <button type="button" role="tab" aria-selected={mode === 'create'} onClick={() => switchMode('create')}>
            <Building2 size={14} /> Criar workspace
          </button>
        </div>

        <form className="workspace-gate-form" onSubmit={(event) => void submit(event)}>
          {mode === 'create' ? (
            <label>
              Nome do workspace
              <input value={name} maxLength={80} placeholder="Ex.: Consultoria Alfa" autoFocus onChange={(event) => setName(event.target.value)} />
            </label>
          ) : (
            <>
              <label>
                Código do workspace
                <input
                  value={code}
                  maxLength={14}
                  placeholder="Peça o código a um administrador"
                  className="workspace-gate-code"
                  autoFocus
                  onChange={(event) => setCode(event.target.value)}
                />
              </label>
              <label>
                Mensagem (opcional)
                <input value={message} maxLength={300} placeholder="Quem é você e por que quer entrar" onChange={(event) => setMessage(event.target.value)} />
              </label>
            </>
          )}
          {error && (
            <p className="workspace-gate-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="workspace-gate-primary" disabled={busy || !canSubmit}>
            {mode === 'create' ? 'Criar workspace' : 'Pedir para entrar'}
          </button>
        </form>

        {myRequests.length > 0 && (
          <div className="workspace-gate-requests">
            <h2>Seus pedidos</h2>
            <ul>
              {myRequests.slice(0, 5).map((request) => (
                <li key={request.id}>
                  <span>{request.workspaceName}</span>
                  <small>{STATUS_LABELS[request.status] ?? request.status}</small>
                  {request.status === 'PENDING' && (
                    <button type="button" onClick={() => void cancelRequest(request.id)}>
                      Cancelar
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {pending.length > 0 && (
              <p className="workspace-gate-hint">
                Assim que um administrador aprovar, o acesso é liberado. Use “Verificar agora” para atualizar.
              </p>
            )}
          </div>
        )}

        <footer className="workspace-gate-footer">
          <button type="button" onClick={() => void load()}>
            <RefreshCw size={13} /> Verificar agora
          </button>
          <button type="button" onClick={() => void handleSignOut()}>
            <LogOut size={13} /> Sair
          </button>
        </footer>
      </section>
    </main>
  )
}
