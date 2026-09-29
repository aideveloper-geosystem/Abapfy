import { Check, Moon, Sun } from 'lucide-react'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { THEMES } from '@renderer/lib/themes'
import './SettingsSections.css'
import './AppearanceSection.css'

export function GeneralSection(): JSX.Element {
  const { theme, setTheme } = useSettingsStore((state) => ({ theme: state.theme, setTheme: state.setTheme }))
  const current = THEMES.find((item) => item.id === theme) ?? THEMES[0]

  return (
    <div className="settings-section settings-appearance">
      <header className="settings-section-header">
        <span className="settings-appearance-eyebrow">Personalização</span>
        <h2>Aparência</h2>
        <p>Escolha como o Abapfy aparece no seu ambiente de trabalho. A preferência é salva na sua conta.</p>
      </header>
      <div className="settings-appearance-current">
        <span className="settings-appearance-current-icon">{current.mode === 'dark' ? <Moon size={18} /> : <Sun size={18} />}</span>
        <div><strong>Tema atual</strong><span>{current.name}</span></div>
        <span className="settings-appearance-current-pill">{current.mode === 'dark' ? 'Escuro' : 'Claro'}</span>
      </div>
      <div className="settings-appearance-heading"><h3>Estilo visual</h3><span>Selecione uma opção para aplicar imediatamente</span></div>
      <div className="settings-appearance-theme-list">
        {(['light', 'dark'] as const).map((mode) => (
          <section className="settings-appearance-mode" key={mode}>
            <div className="settings-appearance-mode-heading">{mode === 'light' ? <Sun size={16} /> : <Moon size={16} />}<h4>{mode === 'light' ? 'Temas claros' : 'Temas escuros'}</h4></div>
            <div className="settings-appearance-grid">
              {THEMES.filter((item) => item.mode === mode).map((item) => {
                const [accent, canvas, surface] = item.swatch
                const selected = item.id === theme
                return <button key={item.id} type="button" className={`settings-appearance-card ${selected ? 'settings-appearance-card-selected' : ''}`} aria-pressed={selected} onClick={() => void setTheme(item.id)}>
                  <span className="settings-appearance-preview" style={{ background: canvas, borderColor: accent }}>
                    <span className="settings-appearance-preview-sidebar" style={{ background: surface }}><i style={{ background: accent }} /><i /><i /></span>
                    <span className="settings-appearance-preview-main" style={{ background: surface }}><i /><i /><i style={{ background: accent }} /></span>
                  </span>
                  <span className="settings-appearance-card-info"><strong>{item.name}</strong>{selected && <Check size={15} />}</span>
                  <span className="settings-appearance-card-description">{item.description}</span>
                </button>
              })}
            </div>
          </section>
        ))}
      </div>
      <p className="settings-appearance-hint">Os temas de alto contraste oferecem bordas e textos reforçados para melhorar a leitura.</p>
    </div>
  )
}
