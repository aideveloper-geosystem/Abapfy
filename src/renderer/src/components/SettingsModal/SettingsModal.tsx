import { useEffect, useState } from 'react'
import {
  Bot,
  Building2,
  Download,
  Palette,
  Server,
  SlidersHorizontal,
  Database,
  Shield,
  UserRound,
  Search,
  Settings2,
  Workflow,
  X
} from 'lucide-react'
import { GeneralSection } from './GeneralSection'
import { ProfileSection } from './ProfileSection'
import { AiSection } from './AiSection'
import { ParametrosSection } from './ParametrosSection'
import { UpdatesSection } from './UpdatesSection'
import { IntegrationsSection } from './IntegrationsSection'
import { AdministrationSection } from './AdministrationSection'
import { FeaturesSection } from './FeaturesSection'
import { FlowPreferencesSection } from './FlowPreferencesSection'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { CatalogAdministration } from './CatalogAdministration'
import { useAuthStore } from '@renderer/store/authStore'
import './SettingsModal.css'

type SectionId =
  | 'overview'
  | 'flows'
  | 'profile'
  | 'general'
  | 'ai'
  | 'mcp'
  | 'parametros'
  | 'clients'
  | 'administration'
  | 'updates'
  | 'features'
  | 'embeddings'

const SECTIONS: { id: SectionId; label: string; icon: typeof Palette; group: string }[] = [
  { id: 'overview', label: 'Geral', icon: Settings2, group: 'Pessoais' },
  { id: 'profile', label: 'Perfil', icon: UserRound, group: 'Pessoais' },
  { id: 'general', label: 'Aparência', icon: Palette, group: 'Pessoais' },
  { id: 'ai', label: 'Modelos e provedores', icon: Bot, group: 'Inteligência artificial' },
  { id: 'features', label: 'Contexto e compactação', icon: SlidersHorizontal, group: 'Inteligência artificial' },
  { id: 'mcp', label: 'SAP ADT e MCP', icon: Server, group: 'Integrações' },
  { id: 'parametros', label: 'Parâmetros', icon: SlidersHorizontal, group: 'Workspace' },
  { id: 'clients', label: 'Clientes', icon: Building2, group: 'Workspace' },
  { id: 'administration', label: 'Administração', icon: Shield, group: 'Workspace' },
  { id: 'flows', label: 'Preferências de fluxos', icon: Workflow, group: 'Avançado' },
  { id: 'embeddings', label: 'Embeddings', icon: Database, group: 'Avançado' },
  { id: 'updates', label: 'Atualizações', icon: Download, group: 'Sistema' }
]

interface SettingsModalProps {
  open: boolean
  initialSection?: 'mcp' | 'flows'
  onClose: () => void
  onOpenClients: () => void
  onOpenFlows: () => void
}

export function SettingsModal({
  open,
  initialSection,
  onClose,
  onOpenClients,
  onOpenFlows
}: SettingsModalProps): JSX.Element | null {
  const [activeSection, setActiveSection] = useState<SectionId>('overview')
  const defaultModel = useSettingsStore(state => state.defaultModel)
  const role = useAuthStore((state) => state.role)
  const refreshRole = useAuthStore((state) => state.refreshRole)
  const canManageCatalog = role === 'MASTER' || role === 'ADMIN'
  const [query, setQuery] = useState('')
  useEffect(() => { if (open && initialSection) { setActiveSection(initialSection); setQuery('') } }, [open, initialSection])
  const visibleSections = SECTIONS.filter(
    (section) =>
      (section.id !== 'embeddings' || canManageCatalog) &&
      `${section.label} ${section.group} ${section.id === 'flows' ? 'subagents orquestrador fluxo equipe automação avançado hooks Opus Sonnet Haiku' : ''} ${section.id === 'features' ? 'features histórico tokens' : ''} ${section.id === 'ai' ? 'inteligência artificial API chaves comportamento ferramentas' : ''} ${section.id === 'mcp' ? 'SAP ADT MCP conexões agentes integrações' : ''} ${section.id === 'embeddings' ? 'catálogo SAP BAdI BAPI indexação' : ''}`
        .toLocaleLowerCase('pt-BR')
        .includes(query.trim().toLocaleLowerCase('pt-BR'))
  )

  useEffect(() => {
    if (open) void refreshRole()
  }, [open, refreshRole])

  useEffect(() => {
    if (!canManageCatalog && activeSection === 'embeddings') setActiveSection('administration')
  }, [canManageCatalog, activeSection])

  useEffect(() => {
    if (!open) return
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="settings-overlay" onMouseDown={onClose}>
      <div
        className="settings-modal settings-modal-wide"
        role="dialog"
        aria-modal="true"
        aria-label="Configurações"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <nav className="settings-nav" aria-label="Seções das configurações">
          <span className="settings-nav-title">Configurações</span>
          <label className="settings-nav-search">
            <Search size={15} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Pesquisar"
              aria-label="Pesquisar configurações"
            />
          </label>
          <div className="settings-nav-list">
            {visibleSections.map(({ id, label, icon: Icon, group }, index) => (
              <div key={id}>
                {(index === 0 || visibleSections[index - 1].group !== group) && (
                  <span className="settings-nav-group">{group}</span>
                )}
                <button
                  type="button"
                  className={`settings-nav-item ${activeSection === id ? 'settings-nav-item-active' : ''}`}
                  aria-current={activeSection === id ? 'page' : undefined}
                  onClick={() => setActiveSection(id)}
                >
                  <Icon size={16} strokeWidth={1.75} />
                  {label}
                </button>
              </div>
            ))}
            {visibleSections.length === 0 && (
              <span className="settings-nav-empty">Nenhuma configuração encontrada.</span>
            )}
          </div>
        </nav>
          <button type="button" className="settings-close" onClick={onClose} aria-label="Fechar">
            <X size={17} strokeWidth={1.75} />
          </button>
        <div className="settings-content" key={activeSection}>
          {activeSection === 'overview' && <div className="settings-section settings-overview">
            <header className="settings-section-header"><h2>Geral</h2><p>Seu ambiente de trabalho no Abapfy.</p></header>
            <h3>Inteligência artificial</h3>
            <div className="settings-overview-card">
              <div><span><strong>Modelo padrão</strong><small>{defaultModel ?? 'Nenhum modelo selecionado'}</small></span><button className="settings-action" type="button" onClick={() => setActiveSection('ai')}>Configurar</button></div>
              <div><span><strong>Contexto das conversas</strong><small>Histórico, compactação e limites de contexto.</small></span><button className="settings-action" type="button" onClick={() => setActiveSection('features')}>Gerenciar</button></div>
            </div>
            <h3>Conexões e personalização</h3>
            <div className="settings-overview-card">
              <div><span><strong>Ambientes SAP e servidores MCP</strong><small>Conexões, ferramentas e permissões por agente.</small></span><button className="settings-action" type="button" onClick={() => setActiveSection('mcp')}>Gerenciar</button></div>
              <div><span><strong>Aparência</strong><small>Temas claros e escuros para o seu ambiente.</small></span><button className="settings-action" type="button" onClick={() => setActiveSection('general')}>Personalizar</button></div>
            </div>
            <h3>Recursos avançados</h3>
            <div className="settings-overview-card"><div><span><strong>Fluxos de agentes</strong><small>Disponibilidade do recurso no chat. Monte suas equipes e etapas na área Fluxos.</small></span><button className="settings-action" type="button" onClick={() => setActiveSection('flows')}>Configurar</button></div></div>
          </div>}
          {activeSection === 'flows' && <FlowPreferencesSection onManage={() => { onClose(); onOpenFlows() }} />}
          {activeSection === 'profile' && <ProfileSection />}
          {activeSection === 'general' && <GeneralSection />}
          {activeSection === 'ai' && <AiSection />}
          {activeSection === 'features' && <FeaturesSection />}
          {activeSection === 'embeddings' && canManageCatalog && (
            <div className="settings-section">
              <header className="settings-section-header">
                <h2>Embeddings · Catálogo SAP</h2>
                <p>Administração da base compartilhada distribuída nas atualizações.</p>
              </header>
              <CatalogAdministration />
            </div>
          )}
          {activeSection === 'mcp' && <IntegrationsSection />}
          {activeSection === 'parametros' && <ParametrosSection />}
          {activeSection === 'clients' && (
            <div className="settings-section">
              <header className="settings-section-header">
                <h2>Clientes</h2>
                <p>Configure clientes, módulos e workbooks na área compartilhada.</p>
              </header>
              <button
                type="button"
                className="settings-action"
                onClick={() => {
                  onClose()
                  onOpenClients()
                }}
              >
                Abrir gerenciamento de clientes
              </button>
            </div>
          )}
          {activeSection === 'administration' && (
            <AdministrationSection
              onOpenClients={() => {
                onClose()
                onOpenClients()
              }}
            />
          )}
          {activeSection === 'updates' && <UpdatesSection />}
        </div>
      </div>
    </div>
  )
}
