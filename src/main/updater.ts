import { app, ipcMain, BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'

const { autoUpdater } = electronUpdater

autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = false

// Primeira checagem logo após a abertura (sem competir com o carregamento inicial)
// e depois periodicamente, para quem deixa o app aberto o dia todo.
const INITIAL_CHECK_DELAY_MS = 15_000
const PERIODIC_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

type UpdateStatus = 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'downloaded' | 'error'

interface UpdateAvailableInfo {
  version: string
  releaseNotes: string | null
  releaseDate: string
}

interface UpdateProgressInfo {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

// Espelho do último evento enviado ao renderer: telas montadas depois de uma
// checagem automática (toast, Configurações → Atualizações) partem daqui.
const state: {
  status: UpdateStatus
  latest: UpdateAvailableInfo | null
  progress: UpdateProgressInfo | null
  error: string | null
} = { status: 'idle', latest: null, progress: null, error: null }

export function setupAutoUpdater(mainWindow: BrowserWindow): void {
  const send = (channel: string, payload?: unknown): void => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
  }

  autoUpdater.on('checking-for-update', () => {
    // Checagem periódica não deve "desfazer" um download em andamento ou pronto.
    if (state.status === 'downloading' || state.status === 'downloaded') return
    state.status = 'checking'
    state.error = null
    send('updates:checking')
  })

  autoUpdater.on('update-available', (info) => {
    if (state.status === 'downloading' || state.status === 'downloaded') return
    state.status = 'available'
    state.latest = {
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : null,
      releaseDate: info.releaseDate
    }
    send('updates:available', state.latest)
  })

  autoUpdater.on('update-not-available', () => {
    if (state.status === 'downloading' || state.status === 'downloaded') return
    state.status = 'up-to-date'
    state.latest = null
    send('updates:not-available')
  })

  autoUpdater.on('download-progress', (progress) => {
    state.status = 'downloading'
    state.progress = {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    }
    send('updates:progress', state.progress)
  })

  autoUpdater.on('update-downloaded', () => {
    state.status = 'downloaded'
    send('updates:downloaded')
  })

  autoUpdater.on('error', (error) => {
    if (state.status === 'downloaded') return
    state.status = 'error'
    state.error = error.message
    send('updates:error', error.message)
  })

  ipcMain.handle('updates:getVersion', () => app.getVersion())

  ipcMain.handle('updates:getState', () => state)

  ipcMain.handle('updates:check', async () => {
    if (!app.isPackaged) {
      send('updates:error', 'Verificação de atualizações indisponível em modo de desenvolvimento.')
      return
    }
    await autoUpdater.checkForUpdates()
  })

  ipcMain.handle('updates:download', async () => {
    if (!app.isPackaged) return
    await autoUpdater.downloadUpdate()
  })

  ipcMain.handle('updates:install', () => {
    autoUpdater.quitAndInstall()
  })

  if (!app.isPackaged) return

  const checkInBackground = (): void => {
    if (state.status === 'checking' || state.status === 'downloading' || state.status === 'downloaded') return
    // Falhas de rede na checagem automática já chegam pelo evento 'error'.
    autoUpdater.checkForUpdates().catch(() => undefined)
  }
  setTimeout(checkInBackground, INITIAL_CHECK_DELAY_MS)
  setInterval(checkInBackground, PERIODIC_CHECK_INTERVAL_MS)
}
