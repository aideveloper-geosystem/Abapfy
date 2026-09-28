import { app, safeStorage } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

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

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ENV_PATTERN = /^(?:Bearer )?\$\{[A-Za-z_][A-Za-z0-9_]*\}$/
type StoredValue = string | { encrypted: string }
type StoredServerConfig = Omit<McpLocalServerConfig, 'env' | 'headers'> & {
  env?: Record<string, StoredValue>
  headers?: Record<string, StoredValue>
}
const writeQueues = new Map<string, Promise<void>>()

async function serializeWrite<T>(userId: string, task: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(userId) ?? Promise.resolve()
  let release: () => void = () => undefined
  const next = new Promise<void>((resolve) => { release = resolve })
  writeQueues.set(userId, next)
  await previous
  try { return await task() }
  finally { release(); if (writeQueues.get(userId) === next) writeQueues.delete(userId) }
}

function assertId(id: string): void {
  if (!ID_PATTERN.test(id)) throw new Error('Identificador MCP inválido.')
}

function fileFor(userId: string): string {
  assertId(userId)
  return join(app.getPath('userData'), 'mcp', `${userId}.json`)
}

function stringMap(value: unknown): Record<string, string> {
  if (value === undefined) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Mapa MCP inválido.')
  const entries = Object.entries(value)
  if (entries.length > 50) throw new Error('Há entradas demais na configuração MCP.')
  const mapped: Record<string, string> = {}
  for (const [key, entry] of entries) {
    if (!/^[A-Za-z_][A-Za-z0-9_-]{0,99}$/.test(key) || typeof entry !== 'string' || entry.length > 2000) {
      throw new Error('Nome ou valor de variável MCP inválido.')
    }
    mapped[key] = entry
  }
  return mapped
}

function cleanConfig(value: McpLocalServerConfig): McpLocalServerConfig {
  if (!value || typeof value !== 'object') throw new Error('Configuração MCP inválida.')
  const result: McpLocalServerConfig = {}
  for (const field of ['cwd', 'profile'] as const) {
    const entry = value[field]
    if (entry !== undefined) {
      if (typeof entry !== 'string' || entry.length > 2048) throw new Error(`Campo ${field} inválido.`)
      result[field] = entry.trim()
    }
  }
  for (const field of ['disabledTools'] as const) {
    const entry = value[field]
    if (entry !== undefined) {
      if (!Array.isArray(entry) || entry.length > 100 || entry.some((item) => typeof item !== 'string' || item.length > 2000)) {
        throw new Error(`Campo ${field} inválido.`)
      }
      result[field] = entry
    }
  }
  result.env = stringMap(value.env)
  result.headers = stringMap(value.headers)
  return result
}

function secretsAvailable(): boolean {
  return safeStorage.isEncryptionAvailable() && (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text')
}

function decryptMap(value: Record<string, StoredValue> | undefined): Record<string, string> {
  const mapped: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value ?? {})) {
    if (typeof entry === 'string') mapped[key] = entry
    else if (entry && typeof entry.encrypted === 'string') {
      if (!secretsAvailable()) throw new Error('Proteção de segredos não disponível neste sistema.')
      mapped[key] = safeStorage.decryptString(Buffer.from(entry.encrypted, 'base64'))
    } else throw new Error('Valor protegido MCP inválido.')
  }
  return mapped
}

function encryptMap(value: Record<string, string> | undefined): Record<string, StoredValue> {
  const mapped: Record<string, StoredValue> = {}
  for (const [key, entry] of Object.entries(value ?? {})) {
    if (ENV_PATTERN.test(entry)) mapped[key] = entry
    else {
      if (!secretsAvailable()) throw new Error('Proteção de segredos não disponível neste sistema.')
      mapped[key] = { encrypted: safeStorage.encryptString(entry).toString('base64') }
    }
  }
  return mapped
}

export async function readMcpLocalConfig(userId: string): Promise<McpLocalConfig> {
  const file = fileFor(userId)
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as { version: number; servers: Record<string, StoredServerConfig>; catalog?: McpLocalConfig['catalog'] }
    if (parsed.version !== 1 || !parsed.servers || typeof parsed.servers !== 'object' || Array.isArray(parsed.servers)) {
      throw new Error('Arquivo de configurações MCP inválido.')
    }
    const servers: Record<string, McpLocalServerConfig> = {}
    for (const [id, config] of Object.entries(parsed.servers)) {
      assertId(id)
      servers[id] = cleanConfig({ ...config, env: decryptMap(config.env), headers: decryptMap(config.headers) })
    }
    const catalog = parsed.catalog && typeof parsed.catalog === 'object'
      && Array.isArray(parsed.catalog.servers) && Array.isArray(parsed.catalog.bindings)
      ? parsed.catalog : { servers: [], bindings: [] }
    return { version: 1, servers, catalog }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, servers: {}, catalog: { servers: [], bindings: [] } }
    throw error
  }
}

export async function saveMcpLocalServerConfig(userId: string, serverId: string, config: McpLocalServerConfig | null): Promise<McpLocalConfig> {
  assertId(serverId)
  return serializeWrite(userId, async () => {
    const next = await readMcpLocalConfig(userId)
    if (config === null) delete next.servers[serverId]
    else next.servers[serverId] = cleanConfig(config)
    await writeConfig(userId, next)
    return next
  })
}

export async function saveMcpLocalCatalog(userId: string, catalog: McpLocalConfig['catalog']): Promise<McpLocalConfig> {
  return serializeWrite(userId, async () => {
    if (!catalog || !Array.isArray(catalog.servers) || !Array.isArray(catalog.bindings) || catalog.servers.length > 300 || catalog.bindings.length > 3000) {
      throw new Error('Catálogo MCP local inválido.')
    }
    const next = await readMcpLocalConfig(userId)
    next.catalog = {
      servers: catalog.servers.map((server) => {
        assertId(server.id)
        if (!['streamable_http', 'stdio'].includes(server.transport) || !Array.isArray(server.args) || server.args.some((arg) => typeof arg !== 'string')) throw new Error('Servidor MCP local inválido.')
        return { id: server.id, slug: String(server.slug).slice(0, 150), name: String(server.name).slice(0, 200), transport: server.transport,
          url: server.url ? String(server.url).slice(0, 2048) : null, command: server.command ? String(server.command).slice(0, 2048) : null,
          args: server.args.slice(0, 100).map((arg) => arg.slice(0, 2000)), enabled: Boolean(server.enabled) }
      }),
      bindings: catalog.bindings.map((binding) => {
        assertId(binding.serverId)
        return { serverId: binding.serverId, agentSource: String(binding.agentSource).slice(0, 20), agentId: String(binding.agentId).slice(0, 200), enabled: Boolean(binding.enabled) }
      })
    }
    await writeConfig(userId, next)
    return next
  })
}

async function writeConfig(userId: string, next: McpLocalConfig): Promise<void> {
  const file = fileFor(userId)
  await mkdir(join(app.getPath('userData'), 'mcp'), { recursive: true })
  const temporary = `${file}.${randomUUID()}.tmp`
  const stored = {
    version: 1,
    catalog: next.catalog,
    servers: Object.fromEntries(Object.entries(next.servers).map(([id, value]) => [id, {
      ...value,
      env: encryptMap(value.env),
      headers: encryptMap(value.headers)
    }]))
  }
  await writeFile(temporary, JSON.stringify(stored, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 })
  await rename(temporary, file)
}
