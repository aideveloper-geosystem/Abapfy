import { FormEvent, useState } from 'react'
import { X } from 'lucide-react'
import { useAgentsStore } from '@renderer/store/agentsStore'
import type { AgentSource } from '@renderer/store/agentsStore'
import { useClientsStore } from '@renderer/store/clientsStore'
import './ImportSkillModal.css'
import './NewProjectModal.css'

interface NewProjectModalProps {
  open: boolean
  onClose: () => void
  onCreate: (input: {
    name: string
    clientId: string
    description: string
    context: string
    defaultAgentSource: AgentSource | null
    defaultAgentId: string | null
  }) => Promise<void>
}

export function NewProjectModal({
  open,
  onClose,
  onCreate
}: NewProjectModalProps): JSX.Element | null {
  const agents = useAgentsStore((state) => state.agents)
  const clients = useClientsStore((state) => state.clients)
  const [clientId, setClientId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [context, setContext] = useState('')
  const [agentKey, setAgentKey] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!open) return null

  function resetAndClose(): void {
    setName('')
    setDescription('')
    setContext('')
    setAgentKey('')
    onClose()
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!name.trim() || !clientId || submitting) return

    const [source, id] = agentKey ? (agentKey.split('::') as [AgentSource, string]) : [null, null]

    setSubmitting(true)
    await onCreate({
      name,
      clientId,
      description,
      context,
      defaultAgentSource: source,
      defaultAgentId: id
    })
    setSubmitting(false)
    resetAndClose()
  }

  return (
    <div className="import-skill-overlay" onMouseDown={resetAndClose}>
      <div className="import-skill-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="import-skill-header">
          <h2>Novo projeto</h2>
          <button
            type="button"
            className="import-skill-close"
            onClick={resetAndClose}
            aria-label="Fechar"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
        <p className="import-skill-subtitle">
          Agrupa chats sob um contexto comum. Definindo um agente padrão, os chats desse projeto
          pulam o roteador e já começam com esse agente ativo.
        </p>

        <form className="import-skill-form" onSubmit={handleSubmit}>
          <div className="import-skill-field"><label htmlFor="project-client">Cliente</label><select id="project-client" className="new-project-select" value={clientId} required onChange={(event) => setClientId(event.target.value)}><option value="">Selecione um cliente</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></div>
          <div className="import-skill-field">
            <label htmlFor="project-name">Nome</label>
            <input
              id="project-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex: Migração MM S/4HANA"
              required
            />
          </div>

          <div className="import-skill-field">
            <label htmlFor="project-description">Descrição</label>
            <textarea
              id="project-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Do que se trata esse projeto"
              rows={2}
            />
          </div>

          <div className="import-skill-field">
            <label htmlFor="project-agent">Agente padrão (opcional)</label>
            <select
              id="project-agent"
              className="new-project-select"
              value={agentKey}
              onChange={(event) => setAgentKey(event.target.value)}
            >
              <option value="">Nenhum — usar roteador automático</option>
              {agents.filter((agent) => agent.enabled).map((agent) => (
                <option key={`${agent.source}-${agent.id}`} value={`${agent.source}::${agent.id}`}>
                  {agent.name} {agent.source === 'custom' ? '(importado)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="import-skill-field">
            <label htmlFor="project-context">Contexto</label>
            <textarea
              id="project-context"
              value={context}
              onChange={(event) => setContext(event.target.value)}
              placeholder="Informações fixas que todo chat desse projeto deve conhecer (sistema, versão SAP, convenções...)"
              rows={4}
            />
          </div>

          <button
            type="submit"
            className="import-skill-submit"
            disabled={!name.trim() || !clientId || submitting}
          >
            {submitting ? 'Criando…' : 'Criar projeto'}
          </button>
        </form>
      </div>
    </div>
  )
}
