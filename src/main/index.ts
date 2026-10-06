import { app, shell, BrowserWindow, dialog, ipcMain } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { setupAutoUpdater } from './updater'
import { openGeneratedDocx } from './documentFiles'
import {
  callMcpTool,
  cancelMcpCall,
  closeMcpClients,
  getMcpPrompt,
  listMcpPrompts,
  listMcpResources,
  listMcpTools,
  mcpToolRequiresConfirmation,
  readMcpResource,
  type McpServerConfig
} from './mcp'
import { readMcpLocalConfig, saveMcpLocalCatalog, saveMcpLocalServerConfig, type McpLocalConfig, type McpLocalServerConfig } from './mcpLocalConfig'
import { scanSapWindows, readSapWindowSettings, saveSapWindowSettingsWithApproval, captureSapWindow, performSapControl, type SapWindowSettings, type SapControlAction } from './sapWindowContext'

let mainWindow: BrowserWindow | null = null
const approvedStdioConfigs = new Set<string>()
const pendingStdioApprovals = new Map<string, Promise<boolean>>()
const mainDirectory = dirname(fileURLToPath(import.meta.url))
const icon = join(mainDirectory, '../../resources/abapfy-horizon-mark.png')

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#010102',
    roundedCorners: true,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(mainDirectory, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximized-change', true)
  })

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximized-change', false)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(mainDirectory, '../renderer/index.html'))
  }
}

function registerWindowControlIpc(): void {
  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize()
  })

  ipcMain.handle('window:maximizeToggle', () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })

  ipcMain.handle('window:close', () => {
    mainWindow?.close()
  })

  ipcMain.handle('window:isMaximized', () => {
    return mainWindow?.isMaximized() ?? false
  })
}

function registerDocumentIpc(): void {
  ipcMain.handle('document:openDocx', async (event, bytes: unknown, fileName: unknown): Promise<void> => {
    if (event.sender !== mainWindow?.webContents) throw new Error('Janela não autorizada para abrir documentos.')
    await openGeneratedDocx(bytes, fileName, app.getPath('temp'), (path) => shell.openPath(path))
  })
  ipcMain.handle('document:renderPdf', async (_event, html: string): Promise<string> => {
    if (typeof html !== 'string' || html.length > 2_000_000 || !html.startsWith('<!doctype html>')) {
      throw new Error('Documento inválido ou grande demais para gerar o PDF.')
    }
    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true, javascript: false }
    })
    printWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    try {
      await printWindow.loadURL(`data:text/html;charset=utf-8;base64,${Buffer.from(html, 'utf8').toString('base64')}`)
      const pdf = await printWindow.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: '<div style="width:100%;padding:0 18mm;color:#708898;font:9px Arial;text-align:right">Abapfy · DTec &nbsp; <span class="pageNumber"></span> / <span class="totalPages"></span></div>'
      })
      return pdf.toString('base64')
    } finally {
      printWindow.destroy()
    }
  })
}

// Dialog nativo (dialog.showMessageBox) é modal do SO: trava a IPC inteira
// esperando clique e, se a janela estiver minimizada/fora de foco quando abre,
// fica escondido atrás de outras janelas — o app parece travado sem motivo
// aparente. Em vez disso, a confirmação vira um card dentro do próprio chat
// (McpConfirmationBanner no renderer): manda um evento pro renderer e guarda
// um resolver pendente, respondido de volta via IPC quando o usuário decide.
// Ainda traz a janela pra frente, só como reforço visual — não é mais o que
// bloqueia a decisão.
function surfaceMainWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  if (!mainWindow.isVisible()) mainWindow.show()
  mainWindow.focus()
}

interface McpConfirmationRequest {
  callId: string
  kind: 'server' | 'tool'
  serverName: string
  toolName?: string
  detail: string
}

const pendingConfirmations = new Map<string, (approved: boolean) => void>()

function requestMcpConfirmation(request: McpConfirmationRequest): Promise<boolean> {
  surfaceMainWindow()
  if (!mainWindow) return Promise.resolve(false)
  return new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => resolveMcpConfirmation(request.callId, false), 120_000)
    pendingConfirmations.set(request.callId, (approved) => { clearTimeout(timeout); resolve(approved) })
    mainWindow?.webContents.send('mcp:confirmation-pending', request)
  })
}

function resolveMcpConfirmation(callId: string, approved: boolean): void {
  const resolve = pendingConfirmations.get(callId)
  if (!resolve) return
  pendingConfirmations.delete(callId)
  resolve(approved)
  mainWindow?.webContents.send('mcp:confirmation-resolved', { callId, approved })
}

async function ensureMcpStartupApproved(config: McpServerConfig): Promise<void> {
  if (config.transport !== 'stdio') return
  const approvalKey = JSON.stringify([config.id, config.command, config.args, config.cwd, config.env])
  if (approvedStdioConfigs.has(approvalKey)) return
  let pending = pendingStdioApprovals.get(approvalKey)
  if (!pending) {
    const callId = `server-${config.id}-${Date.now()}`
    pending = requestMcpConfirmation({
      callId,
      kind: 'server',
      serverName: config.name,
      detail: `Executável: ${config.command ?? ''}\nArgumentos: ${config.args.join(' ')}\nPasta: ${config.cwd ?? 'padrão'}\n\nConfirme apenas se reconhece esta configuração. A autorização vale até fechar o aplicativo.`
    })
    pendingStdioApprovals.set(approvalKey, pending)
  }
  try {
    if (!await pending) throw new Error(`Inicialização de ${config.name} cancelada.`)
    approvedStdioConfigs.add(approvalKey)
  } finally {
    pendingStdioApprovals.delete(approvalKey)
  }
}

function registerMcpIpc(): void {
  ipcMain.handle('mcp:closeAll', async () => {
    for (const callId of pendingConfirmations.keys()) resolveMcpConfirmation(callId, false)
    approvedStdioConfigs.clear()
    pendingStdioApprovals.clear()
    await closeMcpClients()
  })
  ipcMain.handle('mcp:readLocalConfig', (_event, userId: string) => readMcpLocalConfig(userId))
  ipcMain.handle('mcp:saveLocalCatalog', (_event, userId: string, catalog: McpLocalConfig['catalog']) => saveMcpLocalCatalog(userId, catalog))
  ipcMain.handle('mcp:saveLocalServerConfig', (_event, userId: string, serverId: string, config: McpLocalServerConfig | null) =>
    saveMcpLocalServerConfig(userId, serverId, config)
  )
  ipcMain.handle('mcp:pickDirectory', async () => {
    const options: Electron.OpenDialogOptions = { properties: ['openDirectory'] }
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options)
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle(
    'mcp:confirmationResponse',
    (_event, payload: { callId: string; approved: boolean }) => {
      resolveMcpConfirmation(payload.callId, payload.approved)
    }
  )

  ipcMain.on('mcp:cancelTool', (_event, callId: string) => {
    cancelMcpCall(callId)
    // Se ainda estava esperando o clique do usuário no card de confirmação,
    // resolve como recusado — sem isso o card fica órfão na tela depois que a
    // resposta já foi abortada.
    resolveMcpConfirmation(callId, false)
  })

  ipcMain.handle('mcp:listTools', async (_event, configs: McpServerConfig[]) => {
    for (const config of configs) await ensureMcpStartupApproved(config)
    return listMcpTools(configs)
  })

  ipcMain.handle(
    'mcp:callTool',
    async (
      _event,
      config: McpServerConfig,
      toolName: string,
      args: Record<string, unknown>,
      callId?: string
    ) => {
      await ensureMcpStartupApproved(config)
      if (mcpToolRequiresConfirmation(config.id, toolName)) {
        const resolvedCallId = callId ?? `${config.id}-${toolName}-${Date.now()}`
        const approved = await requestMcpConfirmation({
          callId: resolvedCallId,
          kind: 'tool',
          serverName: config.name,
          toolName,
          detail: `Esta ferramenta pode alterar dados. Confira o servidor/perfil e os argumentos antes de autorizar.\n\nConfiguração: ${config.command ?? config.url ?? ''} ${config.args.join(' ')}\n\nArgumentos: ${JSON.stringify(args, null, 2)}`
        })
        if (!approved) {
          return { isError: true, error: 'Chamada MCP recusada pelo usuário.' }
        }
      }
      return callMcpTool(config, toolName, args, callId)
    }
  )

  ipcMain.handle('mcp:listResources', async (_event, configs: McpServerConfig[]) => {
    for (const config of configs) await ensureMcpStartupApproved(config)
    return listMcpResources(configs)
  })

  ipcMain.handle(
    'mcp:readResource',
    async (_event, config: McpServerConfig, uri: string, callId?: string) => {
      await ensureMcpStartupApproved(config)
      return readMcpResource(config, uri, callId)
    }
  )

  ipcMain.handle('mcp:listPrompts', async (_event, configs: McpServerConfig[]) => {
    for (const config of configs) await ensureMcpStartupApproved(config)
    return listMcpPrompts(configs)
  })
  ipcMain.handle('mcp:getPrompt', async (_event, config: McpServerConfig, name: string, args: Record<string, string>) => {
    await ensureMcpStartupApproved(config)
    return getMcpPrompt(config, name, args)
  })
}

function registerSapGuiIpc(): void {
  const activeControls = new Map<string, AbortController>()
  ipcMain.handle('sapGui:controlStatus', () => ({ version: 4 as const }))
  ipcMain.handle('sapGui:readSettings', (_event, userId: string) => readSapWindowSettings(userId))
  ipcMain.handle('sapGui:saveSettings', (_event, userId: string, value: SapWindowSettings) =>
    saveSapWindowSettingsWithApproval(userId, value, async () => {
      if (!mainWindow) throw new Error('Abra a janela do Abapfy para ativar o modo Full.')
      const choice = await dialog.showMessageBox(mainWindow, {
        type: 'warning', title: 'Ativar modo Full no SAP?',
        message: 'O agente poderá agir no SAP sem pedir aprovação.',
        detail: 'Cliques, digitação, alterações e execução de programas poderão modificar dados na sessão escolhida. Capturas serão enviadas aos modelos utilizados. Ative apenas se aceitar esse controle. Você pode parar a tarefa no chat ou desativar o controle nas configurações.',
        buttons: ['Cancelar', 'Ativar modo Full'], defaultId: 0, cancelId: 0, noLink: true
      })
      return choice.response === 1
    }))
  ipcMain.handle('sapGui:listSessions', () => scanSapWindows())
  ipcMain.handle('sapGui:snapshot', (_event, userId: string) => captureSapWindow(userId))
  ipcMain.handle('sapGui:control', async (_event, userId: string, action: SapControlAction, callId: string, captureId: string) => {
    if (typeof callId !== 'string' || !/^sap-[a-z0-9-]{1,80}$/i.test(callId)) throw new Error('Identificador da ação SAP inválido.')
    if (activeControls.has(callId)) throw new Error('Ação SAP duplicada.')
    const controller = new AbortController()
    activeControls.set(callId, controller)
    try {
      return await performSapControl(userId, action, (detail) => requestMcpConfirmation({
        callId, kind: 'tool', serverName: 'SAP GUI', toolName: action.kind, detail
      }), controller.signal, captureId)
    } finally { activeControls.delete(callId) }
  })
  ipcMain.on('sapGui:cancelControl', (_event, callId: string) => {
    activeControls.get(callId)?.abort()
    resolveMcpConfirmation(callId, false)
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.abapfy.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerWindowControlIpc()
  registerDocumentIpc()
  registerMcpIpc()
  registerSapGuiIpc()
  createWindow()

  if (mainWindow) {
    setupAutoUpdater(mainWindow)
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  void closeMcpClients()
})
