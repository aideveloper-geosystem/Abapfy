export type SapControlMode = 'off' | 'basic' | 'automatic' | 'full'

export const SAP_CONTROL_KEYS = ['TAB', 'ENTER', 'ESC', 'BACKSPACE', 'LEFT', 'RIGHT', 'UP', 'DOWN',
  'PAGEUP', 'PAGEDOWN', 'F5', 'F6', 'F7', 'F8', 'CTRL+A'] as const

export interface SapControlAction {
  kind: 'click' | 'type_text' | 'press_key'
  /** Pixel coordinates in the most recent screenshot, not desktop coordinates. */
  x?: number
  y?: number
  text?: string
  key?: typeof SAP_CONTROL_KEYS[number]
}

export interface SapControlSettings {
  version: 1
  enabled: boolean
  sessionId: string | null
  sessionIdentity: string | null
  controlMode: SapControlMode
}

export interface SapCaptureBounds { left: number; top: number; width: number; height: number }

export function normalizeSapControlMode(value: unknown): SapControlMode {
  if (value === 'ask') return 'basic'
  if (value === 'always') return 'automatic'
  return value === 'basic' || value === 'automatic' || value === 'full' ? value : 'off'
}

export function validateSapControlAction(value: unknown): SapControlAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Ação SAP inválida.')
  const row = value as Record<string, unknown>
  const allowed = row.kind === 'click' ? ['kind', 'x', 'y']
    : row.kind === 'type_text' ? ['kind', 'text'] : row.kind === 'press_key' ? ['kind', 'key'] : []
  if (!allowed.length || Object.keys(row).some((key) => !allowed.includes(key))) throw new Error('Campos da ação SAP inválidos.')
  if (row.kind === 'click') {
    if (!Number.isInteger(row.x) || !Number.isInteger(row.y) || Number(row.x) < 0 || Number(row.y) < 0 ||
      Number(row.x) > 8191 || Number(row.y) > 8191) throw new Error('Coordenadas SAP inválidas; use pixels da captura atual.')
    return { kind: 'click', x: Number(row.x), y: Number(row.y) }
  }
  if (row.kind === 'type_text') {
    if (typeof row.text !== 'string' || !row.text.trim() || row.text.length > 4000 ||
      [...row.text].some((char) => { const code = char.charCodeAt(0); return code < 32 && code !== 9 && code !== 10 && code !== 13 })) {
      throw new Error('Texto SAP inválido ou maior que 4.000 caracteres.')
    }
    return { kind: 'type_text', text: row.text }
  }
  if (!SAP_CONTROL_KEYS.includes(row.key as typeof SAP_CONTROL_KEYS[number])) throw new Error('Tecla SAP não permitida.')
  return { kind: 'press_key', key: row.key as typeof SAP_CONTROL_KEYS[number] }
}

export function mapSapCapturePoint(x: number, y: number, imageWidth: number, imageHeight: number,
  bounds: SapCaptureBounds): { x: number; y: number } {
  if (![x, y, imageWidth, imageHeight, bounds.left, bounds.top, bounds.width, bounds.height].every(Number.isInteger) ||
    imageWidth <= 0 || imageHeight <= 0 || bounds.width <= 0 || bounds.height <= 0 ||
    x < 0 || y < 0 || x >= imageWidth || y >= imageHeight) throw new Error('O clique está fora da captura SAP atual.')
  return {
    x: bounds.left + Math.min(bounds.width - 1, Math.floor(x * bounds.width / imageWidth)),
    y: bounds.top + Math.min(bounds.height - 1, Math.floor(y * bounds.height / imageHeight))
  }
}

export function sapActionNeedsApproval(mode: SapControlMode, action: SapControlAction): boolean {
  if (mode === 'full') return false
  if (mode !== 'automatic') return true
  return action.kind !== 'press_key' || action.key !== 'TAB'
}
