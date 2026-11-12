import { FormEvent, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, X } from 'lucide-react'
import type { Client, CreateClientOptions } from '@renderer/store/clientsStore'
import './NewClientModal.css'

/** Modules every new client receives from the database (see seed_client_modules in migration 021). */
export const DEFAULT_CLIENT_MODULES = ['Programas', 'EFs', 'DTECs']

interface NewClientModalProps {
  open: boolean
  clients: Client[]
  onClose: () => void
  onCreate: (name: string, description: string, options: CreateClientOptions) => Promise<void>
}

/** Short flow: name, modules (default model plus extras) and, optionally, copy the workbook of another client. */
export function NewClientModal({ open, clients, onClose, onCreate }: NewClientModalProps): JSX.Element | null {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [extra, setExtra] = useState('')
  const [copyFrom, setCopyFrom] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null
  const withWorkbook = clients.filter((client) => client.workbookMd?.trim() && !client.archivedAt)
  const extraModules = extra.split(',').map((item) => item.trim()).filter(Boolean)

  function close(): void {
    if (busy) return
    setName('')
    setDescription('')
    setExtra('')
    setCopyFrom(null)
    setError(null)
    onClose()
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await onCreate(name, description, { extraModules, workbookFrom: copyFrom })
      setBusy(false)
      setName('')
      setDescription('')
      setExtra('')
      setCopyFrom(null)
      onClose()
    } catch (cause) {
      setError((cause as Error).message)
      setBusy(false)
    }
  }

  return createPortal(
    <div className="new-client-overlay" role="presentation" onMouseDown={close}>
      <form className="new-client" role="dialog" aria-modal="true" aria-label="Novo cliente" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => void submit(event)}>
        <header>
          <h2>Novo cliente</h2>
          <button type="button" aria-label="Fechar" onClick={close}>
            <X size={16} />
          </button>
        </header>
        {error && <p className="new-client-error" role="alert">{error}</p>}
        <label>
          Nome
          <input autoFocus required maxLength={120} disabled={busy} value={name} placeholder="Ex.: Supergasbras" onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Descrição <small>(opcional)</small>
          <input maxLength={240} disabled={busy} value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <div className="new-client-group">
          <span>Módulos</span>
          <div className="new-client-modules">
            {DEFAULT_CLIENT_MODULES.map((module) => (
              <em key={module}><Check size={12} /> {module}</em>
            ))}
            {extraModules.map((module) => (
              <em key={module} className="new-client-extra"><Check size={12} /> {module}</em>
            ))}
          </div>
          <input disabled={busy} value={extra} placeholder="Outros módulos, separados por vírgula (opcional)" aria-label="Outros módulos" onChange={(event) => setExtra(event.target.value)} />
        </div>
        {withWorkbook.length > 0 && (
          <div className="new-client-group">
            <span>Copiar workbook de <small>(opcional)</small></span>
            <div className="new-client-copy" role="radiogroup" aria-label="Copiar workbook de outro cliente">
              <button type="button" role="radio" aria-checked={copyFrom === null} onClick={() => setCopyFrom(null)}>Não copiar</button>
              {withWorkbook.map((client) => (
                <button key={client.id} type="button" role="radio" aria-checked={copyFrom === client.id} onClick={() => setCopyFrom(client.id)}>
                  {client.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <footer>
          <button type="button" disabled={busy} onClick={close}>Cancelar</button>
          <button type="submit" className="new-client-primary" disabled={busy || !name.trim()}>
            {busy ? 'Criando…' : 'Criar cliente'}
          </button>
        </footer>
      </form>
    </div>,
    document.body
  )
}
