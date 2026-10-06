import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { SapNativeWorker } from './sapNativeWorker'
import { mapSapCapturePoint, normalizeSapControlMode, sapActionNeedsApproval, validateSapControlAction, type SapControlSettings, type SapControlAction, type SapCaptureBounds } from '../shared/sapControl'
export type { SapControlAction } from '../shared/sapControl'
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const WINDOW_PATTERN = /^window:\d+:0$/
const writeQueues = new Map<string, Promise<void>>()

export type SapWindowSettings = SapControlSettings

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
  captureId: string
  changeRatio: number | null
  window: SapWindow
  imageDataUrl: string
  width: number
  height: number
}

interface ControlFrame { captureId: string; width: number; height: number; window: SapWindow; bounds: SapCaptureBounds; createdAt: number }
const controlFrames = new Map<string, ControlFrame>()
let controlBusy = false

const INPUT_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -ReferencedAssemblies 'System.Drawing' -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Threading;
public static class SapInputNative {
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
  public static void PhysicalCoordinates() {
    if (SetThreadDpiAwarenessContext(new IntPtr(-4)) == IntPtr.Zero)
      throw new Exception("Não foi possível usar coordenadas físicas do Windows.");
  }
  public class Snapshot {
    public string pngBase64;
    public int width, height, left, top, windowWidth, windowHeight;
    public double? changeRatio;
  }
  static long previousHandle;
  static int previousWidth, previousHeight;
  static int[] previousPixels;
  public static Snapshot Capture(IntPtr target, uint pid) {
    if (!IsWindow(target) || IsIconic(target)) throw new Exception("A janela SAP não existe ou está minimizada.");
    uint actualPid;
    GetWindowThreadProcessId(target, out actualPid);
    if (actualPid != pid) throw new Exception("O processo da janela SAP mudou.");
    Rect rect;
    if (!GetWindowRect(target, out rect)) throw new Exception("Não foi possível medir a janela SAP.");
    int originalWidth = rect.Right - rect.Left, originalHeight = rect.Bottom - rect.Top;
    if (originalWidth < 400 || originalHeight < 250 || originalWidth > 8192 || originalHeight > 8192 ||
        (long)originalWidth * originalHeight > 24000000) throw new Exception("Dimensões da janela SAP inválidas para captura.");
    double scale = Math.Min(1.0, Math.Min(2048.0 / originalWidth, 1536.0 / originalHeight));
    int width = Math.Max(1, (int)(originalWidth * scale)), height = Math.Max(1, (int)(originalHeight * scale));
    using (var original = new System.Drawing.Bitmap(originalWidth, originalHeight)) {
      using (var graphics = System.Drawing.Graphics.FromImage(original)) {
        IntPtr dc = graphics.GetHdc();
        bool captured;
        try { captured = PrintWindow(target, dc, 2); }
        finally { graphics.ReleaseHdc(dc); }
        if (!captured) throw new Exception("O Windows não conseguiu capturar a janela SAP. A entrada não será enviada.");
      }
      Rect current;
      if (!GetWindowRect(target, out current) || current.Left != rect.Left || current.Top != rect.Top ||
          current.Right != rect.Right || current.Bottom != rect.Bottom) throw new Exception("A janela SAP mudou durante a captura.");
      using (var image = new System.Drawing.Bitmap(width, height)) {
        using (var graphics = System.Drawing.Graphics.FromImage(image)) {
          graphics.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
          graphics.DrawImage(original, 0, 0, width, height);
        }
        var pixels = new System.Collections.Generic.List<int>();
        int firstPixel = -1;
        bool uniform = true;
        for (int y = 28; y < height - 8; y += 4) {
          for (int x = 8; x < width - 8; x += 4) {
            int pixel = image.GetPixel(x, y).ToArgb();
            if (firstPixel == -1) firstPixel = pixel;
            else if (pixel != firstPixel) uniform = false;
            pixels.Add(pixel);
          }
        }
        if (uniform) throw new Exception("A captura SAP está uniforme ou vazia. Confira a prévia antes de controlar.");
        double? changeRatio = null;
        if (previousHandle == target.ToInt64() && previousWidth == width && previousHeight == height &&
            previousPixels != null && previousPixels.Length == pixels.Count) {
          int changed = 0;
          for (int i = 0; i < pixels.Count; i++) {
            int a = pixels[i], b = previousPixels[i];
            int difference = Math.Abs(((a >> 16) & 255) - ((b >> 16) & 255)) +
              Math.Abs(((a >> 8) & 255) - ((b >> 8) & 255)) + Math.Abs((a & 255) - (b & 255));
            if (difference > 48) changed++;
          }
          changeRatio = (double)changed / pixels.Count;
        }
        previousHandle = target.ToInt64(); previousWidth = width; previousHeight = height;
        previousPixels = pixels.ToArray();
        using (var stream = new System.IO.MemoryStream()) {
          image.Save(stream, System.Drawing.Imaging.ImageFormat.Png);
          if (stream.Length > 6 * 1024 * 1024) throw new Exception("A captura SAP excede 6 MB.");
          return new Snapshot {
            pngBase64 = Convert.ToBase64String(stream.ToArray()), width = width, height = height,
            left = rect.Left, top = rect.Top, windowWidth = originalWidth, windowHeight = originalHeight,
            changeRatio = changeRatio
          };
        }
      }
    }
  }
  public static void SelectAll() {
    Input ctrlDown = new Input { type = 1, u = new Union { ki = new Keyboard { vk = 17 } } };
    Input aDown = new Input { type = 1, u = new Union { ki = new Keyboard { vk = 65 } } };
    Input aUp = aDown; aUp.u.ki.flags = 2;
    Input ctrlUp = ctrlDown; ctrlUp.u.ki.flags = 2;
    if (SendInput(4, new [] { ctrlDown, aDown, aUp, ctrlUp }, Marshal.SizeOf(typeof(Input))) != 4)
      throw new Exception("O Windows recusou ou enviou parcialmente Ctrl+A. Confira a tela antes de continuar.");
  }

  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out Rect rect);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point point);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h, uint flags);
  public static bool OwnsPoint(IntPtr target, int x, int y) {
    return GetAncestor(WindowFromPoint(new Point { X = x, Y = y }), 2) == target;
  }
  public static void Key(byte vk) {
    Input down = new Input { type = 1, u = new Union { ki = new Keyboard { vk = vk } } };
    Input up = down; up.u.ki.flags = 2;
    SendPair(down, up);
  }
  public static void Click() {
    Input down = new Input { type = 0, u = new Union { mi = new Mouse { flags = 2 } } };
    Input up = down; up.u.mi.flags = 4;
    SendPair(down, up);
  }
  public static void Type(string value, IntPtr target) {
    value = value.Replace("\r\n", "\n").Replace("\r", "\n");
    foreach (char c in value) {
      if (GetForegroundWindow() != target) throw new Exception("A janela SAP perdeu o foco durante a digitação.");
      if (c == '\n') { Key(13); continue; }
      if (c == '\t') { Key(9); continue; }
      SendUnicode(c);
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
  static void SendUnicode(char c) {
    Input down = new Input { type = 1, u = new Union { ki = new Keyboard { scan = c, flags = 4 } } };
    Input up = down; up.u.ki.flags = 6;
    SendPair(down, up);
  }
  static void SendPair(Input down, Input up) {
    int size = Marshal.SizeOf(typeof(Input));
    if (size != (IntPtr.Size == 8 ? 40 : 28)) throw new Exception("Estrutura INPUT do Windows com tamanho inesperado: " + size + " bytes.");
    if (SendInput(2, new [] { down, up }, size) != 2)
      throw new Exception("O Windows recusou ou enviou parcialmente a entrada (Win32 " + Marshal.GetLastWin32Error() + "). Confira a tela e verifique o nível de permissão do SAP e do Abapfy.");
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
$rect = New-Object SapInputNative+Rect
if (-not [SapInputNative]::GetWindowRect($handle, [ref]$rect)) { throw 'Não foi possível medir a janela SAP.' }
if ($rect.Left -ne $expectedLeft -or $rect.Top -ne $expectedTop -or
    ($rect.Right - $rect.Left) -ne $expectedWidth -or ($rect.Bottom - $rect.Top) -ne $expectedHeight) {
  throw 'A janela SAP mudou de posição ou tamanho desde a captura. Nenhuma entrada foi enviada.'
}
if ($actionKind -eq 'click') {
  $px = $screenX
  $py = $screenY
  if (-not [SapInputNative]::SetCursorPos($px, $py)) { throw 'Não foi possível posicionar o cursor SAP.' }
  if ([SapInputNative]::GetForegroundWindow() -ne $handle) { throw 'A janela SAP perdeu o foco.' }
  if (-not [SapInputNative]::OwnsPoint($handle, $px, $py)) { throw 'O ponto do clique está coberto por outra janela. Nenhuma entrada foi enviada.' }
  [SapInputNative]::Click()
} elseif ($actionKind -eq 'type_text') {
  [SapInputNative]::Type($actionText, $handle)
} elseif ($actionKind -eq 'press_key') {
  if ([SapInputNative]::GetForegroundWindow() -ne $handle) { throw 'A janela SAP perdeu o foco antes da tecla.' }
  $keys = @{ TAB = 9; ENTER = 13; ESC = 27; BACKSPACE = 8; LEFT = 37; UP = 38; RIGHT = 39; DOWN = 40; PAGEUP = 33; PAGEDOWN = 34; F5 = 116; F6 = 117; F7 = 118; F8 = 119 }
  if ($actionKey -eq 'CTRL+A') { [SapInputNative]::SelectAll() }
  else { [SapInputNative]::Key([byte]$keys[$actionKey]) }
}
`

export async function performSapControl(userId: string, action: SapControlAction,
  confirm: (description: string) => Promise<boolean>, signal?: AbortSignal, captureId?: string): Promise<string> {
  if (process.platform !== 'win32') throw new Error('O controle SAP está disponível apenas no Windows.')
  if (controlBusy) throw new Error('Já existe uma ação SAP em andamento neste computador.')
  action = validateSapControlAction(action)
  controlBusy = true
  try {
    const settings = await readSapWindowSettings(userId)
    if (!settings.enabled || settings.controlMode === 'off' || !settings.sessionId || !settings.sessionIdentity) throw new Error('Ative o controle e escolha uma janela SAP nas configurações.')
    const scan = await scanSapWindows()
    const selected = scan.windows.find((window) => window.id === settings.sessionId && String(window.processId) === settings.sessionIdentity)
    if (!selected) throw new Error('A janela SAP escolhida não está mais disponível.')
    const frame = controlFrames.get(userId)
    if (!captureId || !frame || frame.captureId !== captureId || frame.window.id !== selected.id ||
        frame.window.processId !== selected.processId || Date.now() - frame.createdAt > 5 * 60_000) {
      throw new Error('A captura SAP está desatualizada. Capture a janela novamente antes de agir.')
    }
    const point = action.kind === 'click' ? mapSapCapturePoint(action.x!, action.y!, frame.width, frame.height, frame.bounds) : null
    const detail = action.kind === 'type_text' ? `Digitar exatamente este texto na janela "${selected.title}":\n\n${action.text}`
      : action.kind === 'click' ? `Clicar na janela "${selected.title}" em pixel ${action.x} × ${action.y} da captura ${frame.width} × ${frame.height}.`
        : `Pressionar ${action.key} na janela "${selected.title}".`
    if (sapActionNeedsApproval(settings.controlMode, action) && !await confirm(detail + (settings.controlMode === 'automatic' ? '\n\nEsta ação pode alterar dados ou tem efeito incerto.' : ''))) throw new Error('Ação SAP cancelada pelo usuário.')
    if (signal?.aborted) throw new Error('Ação SAP interrompida.')
    const current = await readSapWindowSettings(userId)
    if (!current.enabled || current.controlMode !== settings.controlMode || current.sessionId !== settings.sessionId ||
      current.sessionIdentity !== settings.sessionIdentity) throw new Error('A configuração SAP mudou antes da ação.')
    const fresh = await scanSapWindows()
    if (!fresh.windows.some((window) => window.id === selected.id && window.processId === selected.processId && window.title === selected.title)) {
      throw new Error('A janela SAP mudou antes da ação. Revise a tela e tente novamente.')
    }
    if (controlFrames.get(userId)?.captureId !== captureId || Date.now() - frame.createdAt > 5 * 60_000) {
      throw new Error('A captura SAP mudou ou expirou durante a aprovação. Nenhuma entrada foi enviada.')
    }
    controlFrames.delete(userId)
    await nativeWorker.run({
      operation: 'input', targetHandle: selected.id.split(':')[1], targetPid: selected.processId,
      action, screenPoint: point, expectedBounds: frame.bounds
    }, signal)
    return `${detail}\nEntrada enviada ao Windows; confirme o resultado pela próxima captura.`
  } finally { controlBusy = false }
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
      controlMode: normalizeSapControlMode(parsed.controlMode) }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ...EMPTY_SETTINGS }
    throw error
  }
}

const pendingSettings = new Set<string>()
/** Full acknowledgement is enforced in main, including for direct IPC callers. */
export async function saveSapWindowSettingsWithApproval(userId: string, value: SapWindowSettings,
  confirmFull: () => Promise<boolean>): Promise<SapWindowSettings> {
  if (pendingSettings.has(userId)) throw new Error('Aguarde a configuração SAP em andamento.')
  pendingSettings.add(userId)
  try {
    const previous = await readSapWindowSettings(userId)
    if (value.controlMode === 'full' && (previous.controlMode !== 'full' || previous.sessionId !== value.sessionId ||
        previous.sessionIdentity !== value.sessionIdentity || !previous.enabled) && !await confirmFull()) return previous
    return await saveSapWindowSettings(userId, value)
  } finally { pendingSettings.delete(userId) }
}

async function saveSapWindowSettings(userId: string, value: SapWindowSettings): Promise<SapWindowSettings> {
  const file = fileFor(userId)
  if (value.version !== 1 || typeof value.enabled !== 'boolean' ||
      (value.sessionId !== null && !WINDOW_PATTERN.test(value.sessionId)) ||
      (value.sessionIdentity !== null && !/^\d{1,10}$/.test(value.sessionIdentity)) ||
      (value.sessionId !== null && !value.sessionIdentity) ||
      !['off', 'basic', 'automatic', 'full'].includes(value.controlMode) ||
      (!value.enabled && value.controlMode !== 'off') || (value.controlMode !== 'off' && !value.sessionId)) throw new Error('Configuração SAP inválida.')
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

const inputDefinition = INPUT_SCRIPT.slice(0, INPUT_SCRIPT.indexOf('$handle ='))
const inputBody = INPUT_SCRIPT.slice(INPUT_SCRIPT.indexOf('$handle ='))
const scanDefinition = WINDOWS_SCRIPT.slice(0, WINDOWS_SCRIPT.indexOf('$processes ='))
const scanBody = WINDOWS_SCRIPT.slice(WINDOWS_SCRIPT.indexOf('$processes ='))
const NATIVE_WORKER_SCRIPT = inputDefinition + scanDefinition + String.raw`
[SapInputNative]::PhysicalCoordinates()
function Read-SapWindows {
` + scanBody + String.raw`
}
while ($null -ne ($requestLine = [Console]::In.ReadLine())) {
  $request = $null
  try {
    $request = ConvertFrom-Json -InputObject $requestLine
    if ($request.operation -eq 'scan') {
      $result = Read-SapWindows
    } elseif ($request.operation -eq 'capture') {
      $result = [SapInputNative]::Capture([IntPtr]::new([long]$request.targetHandle), [uint32]$request.targetPid)
    } elseif ($request.operation -eq 'input') {
      $targetHandle = [long]$request.targetHandle
      $targetPid = [uint32]$request.targetPid
      $actionKind = [string]$request.action.kind
      $screenX = [int]$request.screenPoint.x
      $screenY = [int]$request.screenPoint.y
      $expectedLeft = [int]$request.expectedBounds.left
      $expectedTop = [int]$request.expectedBounds.top
      $expectedWidth = [int]$request.expectedBounds.width
      $expectedHeight = [int]$request.expectedBounds.height
      $actionText = [string]$request.action.text
      $actionKey = [string]$request.action.key
` + inputBody + String.raw`
      Start-Sleep -Milliseconds 250
      $result = 'Entrada enviada ao Windows.'
    } else { throw 'Operação SAP inválida.' }
    $reply = @{ id = $request.id; ok = $true; result = $result }
  } catch {
    $reply = @{ id = $request.id; ok = $false; error = $_.Exception.Message }
  }
  [Console]::Out.WriteLine((ConvertTo-Json -InputObject $reply -Depth 6 -Compress))
  [Console]::Out.Flush()
}
`
const nativeWorker = new SapNativeWorker(NATIVE_WORKER_SCRIPT)
app.on('before-quit', () => nativeWorker.close())

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
  let result: unknown
  try { result = JSON.parse(String(await nativeWorker.run({ operation: 'scan' }))) }
  catch { return { windows: [], processCount: 0, message: 'Não foi possível enumerar as janelas SAP. Confira se o SAP GUI está aberto no mesmo desktop do Abapfy.' } }
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
  if (!settings.enabled || !settings.sessionId) throw new Error('Ative o contexto SAP e escolha uma janela em Configurações → Computer use · SAP.')
  const scan = await scanSapWindows()
  const selected = scan.windows.find((window) => window.id === settings.sessionId && String(window.processId) === settings.sessionIdentity)
  if (!selected) throw new Error('A janela SAP escolhida não está mais disponível. Atualize a lista e selecione-a novamente.')
  const raw = await nativeWorker.run({ operation: 'capture', targetHandle: selected.id.split(':')[1], targetPid: selected.processId })
  if (!raw || typeof raw !== 'object') throw new Error('Captura SAP inválida.')
  const data = raw as Record<string, unknown>
  if (typeof data.pngBase64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(data.pngBase64) ||
      Buffer.byteLength(data.pngBase64, 'base64') > 6 * 1024 * 1024 ||
      ![data.width, data.height, data.left, data.top, data.windowWidth, data.windowHeight].every(Number.isInteger) ||
      Number(data.width) < 400 || Number(data.height) < 250 || Number(data.width) > 2048 || Number(data.height) > 1536 ||
      Number(data.windowWidth) < Number(data.width) || Number(data.windowHeight) < Number(data.height) ||
      (data.changeRatio !== null && (typeof data.changeRatio !== 'number' || data.changeRatio < 0 || data.changeRatio > 1))) {
    throw new Error('A captura ou geometria SAP retornou dados inválidos.')
  }
  const current = await readSapWindowSettings(userId)
  if (!current.enabled || current.sessionId !== settings.sessionId || current.sessionIdentity !== settings.sessionIdentity) {
    throw new Error('A configuração da captura SAP mudou durante a leitura. Tente novamente.')
  }
  const captureId = randomUUID()
  const width = Number(data.width), height = Number(data.height)
  controlFrames.set(userId, {
    captureId, width, height, window: selected, createdAt: Date.now(),
    bounds: { left: Number(data.left), top: Number(data.top), width: Number(data.windowWidth), height: Number(data.windowHeight) }
  })
  return {
    captureId, window: selected, imageDataUrl: `data:image/png;base64,${data.pngBase64}`,
    width, height, changeRatio: data.changeRatio as number | null
  }
}
