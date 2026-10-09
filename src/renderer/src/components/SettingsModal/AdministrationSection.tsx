import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  Building2,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  FolderKanban,
  KeyRound,
  Loader2,
  MailPlus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Users
} from 'lucide-react'
import { supabase } from '@renderer/lib/supabaseClient'
import { useAuthStore } from '@renderer/store/authStore'
import { useClientsStore } from '@renderer/store/clientsStore'
import './AdministrationSection.css'
import { CatalogAdministration } from './CatalogAdministration'

interface TeamMember {
  email: string
  role: 'MASTER' | 'ADMIN'
  granted_at: string
}
interface AdminInvitation {
  id: string
  email: string
  code: string
  created_at: string
  expires_at: string
  accepted_at: string | null
}
interface Props {
  onOpenClients: () => void
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value)
  )
}

export function AdministrationSection({ onOpenClients }: Props): JSX.Element {
  const { role, user, profile, refreshRole } = useAuthStore()
  const { clients, modules, load: loadClients } = useClientsStore()
  const [team, setTeam] = useState<TeamMember[]>([])
  const [invitations, setInvitations] = useState<AdminInvitation[]>([])
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      if (role === 'MASTER') {
        const [members, invites] = await Promise.all([
          supabase.rpc('list_abapfy_admins'),
          supabase
            .from('admin_invitations')
            .select('id, email, code, created_at, expires_at, accepted_at')
            .order('created_at', { ascending: false })
            .limit(40)
        ])
        if (members.error || invites.error) throw members.error ?? invites.error
        setTeam((members.data ?? []) as TeamMember[])
        setInvitations((invites.data ?? []) as AdminInvitation[])
      }
      if (role) await loadClients()
    } catch (cause) {
      setNotice({ text: (cause as Error).message, error: true })
    } finally {
      setLoading(false)
    }
  }, [role, loadClients])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function createInvite(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (busy || !email.trim()) return
    setBusy(true)
    setNotice(null)
    try {
      const { error } = await supabase.rpc('create_admin_invitation', {
        p_email: email.trim().toLowerCase()
      })
      if (error) throw error
      setEmail('')
      setNotice({
        text: 'Convite gerado. Copie o código na lista e envie ao destinatário.',
        error: false
      })
      await refresh()
    } catch (cause) {
      setNotice({ text: (cause as Error).message, error: true })
    } finally {
      setBusy(false)
    }
  }

  async function copyInvite(invitation: AdminInvitation): Promise<void> {
    try {
      await navigator.clipboard.writeText(
        `Convite para administrador do Abapfy\nE-mail: ${invitation.email}\nCódigo: ${invitation.code}\nEntre no Abapfy com esse e-mail e acesse Configurações → Administração para ativar. Válido até ${dateTime(invitation.expires_at)}.`
      )
      setCopiedCode(invitation.code)
      setNotice({
        text: 'Instruções e código copiados. O envio ao convidado é manual.',
        error: false
      })
    } catch {
      setNotice({
        text: 'Não foi possível copiar. Selecione o código exibido na lista.',
        error: true
      })
    }
  }

  async function revokeAdmin(member: TeamMember): Promise<void> {
    if (
      member.role !== 'ADMIN' ||
      !window.confirm(`Revogar o acesso de administrador de ${member.email}?`)
    )
      return
    setBusy(true)
    try {
      const { data, error } = await supabase.rpc('revoke_abapfy_admin', { p_email: member.email })
      if (error) throw error
      if (!data) throw new Error('O administrador não foi encontrado.')
      setNotice({ text: `Acesso de ${member.email} revogado.`, error: false })
      await refresh()
    } catch (cause) {
      setNotice({ text: (cause as Error).message, error: true })
    } finally {
      setBusy(false)
    }
  }

  async function acceptInvite(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (busy || !code.trim()) return
    setBusy(true)
    try {
      const { data, error } = await supabase.rpc('accept_admin_invitation', { p_code: code.trim() })
      if (error) throw error
      if (!data) throw new Error('Convite inválido, expirado ou destinado a outro e-mail.')
      await refreshRole()
      setCode('')
      setNotice({
        text: 'Convite ativado. Você já pode gerenciar clientes e módulos.',
        error: false
      })
    } catch (cause) {
      setNotice({ text: (cause as Error).message, error: true })
    } finally {
      setBusy(false)
    }
  }

  const pending = invitations.filter(
    (item) => !item.accepted_at && new Date(item.expires_at) > new Date()
  )
  const history = invitations.filter(
    (item) => item.accepted_at || new Date(item.expires_at) <= new Date()
  )

  return (
    <div className="administration-section">
      <header className="administration-header">
        <div>
          <span className="administration-eyebrow">CONTROLE DE ACESSO</span>
          <h2>Administração</h2>
          <p>Equipe, convites e gestão dos clientes do Abapfy.</p>
        </div>
        <button
          type="button"
          className="administration-refresh"
          onClick={() => void refresh()}
          disabled={loading}
          title="Atualizar dados"
          aria-label="Atualizar dados"
        >
          {loading ? (
            <Loader2 size={16} className="administration-spin" />
          ) : (
            <RefreshCw size={16} />
          )}
        </button>
      </header>
      <div className="administration-identity">
        <span className="administration-identity-icon">
          <ShieldCheck size={20} />
        </span>
        <div>
          <strong>{profile?.nome || user?.email || 'Sua conta'}</strong>
          <span>{user?.email}</span>
        </div>
        <span className="administration-role">{role || 'USUÁRIO'}</span>
      </div>
      {notice && (
        <div
          role="status"
          className={`administration-notice ${notice.error ? 'administration-notice-error' : ''}`}
        >
          {!notice.error && <CheckCircle2 size={16} />} {notice.text}
        </div>
      )}
      {role && <CatalogAdministration />}
      {role && (
        <div className="administration-stats">
          <div>
            <Building2 size={17} />
            <strong>{clients.length}</strong>
            <span>Clientes</span>
          </div>
          <div>
            <FolderKanban size={17} />
            <strong>{modules.length}</strong>
            <span>Módulos</span>
          </div>
          {role === 'MASTER' && (
            <div>
              <Users size={17} />
              <strong>{team.length}</strong>
              <span>Responsáveis</span>
            </div>
          )}
          {role === 'MASTER' && (
            <div>
              <Clock3 size={17} />
              <strong>{pending.length}</strong>
              <span>Convites pendentes</span>
            </div>
          )}
        </div>
      )}
      {role === 'MASTER' && (
        <>
          <section className="administration-panel">
            <div className="administration-panel-heading">
              <div>
                <h3>Equipe com acesso administrativo</h3>
                <p>O MASTER define quem pode gerenciar clientes, módulos e workbooks.</p>
              </div>
              <Users size={18} />
            </div>
            <div className="administration-list">
              {team.map((member) => (
                <div className="administration-person" key={member.email}>
                  <span className="administration-avatar">
                    {member.email.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="administration-person-info">
                    <strong>{member.email}</strong>
                    <small>Desde {dateTime(member.granted_at)}</small>
                  </div>
                  <span
                    className={`administration-pill ${member.role === 'MASTER' ? 'administration-pill-master' : ''}`}
                  >
                    {member.role}
                  </span>
                  {member.role === 'ADMIN' && (
                    <button
                      type="button"
                      className="administration-icon-danger"
                      title={`Revogar acesso de ${member.email}`}
                      aria-label={`Revogar acesso de ${member.email}`}
                      disabled={busy}
                      onClick={() => void revokeAdmin(member)}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
              {!loading && team.length === 0 && (
                <p className="administration-empty">Nenhum responsável encontrado.</p>
              )}
            </div>
          </section>
          <section className="administration-panel">
            <div className="administration-panel-heading">
              <div>
                <h3>Convidar administrador</h3>
                <p>
                  O código fica disponível aqui por 7 dias. Compartilhe-o com a pessoa convidada.
                </p>
              </div>
              <MailPlus size={18} />
            </div>
            <form
              className="administration-invite-form"
              onSubmit={(event) => void createInvite(event)}
            >
              <label htmlFor="administration-email">E-mail do convidado</label>
              <div>
                <input
                  id="administration-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="nome@empresa.com"
                />
                <button type="submit" disabled={busy || !email.trim()}>
                  {busy ? (
                    <Loader2 size={15} className="administration-spin" />
                  ) : (
                    <MailPlus size={15} />
                  )}{' '}
                  Gerar convite
                </button>
              </div>
            </form>
            <div className="administration-subheading">
              <strong>Convites pendentes</strong>
              <span>{pending.length}</span>
            </div>
            <div className="administration-list">
              {pending.map((invitation) => (
                <div className="administration-invitation" key={invitation.id}>
                  <span className="administration-invite-icon">
                    <MailPlus size={16} />
                  </span>
                  <div className="administration-person-info">
                    <strong>{invitation.email}</strong>
                    <small>Expira em {dateTime(invitation.expires_at)}</small>
                    <code title="Código do convite">{invitation.code}</code>
                  </div>
                  <button
                    type="button"
                    className="administration-copy"
                    onClick={() => void copyInvite(invitation)}
                  >
                    {copiedCode === invitation.code ? <Check size={14} /> : <Copy size={14} />}{' '}
                    {copiedCode === invitation.code ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
              ))}
              {!loading && pending.length === 0 && (
                <p className="administration-empty">Nenhum convite aguardando ativação.</p>
              )}
            </div>
            {history.length > 0 && (
              <details className="administration-history">
                <summary>Histórico de convites ({history.length})</summary>
                {history.map((item) => (
                  <div key={item.id}>
                    <span>{item.email}</span>
                    <small>
                      {item.accepted_at ? `Ativado em ${dateTime(item.accepted_at)}` : 'Expirado'}
                    </small>
                  </div>
                ))}
              </details>
            )}
          </section>
        </>
      )}
      {!role && (
        <section className="administration-panel">
          <div className="administration-panel-heading">
            <div>
              <h3>Ativar convite</h3>
              <p>Entre com o e-mail convidado e informe o código recebido do MASTER.</p>
            </div>
            <KeyRound size={18} />
          </div>
          <form
            className="administration-invite-form"
            onSubmit={(event) => void acceptInvite(event)}
          >
            <label htmlFor="administration-code">Código do convite</label>
            <div>
              <input
                id="administration-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="Cole o código recebido"
                required
              />
              <button type="submit" disabled={busy || !code.trim()}>
                Ativar acesso
              </button>
            </div>
          </form>
        </section>
      )}
      {role && (
        <section className="administration-panel administration-clients-panel">
          <div className="administration-panel-heading">
            <div>
              <h3>Clientes e módulos</h3>
              <p>
                {role === 'MASTER'
                  ? 'Gerencie as regras de cada cliente e sua estrutura compartilhada.'
                  : 'Você pode criar e editar clientes, módulos e workbooks.'}
              </p>
            </div>
            <Building2 size={18} />
          </div>
          <div className="administration-client-preview">
            {clients.slice(0, 4).map((client) => (
              <span key={client.id}>{client.name}</span>
            ))}
            {clients.length === 0 && <span>Nenhum cliente cadastrado</span>}
            {clients.length > 4 && <span>+{clients.length - 4}</span>}
          </div>
          <button type="button" className="administration-secondary-button" onClick={onOpenClients}>
            Abrir gerenciamento de clientes <span aria-hidden>→</span>
          </button>
        </section>
      )}
    </div>
  )
}
