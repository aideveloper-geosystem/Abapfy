import { useEffect, useState } from 'react'
import {
  Bot,
  Building2,
  Download,
  Palette,
  Monitor,
  Server,
  SlidersHorizontal,
  Shield,
  X
} from 'lucide-react'
import { GeneralSection } from './GeneralSection'
import { AiSection } from './AiSection'
import { ParametrosSection } from './ParametrosSection'
import { UpdatesSection } from './UpdatesSection'
import { McpSection } from './McpSection'
import { SapContextSection } from './SapContextSection'
import { AdministrationSection } from './AdministrationSection'
import './SettingsModal.css'

type SectionId = 'general' | 'ai' | 'mcp' | 'sap-context' | 'parametros' | 'clients' | 'administration' | 'updates'

const SECTIONS: { id: SectionId; label: string; icon: typeof Palette }[] = [
  { id: 'general', label: 'Geral', icon: Palette },
  { id: 'ai', label: 'Inteligência Artificial', icon: Bot },
  { id: 'mcp', label: 'MCP', icon: Server },
  { id: 'sap-context', label: 'Contexto SAP', icon: Monitor },
  { id: 'parametros', label: 'Parâmetros', icon: SlidersHorizontal },
  { id: 'clients', label: 'Clientes', icon: Building2 },
  { id: 'administration', label: 'Administração', icon: Shield },
  { id: 'updates', label: 'Atualizações', icon: Download }
]

interface SettingsModalProps {
  open: boolean
  onClose: () => void
  onOpenClients: () => void
}

export function SettingsModal({
  open,
  onClose,
  onOpenClients
}: SettingsModalProps): JSX.Element | null {
  const [activeSection, setActiveSection] = useState<SectionId>('general')

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
        className={`settings-modal ${activeSection === 'ai' || activeSection === 'parametros' || activeSection === 'mcp' || activeSection === 'sap-context' || activeSection === 'administration' ? 'settings-modal-wide' : ''}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <nav className="settings-nav">
          <span className="settings-nav-title">Configurações</span>
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`settings-nav-item ${activeSection === id ? 'settings-nav-item-active' : ''}`}
              onClick={() => setActiveSection(id)}
            >
              <Icon size={15} strokeWidth={1.75} />
              {label}
            </button>
          ))}
        </nav>

        <div className="settings-content">
          <button type="button" className="settings-close" onClick={onClose} aria-label="Fechar">
            <X size={16} strokeWidth={1.75} />
          </button>

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
