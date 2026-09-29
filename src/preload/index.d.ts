import { ElectronAPI } from '@electron-toolkit/preload'

export interface WindowControlsApi {
  minimize: () => Promise<void>
  maximizeToggle: () => Promise<void>
  close: () => Promise<void>
  isMaximized: () => Promise<boolean>
  onMaximizedChange: (callback: (isMaximized: boolean) => void) => () => void
}

export interface UpdateAvailableInfo {
  version: string
  releaseNotes: string | null
  releaseDate: string
}

export interface UpdateProgressInfo {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateState {
  status: UpdateStatus
  latest: UpdateAvailableInfo | null
  progress: UpdateProgressInfo | null
  error: string | null
}

export interface UpdatesApi {
  getVersion: () => Promise<string>
  getState: () => Promise<UpdateState>
  check: () => Promise<void>
  download: () => Promise<void>
  install: () => Promise<void>
  onChecking: (callback: () => void) => () => void
  onAvailable: (callback: (info: UpdateAvailableInfo) => void) => () => void
  onNotAvailable: (callback: () => void) => () => void
  onProgress: (callback: (progress: UpdateProgressInfo) => void) => () => void
  onDownloaded: (callback: () => void) => () => void
  onError: (callback: (message: string) => void) => () => void
}

export interface McpServerConfig {
  id: string
  name: string
  transport: 'streamable_http' | 'stdio'
  url: string | null
  command: string | null
  args: string[]
  cwd?: string
  env?: Record<string, string>
  headers?: Record<string, string>
}

export interface McpLocalServerConfig {
  cwd?: string
  env?: Record<string, string>
  headers?: Record<string, string>
  disabledTools?: string[]
  profile?: string
}

export interface McpLocalConfig {
  version: 1
  servers: Record<string, McpLocalServerConfig>
  catalog: {
    servers: Array<{ id: string; slug: string; name: string; transport: 'streamable_http' | 'stdio'; url: string | null; command: string | null; args: string[]; enabled: boolean }>
    bindings: Array<{ serverId: string; agentSource: string; agentId: string; enabled: boolean }>
  }
}

export interface McpToolInfo {
  qualifiedName: string
  serverId: string
  serverName: string
  name: string
  description: string
  inputSchema: Record<string, unknown>
  requiresConfirmation: boolean
}

export interface McpResourceInfo {
  serverId: string
  serverName: string
  uri: string
  name: string
  description: string | null
  mimeType: string | null
}

export interface McpPromptInfo {
  serverId: string
  serverName: string
  name: string
  description: string | null
  arguments: Array<{ name: string; description?: string; required?: boolean }>
}

export interface McpConfirmationPending {
  callId: string
  kind: 'server' | 'tool'
  serverName: string
  toolName?: string
  detail: string
}

export interface McpConfirmationResolved {
  callId: string
  approved: boolean
}

export interface McpApi {
  closeAll: () => Promise<void>
  readLocalConfig: (userId: string) => Promise<McpLocalConfig>
  saveLocalCatalog: (userId: string, catalog: McpLocalConfig['catalog']) => Promise<McpLocalConfig>
  saveLocalServerConfig: (userId: string, serverId: string, config: McpLocalServerConfig | null) => Promise<McpLocalConfig>
  pickDirectory: () => Promise<string | null>
  listTools: (configs: McpServerConfig[]) => Promise<McpToolInfo[]>
  callTool: (
    config: McpServerConfig,
    toolName: string,
    args: Record<string, unknown>,
    callId?: string
  ) => Promise<unknown>
  cancelTool: (callId: string) => void
  respondConfirmation: (callId: string, approved: boolean) => Promise<void>
  listResources: (configs: McpServerConfig[]) => Promise<McpResourceInfo[]>
  readResource: (config: McpServerConfig, uri: string, callId?: string) => Promise<unknown>
  listPrompts: (configs: McpServerConfig[]) => Promise<McpPromptInfo[]>
  getPrompt: (config: McpServerConfig, name: string, args: Record<string, string>) => Promise<unknown>
  onConfirmationPending: (callback: (event: McpConfirmationPending) => void) => () => void
  onConfirmationResolved: (callback: (event: McpConfirmationResolved) => void) => () => void
}

export interface SapGuiSettings {
  version: 1
  enabled: boolean
  sessionId: string | null
  sessionIdentity: string | null
  controlMode: 'off' | 'ask' | 'always'
}

export interface SapGuiControlAction {
  kind: 'click' | 'type_text' | 'press_key'
  x?: number
  y?: number
  text?: string
  key?: 'TAB' | 'ENTER' | 'ESC' | 'BACKSPACE' | 'LEFT' | 'RIGHT' | 'UP' | 'DOWN'
}

export interface SapGuiSession {
  id: string
  title: string
  processName: string
  processId: number
}

export interface SapGuiScan {
  windows: SapGuiSession[]
  processCount: number
  message: string
}

export interface SapGuiCapture {
  window: SapGuiSession
  imageDataUrl: string
  width: number
  height: number
}

export interface SapGuiApi {
  readSettings: (userId: string) => Promise<SapGuiSettings>
  saveSettings: (userId: string, value: SapGuiSettings) => Promise<SapGuiSettings>
  listSessions: () => Promise<SapGuiScan>
  snapshot: (userId: string) => Promise<SapGuiCapture>
  controlStatus: () => Promise<{ version: 2 }>
  control: (userId: string, action: SapGuiControlAction, callId: string) => Promise<string>
  cancelControl: (callId: string) => void
}

export interface Api {
  windowControls: WindowControlsApi
  updates: UpdatesApi
  mcp: McpApi
  sapGui: SapGuiApi
  documents: { renderPdf: (html: string) => Promise<string> }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
