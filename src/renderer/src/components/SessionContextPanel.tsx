import { Bot, Building2, FileText, Plug, Sparkles, X } from 'lucide-react'

interface SessionContextPanelProps {
  agentName: string | null
  files: string[]
  skills: string[]
  mcps: string[]
  environment: string
  onClose: () => void
}

function ContextSection({
  icon: Icon,
  title,
  items,
  empty
}: {
  icon: typeof Bot
  title: string
  items: string[]
  empty: string
}): JSX.Element {
  return (
    <section className="session-context-section">
      <div className="session-context-section-title">
        <Icon size={13} strokeWidth={1.75} />
        {title}
        <span>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p>{empty}</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item} title={item} className="ai-context-resource">
              <Icon size={12} /> <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function SessionContextPanel({
  agentName,
  files,
  skills,
  mcps,
  environment,
  onClose
}: SessionContextPanelProps): JSX.Element {
  return (
    <div className="session-context-panel">
      <header>
        <div>
          <strong>Contexto da sessão</strong>
          <span>Recursos disponíveis neste chat</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar contexto">
          <X size={15} />
        </button>
      </header>
      <ContextSection
        icon={Bot}
        title="Agente"
        items={agentName ? [agentName] : []}
        empty="Seleção automática pendente."
      />
      <ContextSection
        icon={Building2}
        title="Cliente e módulo"
        items={[environment]}
        empty="Não definido"
      />
      <ContextSection
        icon={FileText}
        title="Arquivos"
        items={files}
        empty="Nenhum arquivo anexado."
      />
      <ContextSection
        icon={Sparkles}
        title="Skills"
        items={skills}
        empty="Nenhuma skill carregada."
      />
      <ContextSection
        icon={Plug}
        title="MCPs"
        items={mcps}
        empty="Nenhum MCP vinculado ao agente."
      />
    </div>
  )
}
