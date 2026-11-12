import { useEffect, useState } from 'react'
import { Check, Copy, LogOut, RefreshCw, UserMinus, X } from 'lucide-react'
import { useAuthStore } from '@renderer/store/authStore'
import { useWorkspaceStore } from '@renderer/store/workspaceStore'
import {
  assignableRoles,
  canRemoveMember,
  isWorkspaceAdmin,
  WORKSPACE_ROLE_HINTS,
  WORKSPACE_ROLE_LABELS,
  type WorkspaceRole
} from '@renderer/lib/workspaceAccess'
import './WorkspaceScreen.css'

export function WorkspaceScreen(): JSX.Element {
  const userId = useAuthStore((state) => state.user?.id)
  const {
    workspace,
    members,
    requests,
    error,
    legacy,
    loadAdmin,
    decide,
    setMemberRole,
    removeMember,
    regenerateCode,
    rename,
    clearError
  } = useWorkspaceStore()
  const [name, setName] = useState(workspace?.name ?? '')
  const [copied, setCopied] = useState(false)
  const [approveRole, setApproveRole] = useState<Record<string, WorkspaceRole>>({})
  const admin = isWorkspaceAdmin(workspace?.role)
  const actorRole = workspace?.role

  useEffect(() => {
    void loadAdmin()
  }, [loadAdmin])
  useEffect(() => setName(workspace?.name ?? ''), [workspace?.name])

  if (legacy) {
    return (
      <section className="workspace-screen">
        <header>
          <h1>Workspace</h1>
          <p>Os workspaces ainda não estão habilitados neste banco de dados. Aplique a migração 041 no Supabase.</p>
        </header>
      </section>
    )
  }
  if (!workspace) return <section className="workspace-screen" />

  async function copyCode(): Promise<void> {
    if (!workspace?.joinCode) return
    try {
      await navigator.clipboard.writeText(workspace.joinCode)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard may be unavailable; the code stays visible for manual copy */
    }
  }

  async function handleLeave(): Promise<void> {
    if (!userId || !window.confirm('Sair deste workspace? Você perde acesso aos clientes e ao conteúdo dele.')) return
    await removeMember(userId)
  }

  async function handleRemove(target: string, label: string): Promise<void> {
    if (!window.confirm(`Remover ${label} do workspace?`)) return
    await removeMember(target)
  }

  return (
    <section className="workspace-screen" aria-labelledby="workspace-title">
      <header>
        <div>
          <h1 id="workspace-title">Workspace</h1>
          <p>Pessoas, papéis e entrada de novos membros.</p>
        </div>
        <button type="button" className="workspace-icon-button" onClick={() => void loadAdmin()} title="Atualizar" aria-label="Atualizar">
          <RefreshCw size={14} />
        </button>
      </header>

      {error && (
        <p className="workspace-error" role="alert">
          {error} <button type="button" onClick={clearError}>Fechar</button>
        </p>
      )}

      <div className="workspace-card">
        <label className="workspace-field">
          <span>Nome</span>
          <input
            value={name}
            disabled={!admin}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => {
              if (admin && name.trim().length >= 2 && name.trim() !== workspace.name) void rename(name)
              else setName(workspace.name)
            }}
          />
        </label>
        <div className="workspace-field">
          <span>Seu papel</span>
          <strong>{WORKSPACE_ROLE_LABELS[workspace.role]}</strong>
          <small>{WORKSPACE_ROLE_HINTS[workspace.role]}</small>
        </div>
        {admin && workspace.joinCode && (
          <div className="workspace-field">
            <span>Código de entrada</span>
            <div className="workspace-code-row">
              <code>{workspace.joinCode}</code>
              <button type="button" onClick={() => void copyCode()}>
                {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copiado' : 'Copiar'}
              </button>
              <button type="button" onClick={() => void regenerateCode()} title="Invalida o código atual">
                <RefreshCw size={13} /> Gerar novo
              </button>
            </div>
            <small>Compartilhe com quem deve entrar. Cada pedido precisa da sua aprovação.</small>
          </div>
        )}
      </div>

      {admin && (
        <div className="workspace-card">
          <h2>
            Pedidos de entrada <span className="workspace-count">{requests.length}</span>
          </h2>
          {requests.length === 0 ? (
            <p className="workspace-empty">Nenhum pedido pendente.</p>
          ) : (
            <ul className="workspace-list">
              {requests.map((request) => {
                const roles = assignableRoles(actorRole).filter((role) => role !== 'OWNER')
                return (
                  <li key={request.id}>
                    <div className="workspace-person">
                      <strong>{request.nome || request.email}</strong>
                      <small>
                        {request.email}
                        {request.message ? ` · “${request.message}”` : ''}
                      </small>
                    </div>
                    <select
                      aria-label={`Papel de ${request.nome || request.email}`}
                      value={approveRole[request.id] ?? 'MEMBER'}
                      onChange={(event) => setApproveRole((state) => ({ ...state, [request.id]: event.target.value as WorkspaceRole }))}
                    >
                      {roles.map((role) => (
                        <option key={role} value={role}>
                          {WORKSPACE_ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="workspace-approve" onClick={() => void decide(request.id, true, approveRole[request.id] ?? 'MEMBER')}>
                      <Check size={13} /> Aprovar
                    </button>
                    <button type="button" className="workspace-reject" onClick={() => void decide(request.id, false)}>
                      <X size={13} /> Recusar
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      <div className="workspace-card">
        <h2>
          Membros <span className="workspace-count">{members.length}</span>
        </h2>
        <ul className="workspace-list">
          {members.map((member) => {
            const self = member.userId === userId
            const label = member.nome || member.email || 'Membro'
            const roles = assignableRoles(actorRole)
            const canChangeRole = actorRole === 'OWNER'
            return (
              <li key={member.userId}>
                <div className="workspace-person">
                  <strong>
                    {label}
                    {self ? ' (você)' : ''}
                  </strong>
                  <small>{[member.cargo, member.email].filter(Boolean).join(' · ')}</small>
                </div>
                {canChangeRole ? (
                  <select
                    aria-label={`Papel de ${label}`}
                    value={member.role}
                    onChange={(event) => void setMemberRole(member.userId, event.target.value as WorkspaceRole)}
                  >
                    {roles.map((role) => (
                      <option key={role} value={role}>
                        {WORKSPACE_ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className={`workspace-pill workspace-pill-${member.role.toLowerCase()}`}>{WORKSPACE_ROLE_LABELS[member.role]}</span>
                )}
                {self ? (
                  <button type="button" className="workspace-reject" onClick={() => void handleLeave()}>
                    <LogOut size={13} /> Sair
                  </button>
                ) : (
                  canRemoveMember(actorRole, member.role, false) && (
                    <button type="button" className="workspace-reject" onClick={() => void handleRemove(member.userId, label)}>
                      <UserMinus size={13} /> Remover
                    </button>
                  )
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
