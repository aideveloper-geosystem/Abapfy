import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { setupAutoUpdater } from './updater'
import {
  callMcpTool,
  cancelMcpCall,
  closeMcpClients,
  listMcpPrompts,
  listMcpResources,
  listMcpTools,
  mcpToolRequiresConfirmation,
  readMcpResource,
  type McpServerConfig
} from './mcp'

let mainWindow: BrowserWindow | null = null
const approvedStdioConfigs = new Set<string>()
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
    pendingConfirmations.set(request.callId, resolve)
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

function registerMcpIpc(): void {
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
    for (const config of configs.filter((item) => item.transport === 'stdio')) {
      const approvalKey = JSON.stringify([config.id, config.command, config.args])
      if (approvedStdioConfigs.has(approvalKey)) continue
      const callId = `server-${config.id}-${Date.now()}`
      const approved = await requestMcpConfirmation({
        callId,
        kind: 'server',
        serverName: config.name,
        detail: `Executável: ${config.command ?? ''}\nArgumentos: ${config.args.join(' ')}\n\nConfirme apenas se reconhece esta configuração. A autorização vale até fechar o aplicativo.`
      })
      if (!approved) throw new Error(`Inicialização de ${config.name} cancelada.`)
      approvedStdioConfigs.add(approvalKey)
    }
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

  ipcMain.handle('mcp:listResources', (_event, configs: McpServerConfig[]) =>
    listMcpResources(configs)
  )

  ipcMain.handle(
    'mcp:readResource',
    (_event, config: McpServerConfig, uri: string, callId?: string) =>
      readMcpResource(config, uri, callId)
  )

  ipcMain.handle('mcp:listPrompts', (_event, configs: McpServerConfig[]) =>
    listMcpPrompts(configs)
  )
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.abapfy.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerWindowControlIpc()
  registerDocumentIpc()
  registerMcpIpc()
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
