import { useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { AgentItem } from '@renderer/store/agentsStore'
import './AgentEditorModal.css'

interface Props {
  agent: AgentItem
  onClose: () => void
  onSave: (input: { name: string; description: string; content: string }) => Promise<void>
}

export function AgentEditorModal({ agent, onClose, onSave }: Props): JSX.Element {
  const [name, setName] = useState(agent.name)
  const [description, setDescription] = useState(agent.description)
  const [content, setContent] = useState(agent.content)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (busy || !name.trim() || !content.trim()) return
    setBusy(true)
    setError(null)
    try {
      await onSave({ name, description, content })
      onClose()
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return createPortal(<div className="agent-editor-backdrop" onMouseDown={() => { if (!busy) onClose() }}>
    <div className="agent-editor-modal" role="dialog" aria-modal="true" aria-label={`Editar ${agent.name}`} onMouseDown={(event) => event.stopPropagation()}>
      <div className="agent-editor-header"><div><h2>Editar agente</h2><p>{agent.source === 'default' ? 'Agente padrão compartilhado com todos os usuários.' : 'Agente importado nesta conta.'}</p></div><button type="button" onClick={onClose} disabled={busy} aria-label="Fechar"><X size={18} /></button></div>
      <form onSubmit={(event) => void submit(event)}>
        <label>Nome<input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required /></label>
        <label>Descrição<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} /></label>
        <label>Instruções do agente<textarea className="agent-editor-content" value={content} onChange={(event) => setContent(event.target.value)} required spellCheck={false} /></label>
        {error && <p className="agent-editor-error" role="alert">{error}</p>}
        <div className="agent-editor-actions"><button type="button" onClick={onClose} disabled={busy}>Cancelar</button><button type="submit" disabled={busy || !name.trim() || !content.trim()}>{busy ? 'Salvando…' : 'Salvar alterações'}</button></div>
      </form>
    </div>
  </div>, document.body)
}
