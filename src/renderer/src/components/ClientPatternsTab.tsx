import { FormEvent, useEffect, useMemo, useState } from 'react'
import { BadgeCheck, Copy, FolderOpen, Pencil, Search, Trash2, Undo2 } from 'lucide-react'
import { useCodePatternsStore } from '@renderer/store/codePatternsStore'
import { PATTERN_KIND_LABELS, parseTags, type CodePattern } from '@renderer/lib/codePatterns'
import './ClientPatternsTab.css'

const EMPTY: CodePattern[] = []

/** "Padrões" tab of the client page: the approved code the agent follows for this client. */
export function ClientPatternsTab({
  clientId,
  canManage,
  userId,
  authorName,
  formatDate
}: {
  clientId: string
  /** OWNER/ADMIN: may revoke anyone's approval and delete for good. */
  canManage: boolean
  userId: string | null
  authorName: (id: string | null | undefined) => string
  formatDate: (value: string) => string
}): JSX.Element {
  const patterns = useCodePatternsStore((state) => state.byClient[clientId] ?? EMPTY)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [editing, setEditing] = useState<CodePattern | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setState('loading')
    void useCodePatternsStore
      .getState()
      .load(clientId, true)
      .then(() => active && setState('ready'))
      .catch(() => active && setState('error'))
    return () => {
      active = false
    }
  }, [clientId])

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('pt-BR')
    if (!needle) return patterns
    return patterns.filter((pattern) =>
      [pattern.title, pattern.description, ...pattern.tags, PATTERN_KIND_LABELS[pattern.kind]].some((value) =>
        value?.toLocaleLowerCase('pt-BR').includes(needle)
      )
    )
  }, [patterns, query])

  async function run(action: () => Promise<void>, failure: string): Promise<void> {
    setMessage(null)
    try {
      await action()
    } catch (cause) {
      setMessage(`${failure} ${(cause as Error).message}`)
    }
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!editing) return
    const form = new FormData(event.currentTarget)
    const title = String(form.get('title') ?? '').trim()
    if (!title) return
    await run(
      () =>
        useCodePatternsStore
          .getState()
          .update(clientId, editing.id, title, String(form.get('description') ?? ''), parseTags(String(form.get('tags') ?? ''))),
      'Não foi possível salvar.'
    )
    setEditing(null)
  }

  return (
    <>
      <div className="clients-section-heading">
        <h3>
          Padrões aprovados <small className="clients-count">{patterns.length}</small>
        </h3>
      </div>
      <p className="patterns-intro">
        Código aprovado pela equipe (botão <strong>Aprovar</strong> nos blocos ABAP do chat). O agente segue esses
        padrões nas sessões deste cliente. Uma cópia fica no drive, na pasta “Padrões aprovados”.
      </p>
      <label className="patterns-search">
        <Search size={14} />
        <input
          aria-label="Buscar padrões"
          placeholder="Buscar por título, tag ou tipo…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {message && (
        <p className="clients-error" role="alert">
          {message}
        </p>
      )}
      <ul className="patterns-list">
        {visible.map((pattern) => {
          const mine = pattern.approvedBy === userId
          const open = openId === pattern.id
          return (
            <li key={pattern.id}>
              <div className="patterns-head">
                <BadgeCheck size={16} className="patterns-icon" />
                <div>
                  <strong>{pattern.title}</strong>
                  <small>
                    {PATTERN_KIND_LABELS[pattern.kind]} · aprovado por {mine ? 'você' : authorName(pattern.approvedBy)} ·{' '}
                    {formatDate(pattern.approvedAt)}
                  </small>
                </div>
                <div className="patterns-actions">
                  <button type="button" onClick={() => setOpenId(open ? null : pattern.id)}>
                    {open ? 'Ocultar' : 'Ver código'}
                  </button>
                  <button
                    type="button"
                    title="Copiar código"
                    aria-label="Copiar código"
                    onClick={() => void navigator.clipboard.writeText(pattern.content).catch(() => undefined)}
                  >
                    <Copy size={13} />
                  </button>
                  {(mine || canManage) && (
                    <>
                      <button type="button" title="Editar detalhes" aria-label="Editar detalhes" onClick={() => setEditing(pattern)}>
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        title="Revogar: o agente deixa de usar"
                        aria-label="Revogar aprovação"
                        onClick={() => {
                          if (window.confirm(`Revogar “${pattern.title}”? O agente deixa de seguir este padrão.`))
                            void run(() => useCodePatternsStore.getState().revoke(clientId, pattern.id), 'Não foi possível revogar.')
                        }}
                      >
                        <Undo2 size={13} />
                      </button>
                    </>
                  )}
                  {canManage && (
                    <button
                      type="button"
                      title="Excluir definitivamente"
                      aria-label="Excluir definitivamente"
                      onClick={() => {
                        if (window.confirm(`Excluir “${pattern.title}” definitivamente? O arquivo no drive não é apagado.`))
                          void run(() => useCodePatternsStore.getState().remove(clientId, pattern.id), 'Não foi possível excluir.')
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
              {pattern.description && <p className="patterns-description">{pattern.description}</p>}
              {pattern.tags.length > 0 && (
                <div className="patterns-tags">
                  {pattern.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              )}
              {pattern.fileId && (
                <small className="patterns-file">
                  <FolderOpen size={11} /> Cópia no drive
                </small>
              )}
              {open && <pre className="patterns-code">{pattern.content}</pre>}
            </li>
          )
        })}
      </ul>
      {visible.length === 0 && (
        <p className="patterns-empty">
          {state === 'loading'
            ? 'Carregando padrões…'
            : state === 'error'
              ? 'Biblioteca indisponível. Aplique a migration 046.'
              : query
                ? 'Nenhum padrão corresponde à busca.'
                : 'Nenhum padrão aprovado ainda. Aprove um bloco de código no chat para começar.'}
        </p>
      )}
      {editing && (
        <div className="task-modal-backdrop" onMouseDown={() => setEditing(null)}>
          <form className="patterns-edit" onMouseDown={(event) => event.stopPropagation()} onSubmit={saveEdit}>
            <h2>Editar padrão</h2>
            <label>
              Título
              <input name="title" required maxLength={120} defaultValue={editing.title} autoFocus />
            </label>
            <label>
              Quando usar
              <textarea name="description" rows={3} maxLength={500} defaultValue={editing.description ?? ''} />
            </label>
            <label>
              Tags, separadas por vírgula
              <input name="tags" defaultValue={editing.tags.join(', ')} />
            </label>
            <p>O código aprovado não muda. Para corrigir, revogue e aprove a nova versão.</p>
            <div>
              <button type="button" onClick={() => setEditing(null)}>
                Cancelar
              </button>
              <button type="submit">Salvar</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
