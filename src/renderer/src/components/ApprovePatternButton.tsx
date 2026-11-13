import { FormEvent, useEffect, useState } from 'react'
import { BadgeCheck, Check, X } from 'lucide-react'
import { useCodePatternsStore } from '@renderer/store/codePatternsStore'
import { useAuthStore } from '@renderer/store/authStore'
import { useClientsStore } from '@renderer/store/clientsStore'
import { parseTags, suggestPatternTitle } from '@renderer/lib/codePatterns'
import './ApprovePatternButton.css'

/** Shortcut on an ABAP block: approve it as a pattern the agent may follow for this client. */
export function ApprovePatternButton({ code }: { code: string }): JSX.Element | null {
  const scope = useCodePatternsStore((state) => state.scope)
  const userId = useAuthStore((state) => state.user?.id)
  const clientName = useClientsStore((state) =>
    state.clients.find((client) => client.id === scope?.clientId)?.name
  )
  const clientId = scope?.clientId ?? null
  const approved = useCodePatternsStore((state) =>
    clientId ? state.isApproved(clientId, code) : false
  )
  // Subscribing to the list re-renders the button when approvals change.
  useCodePatternsStore((state) => (clientId ? state.byClient[clientId] : undefined))
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (clientId) void useCodePatternsStore.getState().load(clientId).catch(() => undefined)
  }, [clientId])

  if (!scope || !userId) return null
  if (approved)
    return (
      <span className="pattern-approved" title={`Padrão aprovado para ${clientName ?? 'o cliente'}`}>
        <BadgeCheck size={12} /> Aprovado
      </span>
    )

  function start(): void {
    setTitle(suggestPatternTitle(code))
    setDescription('')
    setTags('')
    setError(null)
    setOpen(true)
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!scope || !userId || saving) return
    setSaving(true)
    setError(null)
    try {
      const result = await useCodePatternsStore.getState().approve({
        userId,
        clientId: scope.clientId,
        moduleId: scope.moduleId,
        chatId: scope.chatId,
        code,
        title,
        description,
        tags: parseTags(tags)
      })
      setOpen(false)
      if (result.driveError) setNotice(`Aprovado, mas a cópia no drive falhou: ${result.driveError}`)
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <span className="pattern-approve">
      <button
        type="button"
        className="code-block-copy"
        disabled={scope.streaming}
        title={
          scope.streaming
            ? 'Aguarde a resposta terminar'
            : `Aprovar como padrão de ${clientName ?? 'cliente'}: o agente passa a seguir este estilo`
        }
        onClick={start}
      >
        <Check size={12} strokeWidth={2} /> Aprovar
      </button>
      {notice && <small className="pattern-notice">{notice}</small>}
      {open && (
        <form className="pattern-popover" onSubmit={submit} role="dialog" aria-label="Aprovar padrão de código">
          <header>
            <strong>Aprovar para {clientName ?? 'o cliente'}</strong>
            <button type="button" className="pattern-close" onClick={() => setOpen(false)} aria-label="Fechar">
              <X size={13} />
            </button>
          </header>
          <label>
            <span>Título</span>
            <input autoFocus required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            <span>Quando usar (opcional)</span>
            <textarea
              rows={2}
              maxLength={500}
              value={description}
              placeholder="Ex.: padrão de log de erros em BAPIs de pedido"
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <label>
            <span>Tags, separadas por vírgula</span>
            <input value={tags} placeholder="bapi, erro, nomenclatura" onChange={(event) => setTags(event.target.value)} />
          </label>
          <p className="pattern-hint">
            Fica salvo no drive do cliente em “Padrões aprovados” e passa a orientar o agente nas sessões deste cliente.
          </p>
          {error && <p className="pattern-error" role="alert">{error}</p>}
          <div className="pattern-actions">
            <button type="button" onClick={() => setOpen(false)}>Cancelar</button>
            <button type="submit" className="pattern-confirm" disabled={saving || !title.trim()}>
              {saving ? 'Aprovando…' : 'Aprovar'}
            </button>
          </div>
        </form>
      )}
    </span>
  )
}
