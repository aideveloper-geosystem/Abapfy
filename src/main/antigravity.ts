import { app, ipcMain, type BrowserWindow } from 'electron'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  ANTIGRAVITY_MODEL_PATTERN,
  type AntigravityAskRequest,
  type AntigravityAskResult,
  type AntigravityModel,
  type AntigravityPreferences,
  type AntigravityQuotaGroup,
  type AntigravityStatus,
  type AntigravityUsage
} from '../shared/antigravity'

/**
 * Integração com o Antigravity IDE usando o login do próprio IDE.
 *
 * O IDE mantém um daemon local (language_server) já autenticado. Aqui só falamos com
 * ele: nenhum token de conta é lido, copiado ou salvo. A porta e o token CSRF do
 * daemon nunca saem do processo principal.
 */

const ANTIGRAVITY_HOME = join(homedir(), '.gemini', 'antigravity')
const DAEMON_DIR = join(ANTIGRAVITY_HOME, 'daemon')
const BRAIN_DIR = join(ANTIGRAVITY_HOME, 'brain')
const AGENTAPI_BAT = join(ANTIGRAVITY_HOME, 'bin', 'agentapi.bat')
const RPC_BASE = '/exa.language_server_pb.LanguageServerService/'
const CONVERSATION_TITLE = 'Abapfy'
// CreateProcess aceita ~32.7k caracteres na linha de comando; acima disso o prompt vai por arquivo.
const INLINE_PROMPT_LIMIT = 24_000
const MAX_PROMPT_CHARS = 1_500_000
const DEFAULT_TIMEOUT_MS = 300_000
const MAX_TIMEOUT_MS = 900_000
const POLL_MS = 700
const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/

interface Hub {
  httpPort: number
  csrfToken: string
  lsVersion?: string
}

interface ModelConfig {
  modelId?: unknown
  label?: unknown
  quotaInfo?: { remainingFraction?: unknown; resetTime?: unknown }
}

const usage: AntigravityUsage = {
  requests: 0,
  inputTokens: 0,
  outputTokens: 0,
  since: new Date().toISOString()
}
const running = new Map<string, AbortController>()
let preferenceQueue: Promise<unknown> = Promise.resolve()

function languageServerPath(): string | null {
  let candidate: string | null = null
  try {
    // O agentapi.bat criado pelo IDE aponta para o language_server realmente instalado.
    const text = readFileSync(AGENTAPI_BAT, 'utf8')
    candidate = /"([^"\r\n]*language_server\.exe)"/i.exec(text)?.[1] ?? null
  } catch {
    candidate = null
  }
  const fallback = join(
    process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'),
    'Programs',
    'Antigravity',
    'resources',
    'bin',
    'language_server.exe'
  )
  for (const path of [candidate, fallback]) if (path && existsSync(path)) return path
  return null
}

async function readHubs(): Promise<Hub[]> {
  let names: string[]
  try {
    names = (await readdir(DAEMON_DIR)).filter((name) => /^hub_\d+\.json$/.test(name))
  } catch {
    return []
  }
  const rows = await Promise.all(
    names.map(async (name): Promise<{ modified: number; hub: Hub } | null> => {
      try {
        const file = join(DAEMON_DIR, name)
        const [text, info] = await Promise.all([readFile(file, 'utf8'), stat(file)])
        const json = JSON.parse(text) as Record<string, unknown>
        const port = json.httpPort
        const token = json.csrfToken
        if (!Number.isInteger(port) || (port as number) < 1 || (port as number) > 65535) return null
        if (typeof token !== 'string' || !token) return null
        return {
          modified: info.mtimeMs,
          hub: {
            httpPort: port as number,
            csrfToken: token,
            lsVersion: typeof json.lsVersion === 'string' ? json.lsVersion : undefined
          }
        }
      } catch {
        return null
      }
    })
  )
  // Daemons de execuções anteriores deixam hub_*.json velhos: o mais recente primeiro.
  return rows
    .filter((row): row is { modified: number; hub: Hub } => row !== null)
    .sort((a, b) => b.modified - a.modified)
    .map((row) => row.hub)
}

async function rpc(hub: Hub, method: string, body: unknown, timeoutMs = 6000): Promise<unknown> {
  const response = await fetch(`http://127.0.0.1:${hub.httpPort}${RPC_BASE}${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Connect-Protocol-Version': '1',
      'X-Codeium-Csrf-Token': hub.csrfToken
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

function familyOf(modelId: string): { key: string; label: string } {
  if (modelId.startsWith('gemini-')) return { key: 'gemini', label: 'Gemini' }
  if (modelId.startsWith('claude-')) return { key: 'claude', label: 'Claude' }
  return { key: 'other', label: 'Outros modelos' }
}

function parseModels(configs: ModelConfig[]): {
  models: AntigravityModel[]
  quota: AntigravityQuotaGroup[]
} {
  const models: AntigravityModel[] = []
  const groups = new Map<string, AntigravityQuotaGroup>()
  for (const config of configs) {
    if (typeof config.modelId !== 'string') continue
    const family = familyOf(config.modelId)
    const usable = family.key === 'gemini' && !config.modelId.includes('orchestrator')
    if (usable && ANTIGRAVITY_MODEL_PATTERN.test(config.modelId)) {
      models.push({
        id: config.modelId,
        label: typeof config.label === 'string' && config.label ? config.label : config.modelId
      })
    }
    const fraction =
      typeof config.quotaInfo?.remainingFraction === 'number' &&
      Number.isFinite(config.quotaInfo.remainingFraction)
        ? Math.min(1, Math.max(0, config.quotaInfo.remainingFraction))
        : null
    const reset =
      typeof config.quotaInfo?.resetTime === 'string' ? config.quotaInfo.resetTime : null
    const current = groups.get(family.key)
    if (!current) {
      groups.set(family.key, {
        key: family.key,
        label: family.label,
        remainingFraction: fraction,
        resetTime: reset,
        usableInAbapfy: family.key === 'gemini'
      })
    } else if (
      fraction !== null &&
      (current.remainingFraction === null || fraction < current.remainingFraction)
    ) {
      // A cota é compartilhada pela família; em caso de divergência vale a menor.
      current.remainingFraction = fraction
      current.resetTime = reset
    }
  }
  const order = ['gemini', 'claude', 'other']
  return {
    models,
    quota: [...groups.values()].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
  }
}

function unavailable(reason: string): AntigravityStatus {
  return {
    available: false,
    reason,
    models: [],
    quota: [],
    usage: { ...usage },
    checkedAt: new Date().toISOString()
  }
}

async function probe(): Promise<{ hub: Hub; status: AntigravityStatus } | { reason: string }> {
  if (!languageServerPath())
    return { reason: 'Antigravity IDE não encontrado neste computador. Instale e faça login no IDE.' }
  const hubs = await readHubs()
  if (!hubs.length)
    return { reason: 'O Antigravity IDE não está em execução. Abra o IDE e faça login.' }
  let lastError = ''
  for (const hub of hubs) {
    try {
      const data = (await rpc(hub, 'GetUserStatus', {
        metadata: { ideName: 'antigravity', extensionName: 'antigravity', locale: 'en' }
      })) as {
        userStatus?: {
          planStatus?: { planInfo?: { planName?: unknown } }
          cascadeModelConfigData?: { clientModelConfigs?: ModelConfig[] }
        }
      }
      const user = data.userStatus
      let configs = user?.cascadeModelConfigData?.clientModelConfigs
      if (!Array.isArray(configs)) {
        const fallback = (await rpc(hub, 'GetCascadeModelConfigData', {})) as {
          clientModelConfigs?: ModelConfig[]
        }
        configs = fallback.clientModelConfigs
      }
      if (!Array.isArray(configs) || !configs.length)
        return { reason: 'O IDE respondeu, mas não há modelos liberados. Confira o login no Antigravity.' }
      const { models, quota } = parseModels(configs)
      const plan = user?.planStatus?.planInfo?.planName
      return {
        hub,
        status: {
          available: true,
          lsVersion: hub.lsVersion,
          plan: typeof plan === 'string' ? plan : undefined,
          models,
          quota,
          usage: { ...usage },
          checkedAt: new Date().toISOString()
        }
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
  }
  return {
    reason: `O Antigravity IDE não respondeu (${lastError || 'sem resposta'}). Reinicie o IDE e confira o login.`
  }
}

export async function antigravityStatus(): Promise<AntigravityStatus> {
  const result = await probe()
  return 'status' in result ? result.status : unavailable(result.reason)
}

interface TranscriptStep {
  type?: string
  status?: string
  content?: string
  model?: string
  input_tokens?: number
  output_tokens?: number
  tool_calls?: unknown[]
}

function parseTranscript(text: string): TranscriptStep[] {
  const steps: TranscriptStep[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      steps.push(JSON.parse(line) as TranscriptStep)
    } catch {
      // Linha ainda sendo gravada: será lida no próximo ciclo.
    }
  }
  return steps
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason)
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function startConversation(
  exe: string,
  hub: Hub,
  model: string,
  prompt: string,
  signal: AbortSignal
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Sem shell: o texto do usuário nunca é interpretado por cmd.exe.
    const child = spawn(
      exe,
      [
        'agentapi',
        'new-conversation',
        `--model=${model}`,
        `--title=${CONVERSATION_TITLE}`,
        prompt.startsWith('-') ? `Pedido:\n${prompt}` : prompt
      ],
      {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ANTIGRAVITY_LS_ADDRESS: `127.0.0.1:${hub.httpPort}`,
          ANTIGRAVITY_CSRF_TOKEN: hub.csrfToken
        }
      }
    )
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      child.kill()
    }, 45_000)
    const onAbort = (): void => {
      child.kill()
    }
    signal.addEventListener('abort', onAbort, { once: true })
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString('utf8')))
    child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString('utf8')))
    child.on('error', (error) => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      reject(new Error(`Não foi possível iniciar o agentapi: ${error.message}`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      if (signal.aborted) return reject(signal.reason)
      const id = (() => {
        try {
          return (JSON.parse(out) as { response?: { newConversation?: { conversationId?: unknown } } })
            .response?.newConversation?.conversationId
        } catch {
          return undefined
        }
      })()
      if (code === 0 && typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)) return resolve(id)
      reject(
        new Error(
          `O Antigravity recusou o pedido (código ${code ?? 'desconhecido'}): ${(err || out).trim().slice(0, 300) || 'sem detalhes'}`
        )
      )
    })
  })
}

async function waitForAnswer(
  conversationId: string,
  signal: AbortSignal,
  deadline: number
): Promise<{ steps: TranscriptStep[]; final: TranscriptStep }> {
  const file = join(BRAIN_DIR, conversationId, '.system_generated', 'logs', 'transcript.jsonl')
  while (Date.now() < deadline) {
    await sleep(POLL_MS, signal)
    let text: string
    try {
      text = await readFile(file, 'utf8')
    } catch {
      continue
    }
    const steps = parseTranscript(text)
    const failed = steps.find((step) => /ERROR|CANCEL/i.test(`${step.status ?? ''} ${step.type ?? ''}`))
    if (failed)
      throw new Error(
        `O Antigravity interrompeu a resposta${failed.content ? `: ${failed.content.slice(0, 300)}` : '.'}`
      )
    const last = steps.at(-1)
    if (
      last?.type === 'PLANNER_RESPONSE' &&
      last.status === 'DONE' &&
      !(Array.isArray(last.tool_calls) && last.tool_calls.length)
    )
      return { steps, final: last }
  }
  throw new Error('Tempo esgotado aguardando a resposta do Antigravity.')
}

async function askAntigravity(request: AntigravityAskRequest): Promise<AntigravityAskResult> {
  if (
    !request ||
    typeof request.requestId !== 'string' ||
    !REQUEST_ID_PATTERN.test(request.requestId)
  )
    throw new Error('Identificador de chamada inválido.')
  if (typeof request.model !== 'string' || !ANTIGRAVITY_MODEL_PATTERN.test(request.model))
    throw new Error('Somente modelos Gemini do Antigravity são permitidos.')
  if (
    typeof request.prompt !== 'string' ||
    !request.prompt.trim() ||
    request.prompt.length > MAX_PROMPT_CHARS
  )
    throw new Error('Prompt vazio ou grande demais para o Antigravity.')
  if (running.has(request.requestId)) throw new Error('Chamada já em andamento.')
  const timeoutMs = Math.min(
    MAX_TIMEOUT_MS,
    Math.max(10_000, Number.isFinite(request.timeoutMs) ? Number(request.timeoutMs) : DEFAULT_TIMEOUT_MS)
  )

  const controller = new AbortController()
  running.set(request.requestId, controller)
  let promptFile: string | null = null
  try {
    const found = await probe()
    if (!('hub' in found)) throw new Error(found.reason)
    // Um slug inexistente cai silenciosamente no tier flash: só aceitamos o que o IDE lista.
    if (!found.status.models.some((model) => model.id === request.model))
      throw new Error(`O modelo ${request.model} não está liberado no Antigravity desta conta.`)
    const exe = languageServerPath()
    if (!exe) throw new Error('Antigravity IDE não encontrado neste computador.')

    let argvPrompt = request.prompt
    if (request.prompt.length > INLINE_PROMPT_LIMIT) {
      promptFile = join(app.getPath('temp'), `abapfy-antigravity-${randomUUID()}.txt`)
      await writeFile(promptFile, request.prompt, { encoding: 'utf8', mode: 0o600 })
      argvPrompt = `Leia integralmente o arquivo ${promptFile}, paginando até a última linha, e cumpra exatamente as instruções que ele contém. Não use outras ferramentas nem altere arquivos. Responda somente com o que o arquivo pedir.`
    }

    const deadline = Date.now() + timeoutMs
    const conversationId = await startConversation(
      exe,
      found.hub,
      request.model,
      argvPrompt,
      controller.signal
    )
    const { steps, final } = await waitForAnswer(conversationId, controller.signal, deadline)
    const planner = steps.filter((step) => step.type === 'PLANNER_RESPONSE')
    const sum = (field: 'input_tokens' | 'output_tokens'): number =>
      planner.reduce((total, step) => total + (Number.isFinite(step[field]) ? Number(step[field]) : 0), 0)
    const inputTokens = sum('input_tokens')
    const outputTokens = sum('output_tokens')
    usage.requests += 1
    usage.inputTokens += inputTokens
    usage.outputTokens += outputTokens
    return {
      content: final.content ?? '',
      modelUsed: final.model ?? request.model,
      inputTokens,
      outputTokens,
      conversationId
    }
  } finally {
    running.delete(request.requestId)
    if (promptFile) void unlink(promptFile).catch(() => undefined)
  }
}

function preferenceFile(userId: string): string {
  if (typeof userId !== 'string' || !USER_ID_PATTERN.test(userId))
    throw new Error('Identificador de usuário inválido.')
  return join(app.getPath('userData'), 'antigravity', `${userId}.json`)
}

function cleanPreferences(value: unknown): AntigravityPreferences {
  const row = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  return {
    enabled: row.enabled === true,
    model:
      typeof row.model === 'string' && ANTIGRAVITY_MODEL_PATTERN.test(row.model) ? row.model : null
  }
}

async function readPreferences(userId: string): Promise<AntigravityPreferences> {
  try {
    return cleanPreferences(JSON.parse(await readFile(preferenceFile(userId), 'utf8')))
  } catch {
    return { enabled: false, model: null }
  }
}

function writePreferences(
  userId: string,
  preferences: AntigravityPreferences
): Promise<AntigravityPreferences> {
  const next = cleanPreferences(preferences)
  const task = preferenceQueue.then(async () => {
    const file = preferenceFile(userId)
    await mkdir(join(app.getPath('userData'), 'antigravity'), { recursive: true })
    const temporary = `${file}.${randomUUID()}.tmp`
    await writeFile(temporary, JSON.stringify(next), 'utf8')
    await rename(temporary, file)
    return next
  })
  preferenceQueue = task.catch(() => undefined)
  return task
}

export function registerAntigravityIpc(getWindow: () => BrowserWindow | null): void {
  const guard = (event: Electron.IpcMainInvokeEvent): void => {
    const window = getWindow()
    if (!window || event.sender !== window.webContents)
      throw new Error('Janela não autorizada para usar o Antigravity.')
  }
  ipcMain.handle('antigravity:status', (event) => {
    guard(event)
    return antigravityStatus()
  })
  ipcMain.handle('antigravity:getPreferences', (event, userId: string) => {
    guard(event)
    return readPreferences(userId)
  })
  ipcMain.handle('antigravity:setPreferences', (event, userId: string, value: unknown) => {
    guard(event)
    return writePreferences(userId, cleanPreferences(value))
  })
  ipcMain.handle('antigravity:ask', (event, request: AntigravityAskRequest) => {
    guard(event)
    return askAntigravity(request)
  })
  ipcMain.handle('antigravity:cancel', (event, requestId: string) => {
    guard(event)
    running.get(requestId)?.abort(new DOMException('Cancelado', 'AbortError'))
  })
}

export function closeAntigravity(): void {
  for (const controller of running.values()) controller.abort(new DOMException('Encerrado', 'AbortError'))
  running.clear()
}
