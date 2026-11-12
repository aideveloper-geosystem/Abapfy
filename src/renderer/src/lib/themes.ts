export interface ThemeDefinition {
  id: string
  name: string
  description: string
  mode: 'light' | 'dark'
  swatch: [accent: string, canvas: string, surface: string]
  vars: Record<string, string>
}

const radii = {
  '--radius-xs': '5px',
  '--radius-sm': '7px',
  '--radius-md': '10px',
  '--radius-lg': '14px',
  '--radius-xl': '18px',
  '--radius-xxl': '24px'
}

/** macOS-style dark: layered graphite surfaces, system blue accent, soft translucent hover states. */
const abapfyDark = {
  '--color-primary': '#0a84ff',
  '--color-primary-hover': '#409cff',
  '--color-primary-focus': '#64d2ff',
  '--color-on-primary': '#ffffff',
  '--color-ink': '#f5f5f7',
  '--color-ink-muted': '#c7c7cc',
  '--color-ink-subtle': '#98989d',
  '--color-ink-tertiary': '#8e8e93',
  '--color-canvas': '#1c1c1e',
  '--color-surface-1': '#242426',
  '--color-surface-2': '#2c2c2e',
  '--color-surface-3': '#232a34',
  '--color-surface-4': '#3a3a3c',
  '--color-hairline': '#38383a',
  '--color-hairline-strong': '#545458',
  '--color-hairline-tertiary': '#6e6e73',
  '--color-inverse-canvas': '#f5f5f7',
  '--color-inverse-surface-1': '#e5e5ea',
  '--color-inverse-surface-2': '#d1d1d6',
  '--color-inverse-ink': '#1c1c1e',
  '--color-brand-secure': '#bf5af2',
  '--color-semantic-success': '#32d74b',
  '--color-semantic-danger': '#ff6961',
  '--color-semantic-warning': '#ffb340',
  '--color-semantic-info': '#64d2ff',
  '--color-semantic-overlay': 'rgba(0, 0, 0, 0.55)',
  '--color-sidebar': '#18181a',
  '--color-sidebar-ink': '#e5e5ea',
  '--color-panel': '#1f1f21',
  '--color-hover': 'rgba(255, 255, 255, 0.06)',
  '--color-selected': 'rgba(255, 255, 255, 0.1)',
  '--color-accent-soft': 'rgba(10, 132, 255, 0.16)',
  '--shadow-card': '0 1px 2px rgba(0, 0, 0, 0.35)',
  '--shadow-popover': '0 12px 32px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.06)',
  '--shadow-modal': '0 28px 70px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.06)',
  ...radii
}

/** macOS-style light: soft gray canvas, white cards, system blue accent. */
const abapfyLight = {
  '--color-primary': '#007aff',
  '--color-primary-hover': '#0a64d6',
  '--color-primary-focus': '#007aff',
  '--color-on-primary': '#ffffff',
  '--color-ink': '#1d1d1f',
  '--color-ink-muted': '#48484a',
  '--color-ink-subtle': '#636366',
  '--color-ink-tertiary': '#8e8e93',
  '--color-canvas': '#f5f5f7',
  '--color-surface-1': '#ffffff',
  '--color-surface-2': '#f2f2f7',
  '--color-surface-3': '#e8f1ff',
  '--color-surface-4': '#e5e5ea',
  '--color-hairline': '#e0e0e5',
  '--color-hairline-strong': '#c7c7cc',
  '--color-hairline-tertiary': '#aeaeb2',
  '--color-inverse-canvas': '#1c1c1e',
  '--color-inverse-surface-1': '#2c2c2e',
  '--color-inverse-surface-2': '#3a3a3c',
  '--color-inverse-ink': '#f5f5f7',
  '--color-brand-secure': '#8944ab',
  '--color-semantic-success': '#1f8a3b',
  '--color-semantic-danger': '#d70015',
  '--color-semantic-warning': '#b25000',
  '--color-semantic-info': '#0066cc',
  '--color-semantic-overlay': 'rgba(0, 0, 0, 0.32)',
  '--color-sidebar': '#ececf0',
  '--color-sidebar-ink': '#1d1d1f',
  '--color-panel': '#fafafc',
  '--color-hover': 'rgba(0, 0, 0, 0.05)',
  '--color-selected': 'rgba(0, 0, 0, 0.08)',
  '--color-accent-soft': 'rgba(0, 122, 255, 0.12)',
  '--shadow-card': '0 1px 2px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.03)',
  '--shadow-popover': '0 12px 32px rgba(0, 0, 0, 0.16), 0 0 0 1px rgba(0, 0, 0, 0.05)',
  '--shadow-modal': '0 28px 70px rgba(0, 0, 0, 0.24), 0 0 0 1px rgba(0, 0, 0, 0.05)',
  ...radii
}

export const THEMES: ThemeDefinition[] = [
  {
    id: 'abapfy-dark',
    name: 'Escuro',
    description: 'Grafite em camadas com azul de sistema. Tema padrão.',
    mode: 'dark',
    swatch: ['#0a84ff', '#1c1c1e', '#242426'],
    vars: abapfyDark
  },
  {
    id: 'abapfy-light',
    name: 'Claro',
    description: 'Cinza suave com cartões brancos e o mesmo azul de sistema.',
    mode: 'light',
    swatch: ['#007aff', '#f5f5f7', '#ffffff'],
    vars: abapfyLight
  }
]

export const DEFAULT_THEME_ID = 'abapfy-dark'

/** Theme ids saved by earlier versions (SAP Horizon / Quartz) map to the closest new theme by mode. */
const LEGACY_LIGHT = new Set(['sap-horizon-light', 'sap-quartz-light', 'sap-horizon-hcw'])
const LEGACY_DARK = new Set(['sap-horizon-dark', 'sap-quartz-dark', 'sap-horizon-hcb'])

export function getTheme(id: string | null | undefined): ThemeDefinition {
  const found = THEMES.find((theme) => theme.id === id)
  if (found) return found
  if (id && LEGACY_LIGHT.has(id)) return THEMES[1]
  if (id && LEGACY_DARK.has(id)) return THEMES[0]
  return THEMES[0]
}

export function applyTheme(id: string | null | undefined): void {
  const theme = getTheme(id)
  const root = document.documentElement
  root.dataset.theme = theme.id
  root.dataset.mode = theme.mode
  root.style.colorScheme = theme.mode
  Object.entries(theme.vars).forEach(([key, value]) => root.style.setProperty(key, value))
}
