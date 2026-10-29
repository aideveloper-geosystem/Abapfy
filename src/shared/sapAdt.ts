import { z } from 'zod'

export const sapAdtConnectionSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(80),
    baseUrl: z
      .string()
      .trim()
      .max(2048)
      .transform((value, ctx) => {
        try {
          const url = new URL(value)
          if (
            !['https:', 'http:'].includes(url.protocol) ||
            url.username ||
            url.password ||
            url.search ||
            url.hash ||
            !['/', '/sap/bc/adt', '/sap/bc/adt/'].includes(url.pathname)
          )
            throw new Error()
          return url.origin
        } catch {
          ctx.addIssue({
            code: 'custom',
            fatal: true,
            message: 'Informe a URL HTTP/HTTPS do SAP, sem credenciais ou parâmetros.'
          })
          return z.NEVER
        }
      }),
    allowHttp: z.boolean().default(false),
    username: z.string().trim().min(1).max(100),
    client: z.string().regex(/^\d{3}$/, 'Mandante deve ter 3 dígitos.'),
    language: z
      .string()
      .regex(/^[A-Za-z]{2}$/, 'Idioma deve ter 2 letras.')
      .transform((v) => v.toUpperCase()),
    environment: z.enum(['development', 'quality', 'production']),
    enabled: z.boolean(),
    allowSource: z.boolean(),
    allowTables: z.boolean(),
    allowWrite: z.boolean().default(false),
    allowCreate: z.boolean().default(false),
    allowActivate: z.boolean().default(false),
    allowQuality: z.boolean().default(false),
    allowTransports: z.boolean().default(false),
    allowTransportRelease: z.boolean().default(false),
    allowDebug: z.boolean().default(false),
    maxRows: z.number().int().min(1).max(200),
    tables: z
      .array(
        z
          .string()
          .trim()
          .regex(/^(?:\/[A-Za-z0-9_]+\/)?[A-Za-z][A-Za-z0-9_]*$/)
          .max(60)
          .transform((v) => v.toUpperCase())
      )
      .max(100),
    agents: z
      .array(
        z.object({ source: z.enum(['default', 'custom']), id: z.string().min(1).max(200) }).strict()
      )
      .max(200),
    caCertificate: z.string().max(64000).default('')
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.allowWrite || value.allowActivate) && !value.allowSource)
      ctx.addIssue({
        code: 'custom',
        path: ['allowSource'],
        message: 'Edição/ativação exigem permissão de leitura da fonte para revisão.'
      })
    if (value.allowTransportRelease && !value.allowTransports)
      ctx.addIssue({
        code: 'custom',
        path: ['allowTransports'],
        message: 'Liberação exige permissão de gerenciamento de requests.'
      })
    if (value.baseUrl.startsWith('http:') && !value.allowHttp)
      ctx.addIssue({
        code: 'custom',
        path: ['allowHttp'],
        message: 'Confirme o uso de HTTP sem criptografia para este servidor.'
      })
  })
export type SapAdtConnection = z.infer<typeof sapAdtConnectionSchema>
export type SapAdtConnectionView = SapAdtConnection & { hasPassword: boolean }
export interface SapAdtTool {
  qualifiedName: string
  serverId: string
  serverName: string
  name: string
  description: string
  inputSchema: Record<string, unknown>
  requiresConfirmation: boolean
  isSapAdt: true
}
export interface SapAdtTurn {
  id: string
  tools: SapAdtTool[]
  diagnostics?: string[]
}
export interface SapAdtApi {
  stopDebug: (token: string, id: string) => Promise<{ stopped: boolean; warnings: string[] }>
  list: (token: string) => Promise<SapAdtConnectionView[]>
  save: (
    token: string,
    connection: SapAdtConnection,
    password?: string
  ) => Promise<SapAdtConnectionView[]>
  remove: (token: string, id: string) => Promise<SapAdtConnectionView[]>
  setPassword: (token: string, id: string, password: string) => Promise<void>
  test: (token: string, id: string) => Promise<{ ok: true; message: string }>
  beginTurn: (
    token: string,
    agent: { source: 'default' | 'custom'; id: string },
    expectedUserId: string,
    connectionId: string
  ) => Promise<SapAdtTurn>
  callTool: (
    turnId: string,
    qualifiedName: string,
    args: Record<string, unknown>,
    callId: string
  ) => Promise<unknown>
  endTurn: (turnId: string) => Promise<void>
  closeAll: () => Promise<void>
}

export const sapAdtSearchSchema = z
  .object({
    pattern: z.string().trim().min(1).max(100),
    objectType: z
      .string()
      .regex(/^[A-Z][A-Z0-9]{0,9}$/)
      .optional(),
    limit: z.number().int().min(1).max(50).default(20)
  })
  .strict()
export const sapAdtSourceSchema = z
  .object({
    objectPath: z.string().min(1).max(2048),
    sourcePath: z.string().max(2048).transform(sapAdtPath).optional(),
    version: z.enum(['active', 'inactive']).default('active'),
    offset: z.number().int().min(0).max(5_000_000).default(0),
    length: z.number().int().min(1).max(12000).default(12000),
    search: z.string().min(1).max(200).optional()
  })
  .strict()
/** Exact source pages, bounded by JSON size so the tool runtime cannot silently cut them. */
export function sapAdtSourcePage(source: string, input: unknown) {
  const args = sapAdtSourceSchema.parse(input)
  const found = args.search
    ? source.toLowerCase().indexOf(args.search.toLowerCase(), args.offset)
    : args.offset
  if (found < 0)
    return {
      source: '',
      searchFound: false,
      totalLength: source.length,
      hasMore: false,
      nextOffset: null,
      complete: false
    }
  const offset = Math.min(found, source.length)
  let end = Math.min(source.length, offset + args.length)
  while (JSON.stringify(source.slice(offset, end)).length > 18000)
    end = offset + Math.floor((end - offset) * 0.8)
  if (end < source.length && end > offset && /[\uD800-\uDBFF]/.test(source[end - 1]))
    end += end - offset === 1 ? 1 : -1
  const startLine = source.slice(0, offset).split('\n').length
  return {
    source: source.slice(offset, end),
    offset,
    endOffset: end,
    totalLength: source.length,
    startLine,
    endLine: startLine + source.slice(offset, end).split('\n').length - 1,
    totalLines: source.split('\n').length,
    hasMore: end < source.length,
    nextOffset: end < source.length ? end : null,
    complete: offset === 0 && end === source.length,
    ...(args.search ? { searchFound: true } : {})
  }
}
export const sapAdtTableSchema = z
  .object({
    table: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .regex(/^(?:\/[A-Za-z0-9_]+\/)?[A-Za-z][A-Za-z0-9_]*$/),
    columns: z
      .array(
        z
          .string()
          .regex(/^[A-Za-z][A-Za-z0-9_]*$/)
          .max(30)
      )
      .min(1)
      .max(20),
    filters: z
      .array(
        z
          .object({
            column: z
              .string()
              .regex(/^[A-Za-z][A-Za-z0-9_]*$/)
              .max(30),
            value: z
              .string()
              .max(200)
              .refine((v) => [...v].every((character) => character.charCodeAt(0) >= 32))
          })
          .strict()
      )
      .max(10)
      .default([]),
    limit: z.number().int().min(1).max(200).default(20)
  })
  .strict()
export function sapAdtTableQuery(
  connection: SapAdtConnection,
  input: unknown
): { sql: string; limit: number; table: string } {
  const args = sapAdtTableSchema.parse(input)
  const table = args.table.toUpperCase()
  if (
    !connection.allowTables ||
    (connection.tables.length > 0 && !connection.tables.includes(table))
  )
    throw new Error('Tabela não autorizada nesta conexão.')
  const where = args.filters
    .map((f) => `${f.column.toUpperCase()} = '${f.value.replace(/'/g, "''")}'`)
    .join(' AND ')
  return {
    table,
    limit: Math.min(args.limit, connection.maxRows),
    sql: `SELECT ${args.columns.map((c) => c.toUpperCase()).join(', ')} FROM ${table}${where ? ` WHERE ${where}` : ''}`
  }
}
export function sapAdtPath(value: string): string {
  // Only canonical relative ADT paths. No URL, query, traversal, encoded slash or backslash.
  if (!/^\/sap\/bc\/adt\/[A-Za-z0-9_/%~.-]+$/.test(value) || /%(?![0-9a-f]{2})/i.test(value))
    throw new Error('Caminho ADT inválido.')
  const decoded = decodeURIComponent(value)
  if (
    decoded.includes('\\') ||
    decoded.includes('%') ||
    decoded.split('/').some((p) => p === '.' || p === '..') ||
    /[?#]/.test(decoded) ||
    [...decoded].some((character) => character.charCodeAt(0) <= 32)
  )
    throw new Error('Caminho ADT inválido.')
  return value
}

export function sapAdtAccessDiagnostics(
  connections: SapAdtConnection[],
  agent: { source: 'default' | 'custom'; id: string }
): string[] {
  if (!connections.length) return ['Nenhuma conexão SAP ADT cadastrada nesta conta e computador.']
  return connections.map((connection) => {
    if (!connection.enabled) return `${connection.name}: conexão ADT desativada.`
    if (
      !connection.agents.some(
        (binding) => binding.source === agent.source && binding.id === agent.id
      )
    )
      return `${connection.name}: conexão habilitada, mas este agente não está autorizado. Selecione o agente em Configurações > Integrações > SAP · ADT e salve.`
    return `${connection.name}: pesquisa de objetos disponível; leitura de fonte ${connection.allowSource ? 'habilitada' : 'desativada'}; consulta de tabelas ${connection.allowTables ? 'habilitada, com aprovação' : 'desativada. Ative Permitir consulta de tabelas nas permissões da conexão e salve'}; edição ${connection.allowWrite ? 'habilitada, com revisão' : 'desativada (habilite Editar fonte ABAP em Configurações > Integrações > SAP · ADT)'}; validação de sintaxe/qualidade ${connection.allowQuality ? 'habilitada' : 'desativada'}; transportes ${connection.allowTransports ? 'habilitados' : 'desativados (informe request existente ou habilite o gerenciamento)'}; ativação ${connection.allowActivate ? 'habilitada, com aprovação específica' : 'desativada'}.`
  })
}
