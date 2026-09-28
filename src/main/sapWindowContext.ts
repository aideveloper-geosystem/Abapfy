import { app, desktopCapturer } from 'electron'
import { randomUUID } from 'node:crypto'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const execFileAsync = promisify(execFile)
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const WINDOW_PATTERN = /^window:\d+:0$/
const writeQueues = new Map<string, Promise<void>>()

export interface SapWindowSettings {
  version: 1
  enabled: boolean
  sessionId: string | null
  sessionIdentity: string | null
  controlMode: 'off' | 'ask' | 'always'
}

export interface SapWindow {
  id: string
  title: string
  processName: string
  processId: number
}

export interface SapWindowScan {
  windows: SapWindow[]
  processCount: number
  message: string
}

export interface SapWindowCapture {
  window: SapWindow
  imageDataUrl: string
  width: number
  height: number
}

export interface SapControlAction {
  kind: 'click' | 'type_text' | 'press_key'
  x?: number
  y?: number
  text?: string
  key?: 'TAB' | 'ENTER' | 'ESC' | 'BACKSPACE' | 'LEFT' | 'RIGHT' | 'UP' | 'DOWN'
}

const controlBusy = new Set<string>()

function runInputScript(script: string, text: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
      windowsHide: true, signal, stdio: ['pipe', 'pipe', 'pipe']
    })
    let outputText = ''
    let finished = false
    const fail = (error: Error): void => { if (!finished) { finished = true; reject(error) } }
    child.stderr.resume()
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => { outputText = (outputText + chunk).slice(-1500) })
    child.on('error', fail)
    child.on('close', (code) => {
      if (finished) return
      finished = true
      if (code === 0) resolve()
      else {
        const marker = outputText.match(/ABAPFY_SAP_ERROR:([^\r\n]+)/)
        reject(new Error(marker?.[1]?.trim() || 'A entrada Windows na janela SAP falhou. Confira se o SAP e o Abapfy estão no mesmo nível de permissão.'))
      }
    })
    const timeout = setTimeout(() => child.kill(), 30_000)
    child.on('close', () => clearTimeout(timeout))
    child.stdin.on('error', () => undefined)
    child.stdin.end(Buffer.from(text, 'utf8').toString('base64'))
  })
}

const INPUT_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Threading;
public static class SapInputNative {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out Rect rect);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
  public static void Key(byte vk) { keybd_event(vk, 0, 0, UIntPtr.Zero); keybd_event(vk, 0, 2, UIntPtr.Zero); }
  public static void Type(string value, IntPtr target) {
    foreach (char c in value) {
      if (GetForegroundWindow() != target) throw new Exception("A janela SAP perdeu o foco durante a digitação.");
      if (c == '\n') { Key(13); continue; }
      if (c == '\t') { Key(9); continue; }
      SendUnicode(c, false); SendUnicode(c, true);
      Thread.Sleep(2);
    }
  }
  [StructLayout(LayoutKind.Sequential)] public struct Input { public uint type; public Union u; }
  // INPUT usa a maior alternativa da união (MOUSEINPUT). Sem ela o tamanho
  // fica 32 bytes em x64; o Windows exige 40 e SendInput retorna zero.
  [StructLayout(LayoutKind.Explicit)] public struct Union {
    [FieldOffset(0)] public Keyboard ki;
    [FieldOffset(0)] public Mouse mi;
  }
  [StructLayout(LayoutKind.Sequential)] public struct Keyboard { public ushort vk, scan; public uint flags, time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] public struct Mouse { public int dx, dy; public uint mouseData, flags, time; public UIntPtr extra; }
  [DllImport("user32.dll", SetLastError = true)] public static extern uint SendInput(uint count, Input[] inputs, int size);
  static void SendUnicode(char c, bool up) {
    Input input = new Input { type = 1, u = new Union { ki = new Keyboard { scan = c, flags = (uint)(4 | (up ? 2 : 0)) } } };
    int size = Marshal.SizeOf(typeof(Input));
    if (size != (IntPtr.Size == 8 ? 40 : 28)) throw new Exception("Estrutura INPUT do Windows com tamanho inesperado: " + size + " bytes.");
    if (SendInput(1, new [] { input }, size) != 1)
      throw new Exception("O Windows recusou a entrada de texto (Win32 " + Marshal.GetLastWin32Error() + ", INPUT " + size + " bytes). Verifique se o SAP não está elevado acima do Abapfy.");
  }
}
'@
$handle = [IntPtr]::new([long]$targetHandle)
if (-not [SapInputNative]::IsWindow($handle)) { throw 'A janela SAP selecionada não existe mais.' }
[uint32]$actualPid = 0
[void][SapInputNative]::GetWindowThreadProcessId($handle, [ref]$actualPid)
if ($actualPid -ne [uint32]$targetPid) { throw 'O processo da janela SAP mudou.' }
[void][SapInputNative]::SetForegroundWindow($handle)
Start-Sleep -Milliseconds 180
if ([SapInputNative]::GetForegroundWindow() -ne $handle) { throw 'Não foi possível colocar a janela SAP em primeiro plano.' }
if ($actionKind -eq 'click') {
  $rect = New-Object SapInputNative+Rect
  if (-not [SapInputNative]::GetWindowRect($handle, [ref]$rect)) { throw 'Não foi possível medir a janela SAP.' }
  $px = $rect.Left + [int](($rect.Right - $rect.Left) * $actionX)
  $py = $rect.Top + [int](($rect.Bottom - $rect.Top) * $actionY)
  [void][SapInputNative]::SetCursorPos($px, $py)
  if ([SapInputNative]::GetForegroundWindow() -ne $handle) { throw 'A janela SAP perdeu o foco.' }
  [SapInputNative]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
  [SapInputNative]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
} elseif ($actionKind -eq 'type_text') {
  [SapInputNative]::Type($actionText, $handle)
} elseif ($actionKind -eq 'press_key') {
  $keys = @{ TAB = 9; ENTER = 13; ESC = 27; BACKSPACE = 8; LEFT = 37; UP = 38; RIGHT = 39; DOWN = 40 }
  [SapInputNative]::Key([byte]$keys[$actionKey])
}
`

export async function performSapControl(userId: string, action: SapControlAction,
  confirm: (description: string) => Promise<boolean>, signal?: AbortSignal): Promise<string> {
  if (process.platform !== 'win32') throw new Error('O controle SAP está disponível apenas no Windows.')
  if (controlBusy.has(userId)) throw new Error('Já existe uma ação SAP em andamento nesta conta.')
  if (!action || !['click', 'type_text', 'press_key'].includes(action.kind)) throw new Error('Ação SAP inválida.')
  if (action.kind === 'click' && (!Number.isFinite(action.x) || !Number.isFinite(action.y) ||
    action.x! < 0.02 || action.x! > 0.98 || action.y! < 0.02 || action.y! > 0.98)) throw new Error('Coordenadas SAP inválidas.')
  if (action.kind === 'type_text' && (typeof action.text !== 'string' || !action.text.trim() || action.text.length > 4000 ||
    [...action.text].some((char) => { const code = char.charCodeAt(0); return code < 32 && code !== 9 && code !== 10 && code !== 13 }))) throw new Error('Texto SAP inválido ou maior que 4.000 caracteres.')
  const allowedKeys = ['TAB', 'ENTER', 'ESC', 'BACKSPACE', 'LEFT', 'RIGHT', 'UP', 'DOWN']
  if (action.kind === 'press_key' && !allowedKeys.includes(action.key ?? '')) throw new Error('Tecla SAP não permitida.')
  controlBusy.add(userId)
  try {
    const settings = await readSapWindowSettings(userId)
    if (!settings.enabled || settings.controlMode === 'off' || !settings.sessionId || !settings.sessionIdentity) throw new Error('Ative o controle e escolha uma janela SAP nas configurações.')
    const scan = await scanSapWindows()
    const selected = scan.windows.find((window) => window.id === settings.sessionId && String(window.processId) === settings.sessionIdentity)
    if (!selected) throw new Error('A janela SAP escolhida não está mais disponível.')
    const detail = action.kind === 'type_text' ? `Digitar exatamente este texto na janela "${selected.title}":\n\n${action.text}`
      : action.kind === 'click' ? `Clicar na janela "${selected.title}" em ${Math.round(action.x! * 100)}% × ${Math.round(action.y! * 100)}%.`
        : `Pressionar ${action.key} na janela "${selected.title}".`
    // ENTER e cliques em barras/menu sempre pedem autorização, inclusive no modo persistente.
    const risky = action.kind === 'press_key' && action.key === 'ENTER' ||
      action.kind === 'click' && action.y! < 0.18 ||
      action.kind === 'type_text' && /[\r\n]/.test(action.text ?? '')
    if ((settings.controlMode === 'ask' || risky) && !await confirm(detail)) throw new Error('Ação SAP cancelada pelo usuário.')
    if (signal?.aborted) throw new Error('Ação SAP interrompida.')
    const current = await readSapWindowSettings(userId)
    if (!current.enabled || current.controlMode !== settings.controlMode || current.sessionId !== settings.sessionId ||
      current.sessionIdentity !== settings.sessionIdentity) throw new Error('A configuração SAP mudou antes da ação.')
    const fresh = await scanSapWindows()
    if (!fresh.windows.some((window) => window.id === selected.id && window.processId === selected.processId && window.title === selected.title)) {
      throw new Error('A janela SAP mudou antes da ação. Revise a tela e tente novamente.')
    }
    const handle = selected.id.split(':')[1]
    const input = `$targetHandle = ${handle}\n$targetPid = ${selected.processId}\n$actionKind = '${action.kind}'\n$actionX = ${action.x ?? 0}\n$actionY = ${action.y ?? 0}\n$actionKey = '${action.key ?? ''}'\n$actionText = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd()))\ntry {\n${INPUT_SCRIPT}\n} catch { [Console]::Out.WriteLine('ABAPFY_SAP_ERROR:' + $_.Exception.Message); exit 1 }`
    await runInputScript(input, action.text ?? '', signal)
    return `${detail}\nEntrada enviada ao Windows; confirme o resultado pela próxima captura.`
  } finally { controlBusy.delete(userId) }
}

const EMPTY_SETTINGS: SapWindowSettings = { version: 1, enabled: false, sessionId: null, sessionIdentity: null, controlMode: 'off' }

function fileFor(userId: string): string {
  if (!ID_PATTERN.test(userId)) throw new Error('Conta inválida para o contexto SAP.')
  return join(app.getPath('userData'), 'sap-gui', `${userId}.json`)
}

export async function readSapWindowSettings(userId: string): Promise<SapWindowSettings> {
  try {
    const value: unknown = JSON.parse(await readFile(fileFor(userId), 'utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Configuração SAP inválida.')
    const parsed = value as Record<string, unknown>
    if (parsed.version !== 1 || typeof parsed.enabled !== 'boolean') throw new Error('Configuração SAP inválida.')
    // A seleção antiga usava índices do SAP GUI Scripting. Preservamos a
    // ativação, mas exigimos que o usuário escolha uma janela visual.
    if (typeof parsed.sessionId === 'string' && !WINDOW_PATTERN.test(parsed.sessionId)) {
      return { version: 1, enabled: parsed.enabled, sessionId: null, sessionIdentity: null, controlMode: 'off' }
    }
    if (parsed.sessionId !== null && (typeof parsed.sessionId !== 'string' || !WINDOW_PATTERN.test(parsed.sessionId))) throw new Error('Janela SAP salva inválida.')
    if (parsed.sessionIdentity !== null && (typeof parsed.sessionIdentity !== 'string' || !/^\d{1,10}$/.test(parsed.sessionIdentity))) throw new Error('Identidade da janela SAP inválida.')
    return { version: 1, enabled: parsed.enabled, sessionId: parsed.sessionId, sessionIdentity: parsed.sessionIdentity as string | null,
      controlMode: parsed.controlMode === 'ask' || parsed.controlMode === 'always' ? parsed.controlMode : 'off' }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ...EMPTY_SETTINGS }
    throw error
  }
}

export async function saveSapWindowSettings(userId: string, value: SapWindowSettings): Promise<SapWindowSettings> {
  const file = fileFor(userId)
  if (value.version !== 1 || typeof value.enabled !== 'boolean' ||
      (value.sessionId !== null && !WINDOW_PATTERN.test(value.sessionId)) ||
      (value.sessionIdentity !== null && !/^\d{1,10}$/.test(value.sessionIdentity)) ||
      (value.sessionId !== null && !value.sessionIdentity) ||
      !['off', 'ask', 'always'].includes(value.controlMode)) throw new Error('Configuração SAP inválida.')
  const previous = writeQueues.get(userId) ?? Promise.resolve()
  let release: () => void = () => undefined
  const next = new Promise<void>((resolve) => { release = resolve })
  writeQueues.set(userId, next)
  await previous
  try {
    const settings = { version: 1 as const, enabled: value.enabled, sessionId: value.sessionId, sessionIdentity: value.sessionIdentity, controlMode: value.controlMode }
    await mkdir(join(app.getPath('userData'), 'sap-gui'), { recursive: true })
    const temporary = `${file}.${randomUUID()}.tmp`
    await writeFile(temporary, JSON.stringify(settings, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, file)
    return settings
  } finally {
    release()
    if (writeQueues.get(userId) === next) writeQueues.delete(userId)
  }
}

// Enumera apenas janelas top-level pertencentes aos processos SAP GUI. Não
// usa SAP GUI Scripting e não lê o conteúdo interno da janela.
const WINDOWS_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class SapWindowNative {
  public delegate bool EnumWindowsProc(IntPtr window, IntPtr parameter);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextLength(IntPtr window);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr window, StringBuilder title, int maxCount);
}
'@
$processes = @(Get-Process -Name 'saplogon','sapgui' -ErrorAction SilentlyContinue)
$allowed = @{}
foreach ($process in $processes) { $allowed[[int]$process.Id] = [string]$process.ProcessName }
$windows = New-Object System.Collections.ArrayList
$callback = [SapWindowNative+EnumWindowsProc] {
  param([IntPtr]$handle, [IntPtr]$parameter)
  if (-not [SapWindowNative]::IsWindowVisible($handle)) { return $true }
  [uint32]$processId = 0
  [void][SapWindowNative]::GetWindowThreadProcessId($handle, [ref]$processId)
  if (-not $allowed.ContainsKey([int]$processId)) { return $true }
  $length = [SapWindowNative]::GetWindowTextLength($handle)
  if ($length -lt 1) { return $true }
  $title = New-Object System.Text.StringBuilder ($length + 1)
  [void][SapWindowNative]::GetWindowText($handle, $title, $title.Capacity)
  if ([string]::IsNullOrWhiteSpace($title.ToString())) { return $true }
  [void]$windows.Add([pscustomobject]@{
    id = "window:$($handle.ToInt64()):0"
    title = $title.ToString()
    processName = $allowed[[int]$processId]
    processId = [int]$processId
  })
  return $true
}
[void][SapWindowNative]::EnumWindows($callback, [IntPtr]::Zero)
ConvertTo-Json -InputObject @{ windows = @($windows.ToArray()); processCount = $processes.Count } -Depth 4 -Compress
`

function parseWindow(value: unknown): SapWindow | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (typeof row.id !== 'string' || !WINDOW_PATTERN.test(row.id) || typeof row.title !== 'string' ||
      typeof row.processId !== 'number' || !Number.isInteger(row.processId) ||
      !['saplogon', 'sapgui'].includes(String(row.processName).toLowerCase())) return null
  return { id: row.id, title: row.title.replace(/[\r\n\t]/g, ' ').slice(0, 240),
    processName: String(row.processName), processId: row.processId }
}

export async function scanSapWindows(): Promise<SapWindowScan> {
  if (process.platform !== 'win32') return { windows: [], processCount: 0, message: 'A captura de janelas SAP GUI está disponível apenas no Windows.' }
  const encoded = Buffer.from(WINDOWS_SCRIPT, 'utf16le').toString('base64')
  let stdout: string
  try {
    ({ stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
      windowsHide: true, timeout: 10_000, maxBuffer: 256 * 1024, encoding: 'utf8'
    }))
  } catch {
    return { windows: [], processCount: 0, message: 'Não foi possível enumerar as janelas do Windows. Verifique se o SAP GUI está aberto no mesmo desktop do Abapfy.' }
  }
  let result: unknown
  try { result = JSON.parse(stdout.replace(/^\uFEFF/, '').trim()) }
  catch { return { windows: [], processCount: 0, message: 'A enumeração das janelas retornou dados inválidos.' } }
  const data = result as { windows?: unknown; processCount?: unknown }
  const windows = Array.isArray(data.windows) ? data.windows.map(parseWindow).filter((item): item is SapWindow => item !== null).slice(0, 30) : []
  const processCount = typeof data.processCount === 'number' ? data.processCount : 0
  const message = windows.length ? `${windows.length} janela(s) SAP GUI encontrada(s).`
    : processCount ? 'SAP Logon está aberto, mas não há janela SAP GUI visível neste desktop. Abra uma conexão SAP ou verifique se a sessão está em RDP, Citrix ou navegador.'
      : 'Nenhum processo SAP GUI foi encontrado neste Windows. A sessão pode estar em navegador, SAP Business Client, RDP ou Citrix.'
  return { windows, processCount, message }
}

export async function captureSapWindow(userId: string): Promise<SapWindowCapture> {
  const settings = await readSapWindowSettings(userId)
  if (!settings.enabled || !settings.sessionId) throw new Error('Ative o contexto SAP e escolha uma janela em Configurações → Contexto SAP.')
  const scan = await scanSapWindows()
  const selected = scan.windows.find((window) => window.id === settings.sessionId && String(window.processId) === settings.sessionIdentity)
  if (!selected) throw new Error('A janela SAP escolhida não está mais disponível. Atualize a lista e selecione-a novamente.')
  const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 1920, height: 1080 } })
  const source = sources.find((item) => item.id === selected.id)
  if (!source || source.thumbnail.isEmpty()) throw new Error('O Windows não forneceu uma imagem da janela SAP selecionada.')
  const size = source.thumbnail.getSize()
  if (size.width < 400 || size.height < 250) throw new Error('A captura da janela SAP está vazia ou pequena demais para análise.')
  const png = source.thumbnail.toPNG()
  if (png.length > 6 * 1024 * 1024) throw new Error('A captura SAP excede o limite de 6 MB. Reduza o tamanho da janela.')
  const current = await readSapWindowSettings(userId)
  if (!current.enabled || current.sessionId !== settings.sessionId || current.sessionIdentity !== settings.sessionIdentity) {
    throw new Error('A configuração da captura SAP mudou durante a leitura. Tente novamente.')
  }
  return { window: selected, imageDataUrl: `data:image/png;base64,${png.toString('base64')}`, width: size.width, height: size.height }
}
