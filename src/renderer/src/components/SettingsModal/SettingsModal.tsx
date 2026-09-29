import { useEffect, useState } from 'react'
import { Bot, Building2, Download, Palette, Monitor, Server, SlidersHorizontal, Shield, UserRound, Search, X } from 'lucide-react'
import { GeneralSection } from './GeneralSection'
import { ProfileSection } from './ProfileSection'
import { AiSection } from './AiSection'
import { ParametrosSection } from './ParametrosSection'
import { UpdatesSection } from './UpdatesSection'
import { McpSection } from './McpSection'
import { SapContextSection } from './SapContextSection'
import { AdministrationSection } from './AdministrationSection'
import './SettingsModal.css'

type SectionId = 'profile' | 'general' | 'ai' | 'mcp' | 'sap-context' | 'parametros' | 'clients' | 'administration' | 'updates'

const SECTIONS: { id: SectionId; label: string; icon: typeof Palette; group: string }[] = [
  { id: 'profile', label: 'Perfil', icon: UserRound, group: 'Pessoal' },
  { id: 'general', label: 'Aparência', icon: Palette, group: 'Pessoal' },
  { id: 'ai', label: 'Inteligência Artificial', icon: Bot, group: 'Trabalho' },
  { id: 'mcp', label: 'MCP', icon: Server, group: 'Trabalho' },
  { id: 'sap-context', label: 'Contexto SAP', icon: Monitor, group: 'Trabalho' },
  { id: 'parametros', label: 'Parâmetros', icon: SlidersHorizontal, group: 'Trabalho' },
  { id: 'clients', label: 'Clientes', icon: Building2, group: 'Workspace' },
  { id: 'administration', label: 'Administração', icon: Shield, group: 'Workspace' },
  { id: 'updates', label: 'Atualizações', icon: Download, group: 'Sistema' }
]

interface SettingsModalProps {
  open: boolean
  onClose: () => void
  onOpenClients: () => void
}

export function SettingsModal({ open, onClose, onOpenClients }: SettingsModalProps): JSX.Element | null {
  const [activeSection, setActiveSection] = useState<SectionId>('profile')
  const [query, setQuery] = useState('')
  const visibleSections = SECTIONS.filter((section) =>
    `${section.label} ${section.group}`.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR'))
  )

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
      <div className="settings-modal settings-modal-wide" role="dialog" aria-modal="true" aria-label="Configurações" onMouseDown={(event) => event.stopPropagation()}>
        <nav className="settings-nav" aria-label="Seções das configurações">
          <span className="settings-nav-title">Configurações</span>
          <label className="settings-nav-search">
            <Search size={15} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar" aria-label="Pesquisar configurações" />
          </label>
          <div className="settings-nav-list">
            {visibleSections.map(({ id, label, icon: Icon, group }, index) => (
              <div key={id}>
                {(index === 0 || visibleSections[index - 1].group !== group) && <span className="settings-nav-group">{group}</span>}
                <button type="button" className={`settings-nav-item ${activeSection === id ? 'settings-nav-item-active' : ''}`} aria-current={activeSection === id ? 'page' : undefined} onClick={() => setActiveSection(id)}>
                  <Icon size={16} strokeWidth={1.75} />
                  {label}
                </button>
              </div>
            ))}
            {visibleSections.length === 0 && <span className="settings-nav-empty">Nenhuma configuração encontrada.</span>}
          </div>
        </nav>
        <div className="settings-content">
          <button type="button" className="settings-close" onClick={onClose} aria-label="Fechar">
            <X size={17} strokeWidth={1.75} />
          </button>
          {activeSection === 'profile' && <ProfileSection />}
          {activeSection === 'general' && <GeneralSection />}
          {activeSection === 'ai' && <AiSection />}
          {activeSection === 'mcp' && <McpSection />}
          {activeSection === 'sap-context' && <SapContextSection />}
          {activeSection === 'parametros' && <ParametrosSection />}
          {activeSection === 'clients' && (
            <div className="settings-section">
              <header className="settings-section-header">
                <h2>Clientes</h2>
                <p>Configure clientes, módulos e workbooks na área compartilhada.</p>
              </header>
              <button type="button" className="settings-action" onClick={() => { onClose(); onOpenClients() }}>
                Abrir gerenciamento de clientes
              </button>
            </div>
          )}
          {activeSection === 'administration' && <AdministrationSection onOpenClients={() => { onClose(); onOpenClients() }} />}
          {activeSection === 'updates' && <UpdatesSection />}
        </div>
      </div>
    </div>
  )
}
