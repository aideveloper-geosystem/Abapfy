import { app } from 'electron'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { CompatibilityCallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'

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

interface ConnectedServer {
  signature: string
  client: Client
}

const clients = new Map<string, ConnectedServer>()
const toolConfirmations = new Map<string, boolean>()
// Chamadas em andamento (tools/call ou resources/read) indexadas pelo callId
// gerado no renderer — permite cancelar de verdade quando o usuário aborta a
// resposta no meio de uma ferramenta MCP, em vez de deixar rodando até o timeout.
const pendingCalls = new Map<string, AbortController>()
const WRITE_TOOL_PATTERN =
  /(^|_)(create|update|delete|remove|write|edit|activate|release|transport|import|deploy|execute|run|apply|commit|push|generate|refactor|rename|move|lock|unlock)(_|$)/i
const READ_TOOL_PATTERN =
  /(^|_)(search|fetch|get|list|read|find|inspect|describe|status|health|validate|check|compare|analyze|query|discover|lookup|details|matrix|diff|service)(_|$)/i

const CONNECT_TIMEOUT_MS = 20_000
const CALL_TIMEOUT_MS = 45_000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Tempo esgotado (${Math.round(ms / 1000)}s) aguardando ${label}. O servidor MCP pode estar travado ou inacessível.`)),
      ms
    )
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

function signature(config: McpServerConfig): string {
  return JSON.stringify([config.transport, config.url, config.command, config.args, config.cwd, config.env, config.headers])
}

function resolveVariables(value: string): string {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, key: string) => {
    const resolved = process.env[key]
    if (!resolved) throw new Error(`Variável de ambiente ${key} não configurada para o MCP.`)
    return resolved
  })
}

function platformCommand(command: string): string {
  if (process.platform === 'win32') {
    if (command === 'npx') return 'npx.cmd'
    if (command === 'sap-devs') return 'sap-devs.exe'
  } else {
    if (command === 'npx.cmd') return 'npx'
    if (command === 'sap-devs.exe') return 'sap-devs'
  }
  return command
}

function validateConfig(config: McpServerConfig): void {
  if (config.transport === 'streamable_http') {
    if (!config.url) throw new Error('Servidor MCP HTTP sem URL.')
    const url = new URL(config.url)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('A URL MCP deve usar HTTP ou HTTPS.')
    }
    if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      throw new Error('Servidores MCP remotos precisam usar HTTPS.')
    }
    return
  }

  if (!config.command) throw new Error('Servidor MCP stdio sem comando.')
  if (config.command.length > 2048 || /[\r\n\0]/.test(config.command)) throw new Error('Comando MCP stdio inválido.')
}

async function connect(config: McpServerConfig): Promise<Client> {
  validateConfig(config)
  const nextSignature = signature(config)
  const cached = clients.get(config.id)
  if (cached?.signature === nextSignature) return cached.client
  if (cached) {
    await cached.client.close().catch(() => undefined)
    clients.delete(config.id)
    for (const key of toolConfirmations.keys()) if (key.startsWith(`${config.id}:`)) toolConfirmations.delete(key)
  }

  const client = new Client({ name: 'abapfy', version: app.getVersion() })
  const transport =
    config.transport === 'streamable_http'
      ? new StreamableHTTPClientTransport(new URL(config.url!), {
          requestInit: { headers: Object.fromEntries(Object.entries(config.headers ?? {}).map(([key, value]) => [key, resolveVariables(value)])) }
        })
      : new StdioClientTransport({
          command: platformCommand(config.command!),
          args: config.args,
          ...(config.cwd ? { cwd: config.cwd } : {}),
          ...(config.env ? { env: { ...getDefaultEnvironment(), ...Object.fromEntries(Object.entries(config.env).map(([key, value]) => [key, resolveVariables(value)])) } } : {}),
          stderr: 'pipe'
        })

  try {
    await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS, `conexão com ${config.name}`)
  } catch (error) {
    await client.close().catch(() => undefined)
    throw error
  }
  clients.set(config.id, { signature: nextSignature, client })
  return client
}

function requiresConfirmation(tool: {
  name: string
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean }
}): boolean {
  if (tool.annotations?.destructiveHint === true) return true
  if (WRITE_TOOL_PATTERN.test(tool.name)) return true
  return !(tool.annotations?.readOnlyHint === true && READ_TOOL_PATTERN.test(tool.name))
}

function compactToolName(serverId: string, toolName: string): string {
  const safe = toolName.replace(/[^a-zA-Z0-9_-]/g, '_')
  let hash = 0
  for (const character of safe) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  const compact = safe.length > 45 ? `${safe.slice(0, 38)}_${hash.toString(36).slice(0, 6)}` : safe
  return `mcp_${serverId.slice(0, 8)}__${compact}`
}

export async function listMcpTools(configs: McpServerConfig[]): Promise<McpToolInfo[]> {
  const results = await Promise.allSettled(
    configs.map(async (config) => {
      const client = await connect(config)
      const response = await withTimeout(client.listTools(), CALL_TIMEOUT_MS, `lista de ferramentas de ${config.name}`)
      return response.tools.map((tool) => {
        const confirmation = requiresConfirmation(tool)
        toolConfirmations.set(`${config.id}:${tool.name}`, confirmation)
        return {
          qualifiedName: compactToolName(config.id, tool.name),
          serverId: config.id,
          serverName: config.name,
          name: tool.name,
          description: tool.description ?? `Ferramenta ${tool.name} do servidor ${config.name}.`,
          inputSchema: tool.inputSchema as Record<string, unknown>,
          requiresConfirmation: confirmation
        }
      })
    })
  )

  const tools: McpToolInfo[] = []
  const errors: string[] = []
  for (const result of results) {
    if (result.status === 'fulfilled') tools.push(...result.value)
    else errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason))
  }
  if (tools.length === 0 && errors.length > 0) throw new Error(errors.join('\n'))
  return tools
}

export function mcpToolRequiresConfirmation(serverId: string, toolName: string): boolean {
  return toolConfirmations.get(`${serverId}:${toolName}`) ?? true
}

// Aborta uma chamada MCP em andamento (tools/call ou resources/read) pelo
// callId que o renderer gerou. Chamado quando o usuário clica "parar" no chat
// no meio de uma ferramenta ainda rodando.
export function cancelMcpCall(callId: string): void {
  pendingCalls.get(callId)?.abort(new Error('Chamada MCP cancelada pelo usuário.'))
}

async function withCall<T>(
  config: McpServerConfig,
  client: Client,
  callId: string | undefined,
  run: (options: { timeout: number; signal: AbortSignal }) => Promise<T>
): Promise<T> {
  const controller = new AbortController()
  if (callId) pendingCalls.set(callId, controller)
  try {
    return await run({ timeout: CALL_TIMEOUT_MS, signal: controller.signal })
  } catch (error) {
    // Um servidor que travou/estourou o prazo fica com o cliente num estado
    // indefinido — descarta do cache para a próxima chamada reconectar do
    // zero, em vez de repetir o mesmo travamento silenciosamente sempre.
    const cached = clients.get(config.id)
    if (cached?.client === client) {
      clients.delete(config.id)
      void cached.client.close().catch(() => undefined)
    }
    throw error
  } finally {
    if (callId) pendingCalls.delete(callId)
  }
}

export async function callMcpTool(
  config: McpServerConfig,
  toolName: string,
  args: Record<string, unknown>,
  callId?: string
): Promise<unknown> {
  const client = await connect(config)
  // Alguns servidores (incluindo versões do SAP Docs) retornam conteúdo textual
  // útil, mas um structuredContent que não corresponde ao outputSchema anunciado.
  // Client.callTool() rejeita a resposta inteira nesse caso. A chamada request()
  // continua validando o envelope MCP, preserva o retorno original e, sobretudo,
  // evita repetir a execução de uma ferramenta que pode ter efeitos colaterais.
  return withCall(config, client, callId, (options) =>
    client.request(
      { method: 'tools/call', params: { name: toolName, arguments: args } },
      CompatibilityCallToolResultSchema,
      options
    )
  )
}

export async function listMcpResources(configs: McpServerConfig[]): Promise<McpResourceInfo[]> {
  const results = await Promise.allSettled(
    configs.map(async (config) => {
      const client = await connect(config)
      // Nem todo servidor implementa `resources/list` — trata como "sem
      // recursos" em vez de derrubar o loop inteiro por causa de um server
      // que só oferece tools.
      const response = await client
        .listResources(undefined, { timeout: CALL_TIMEOUT_MS })
        .catch(() => ({ resources: [] }))
      return response.resources.map((resource) => ({
        serverId: config.id,
        serverName: config.name,
        uri: resource.uri,
        name: resource.name ?? resource.uri,
        description: resource.description ?? null,
        mimeType: resource.mimeType ?? null
      }))
    })
  )
  return results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
}

export async function readMcpResource(
  config: McpServerConfig,
  uri: string,
  callId?: string
): Promise<unknown> {
  const client = await connect(config)
  return withCall(config, client, callId, (options) =>
    client.readResource({ uri }, options)
  )
}

export async function listMcpPrompts(configs: McpServerConfig[]): Promise<McpPromptInfo[]> {
  const results = await Promise.allSettled(
    configs.map(async (config) => {
      const client = await connect(config)
      const response = await client
        .listPrompts(undefined, { timeout: CALL_TIMEOUT_MS })
        .catch(() => ({ prompts: [] }))
      return response.prompts.map((prompt) => ({
        serverId: config.id,
        serverName: config.name,
        name: prompt.name,
        description: prompt.description ?? null,
        arguments: prompt.arguments ?? []
      }))
    })
  )
  return results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
}

export async function getMcpPrompt(config: McpServerConfig, name: string, args: Record<string, string>): Promise<unknown> {
  const client = await connect(config)
  return withCall(config, client, undefined, (options) => client.getPrompt({ name, arguments: args }, options))
}

export async function closeMcpClients(): Promise<void> {
  await Promise.allSettled([...clients.values()].map(({ client }) => client.close()))
  clients.clear()
  toolConfirmations.clear()
  pendingCalls.forEach((controller) => controller.abort(new Error('Aplicativo fechando.')))
  pendingCalls.clear()
}
