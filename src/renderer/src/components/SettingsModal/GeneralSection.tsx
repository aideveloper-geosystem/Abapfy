import { Check } from 'lucide-react'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { THEMES } from '@renderer/lib/themes'
import './SettingsSections.css'

export function GeneralSection(): JSX.Element {
  const { theme, setTheme } = useSettingsStore((state) => ({
    theme: state.theme,
    setTheme: state.setTheme
  }))

  return (
    <div className="settings-section">
      <header className="settings-section-header">
        <h2>Geral</h2>
        <p>Personalize o tema e as cores padrão do Abapfy.</p>
      </header>
      <div className="settings-field-group">
        <span className="settings-field-label">Tema</span>
        <div className="theme-grid">
          {THEMES.map((item) => {
            const [accent, canvas, surface] = item.swatch
            const selected = item.id === theme
            return (
              <button key={item.id} type="button" className={`theme-card ${selected ? 'theme-card-selected' : ''}`} onClick={() => setTheme(item.id)}>
                <span className="theme-swatch" style={{ background: `linear-gradient(135deg, ${canvas} 0%, ${surface} 55%, ${accent} 100%)` }}>
                  {selected && <span className="theme-swatch-check"><Check size={14} strokeWidth={2.5} /></span>}
                </span>
                <span className="theme-card-name">{item.name}</span>
                <span className="theme-card-description">{item.description}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
