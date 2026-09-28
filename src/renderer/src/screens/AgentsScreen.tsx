import { useEffect, useMemo, useState } from 'react'
import { Bot, Download, Lock, Pencil, Power, Search, Trash2, Upload } from 'lucide-react'
import { ImportAgentModal } from '@renderer/components/ImportAgentModal'
import { AgentEditorModal } from '@renderer/components/AgentEditorModal'
import { useAgentsStore, type AgentItem } from '@renderer/store/agentsStore'
import { useAuthStore } from '@renderer/store/authStore'
import './SkillsScreen.css'
import './AgentsScreen.css'

function downloadMarkdown(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function AgentsScreen(): JSX.Element {
  const [search, setSearch] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState<AgentItem | null>(null)
  const [busyAgent, setBusyAgent] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const role = useAuthStore((state) => state.role)
  const canManage = role === 'MASTER' || role === 'ADMIN'

  const { agents, load, importAgent, removeCustomAgent, saveAgent, setAgentEnabled } = useAgentsStore((state) => ({
    agents: state.agents,
    load: state.load,
    importAgent: state.importAgent,
    removeCustomAgent: state.removeCustomAgent,
    saveAgent: state.saveAgent,
    setAgentEnabled: state.setAgentEnabled
  }))

  useEffect(() => {
    void load()
  }, [load])

  const filteredAgents = useMemo(() => {
    const query = search.trim().toLowerCase()
    const visible = canManage ? agents : agents.filter((agent) => agent.enabled)
    if (!query) return visible
    return visible.filter(
      (agent) =>
        agent.name.toLowerCase().includes(query) || agent.description.toLowerCase().includes(query)
    )
  }, [agents, search, canManage])

  async function toggleAgent(agent: AgentItem): Promise<void> {
    const key = `${agent.source}:${agent.id}`
    setBusyAgent(key)
    setActionError(null)
    try {
      await setAgentEnabled(agent, !agent.enabled)
    } catch (cause) {
      setActionError((cause as Error).message)
    } finally {
      setBusyAgent(null)
    }
  }

  return (
    <div className="skills-screen">
      <div className="skills-header">
        <div>
          <h1 className="skills-title">Agentes</h1>
          <p className="skills-subtitle">
            Catálogo do harness — o roteador (Claude Haiku) ativa o agente ideal pra cada conversa.
            Agentes padrão são compartilhados. MASTER e ADMIN podem editar e ativar ou desativar agentes.
          </p>
        </div>
        <button type="button" className="skills-import-btn" onClick={() => setImportOpen(true)}>
          <Upload size={14} strokeWidth={1.75} />
          Importar agente
        </button>
      </div>

      <div className="skills-toolbar">
        <div className="skills-search">
          <Search size={14} strokeWidth={1.75} />
          <input
            type="text"
            placeholder="Buscar agentes…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>
      {actionError && <p className="agent-management-error" role="alert">{actionError}</p>}

      <div className="skills-grid">
        {filteredAgents.length === 0 ? (
          <div className="skills-empty">
            <Bot size={28} strokeWidth={1.25} />
            <p>Nenhum agente encontrado.</p>
          </div>
        ) : (
          filteredAgents.map((agent) => (
            <div key={`${agent.source}-${agent.id}`} className={`skill-card agent-card ${agent.enabled ? '' : 'agent-card-disabled'}`}>
              <div className="skill-card-header">
                <div className="skill-card-title-row">
                  <span className="skill-card-name" title={agent.name}>
                    {agent.name}
                  </span>
                  {agent.source === 'default' ? (
                    <span className="agent-card-badge agent-card-badge-default">
                      <Lock size={10} strokeWidth={2} />
                      Padrão
                    </span>
                  ) : (
                    <span className="skill-card-custom-badge">Importado</span>
                  )}
                  {!agent.enabled && <span className="agent-card-badge agent-card-badge-disabled">Desativado</span>}
                </div>
              </div>

              <p className="skill-card-summary" title={agent.description}>
                {agent.description}
              </p>

              <div className="agent-card-actions">
                <button
                  type="button"
                  className="agent-card-action"
                  onClick={() => downloadMarkdown(`${agent.id}.md`, agent.content)}
                >
                  <Download size={12} strokeWidth={1.75} />
                  Baixar .md
                </button>
                {canManage && <>
                  <button type="button" className="agent-card-action" onClick={() => setEditingAgent(agent)}><Pencil size={12} strokeWidth={1.75} /> Editar</button>
                  <button type="button" className="agent-card-action" disabled={busyAgent === `${agent.source}:${agent.id}`} onClick={() => void toggleAgent(agent)} aria-label={`${agent.enabled ? 'Desativar' : 'Ativar'} ${agent.name}`}><Power size={12} strokeWidth={1.75} /> {agent.enabled ? 'Desativar' : 'Ativar'}</button>
                </>}
                {agent.source === 'custom' && (
                  <button
                    type="button"
                    className="agent-card-action agent-card-action-danger"
                    onClick={() => removeCustomAgent(agent.id)}
                  >
                    <Trash2 size={12} strokeWidth={1.75} />
                    Remover
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <ImportAgentModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={importAgent}
      />
      {editingAgent && <AgentEditorModal key={`${editingAgent.source}:${editingAgent.id}`} agent={editingAgent} onClose={() => setEditingAgent(null)} onSave={(input) => saveAgent(editingAgent, input)} />}
    </div>
  )
}
