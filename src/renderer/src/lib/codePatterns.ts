import { supabase } from './supabaseClient'
import { saveAbapArtifacts } from './abapDrive'

export type PatternKind = 'snippet' | 'report' | 'class' | 'function' | 'include' | 'interface' | 'other'

export const PATTERN_KIND_LABELS: Record<PatternKind, string> = {
  snippet: 'Trecho',
  report: 'Programa',
  class: 'Classe',
  function: 'Função',
  include: 'Include',
  interface: 'Interface',
  other: 'Outro'
}

export interface CodePattern {
  id: string
  clientId: string
  moduleId: string
  fileId: string | null
  sourceChatId: string | null
  title: string
  description: string | null
  kind: PatternKind
  tags: string[]
  content: string
  approvedBy: string
  approvedAt: string
  revokedAt: string | null
}

export interface ApproveInput {
  userId: string
  clientId: string
  moduleId: string
  chatId: string | null
  code: string
  title: string
  description: string
  tags: string[]
}

export const PATTERNS_FOLDER_NAME = 'Padrões aprovados'
export const MAX_PATTERN_CHARS = 60000
/** Prompt budget for approved patterns sent along with a request. */
export const PATTERN_PROMPT_CHARS = 8000
export const PATTERN_PROMPT_LIMIT = 5

export function normalizeCode(code: string): string {
  return code.replace(/\r\n/g, '\n').trim()
}

const DECLARATION = /^\s*(REPORT|PROGRAM|CLASS|FUNCTION-POOL|FUNCTION|INTERFACE)\s+([a-z0-9_/]+)/im

export function detectPatternKind(code: string): PatternKind {
  const keyword = code.match(DECLARATION)?.[1]?.toUpperCase()
  if (keyword === 'REPORT' || keyword === 'PROGRAM') return 'report'
  if (keyword === 'CLASS') return 'class'
  if (keyword === 'FUNCTION' || keyword === 'FUNCTION-POOL') return 'function'
  if (keyword === 'INTERFACE') return 'interface'
  return 'snippet'
}

/** Declared object name, else the first comment line, else a generic title. */
export function suggestPatternTitle(code: string): string {
  const declared = code.match(DECLARATION)?.[2]
  if (declared) return declared.slice(0, 120)
  for (const line of code.split('\n')) {
    const comment = line.match(/^\s*(?:\*+|")\s*(.+?)\s*$/)?.[1]
    if (comment && !/^[-=*&\s]+$/.test(comment)) return comment.slice(0, 120)
  }
  return 'Trecho aprovado'
}

export function parseTags(text: string): string[] {
  const seen = new Set<string>()
  for (const raw of text.split(/[,;\n]/)) {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 30)
    if (tag) seen.add(tag)
  }
  return [...seen].slice(0, 8)
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9_]+/)
    .filter((word) => word.length >= 3)
}

/** Overlap between the request and a pattern's title, tags, description and identifiers. */
export function scorePattern(pattern: CodePattern, query: string): number {
  const wanted = new Set(words(query))
  if (!wanted.size) return 0
  let score = 0
  for (const word of new Set(words(`${pattern.title} ${pattern.description ?? ''}`)))
    if (wanted.has(word)) score += 3
  for (const tag of pattern.tags) for (const word of words(tag)) if (wanted.has(word)) score += 4
  const identifiers = new Set(words(pattern.content.slice(0, 4000)))
  for (const word of wanted) if (identifiers.has(word)) score += 1
  return score
}

/** Best matches first, then the most recent; capped by count and by total characters. */
export function selectRelevantPatterns(
  patterns: CodePattern[],
  query: string,
  { limit = PATTERN_PROMPT_LIMIT, budget = PATTERN_PROMPT_CHARS } = {}
): CodePattern[] {
  const ranked = patterns
    .filter((pattern) => !pattern.revokedAt)
    .map((pattern) => ({ pattern, score: scorePattern(pattern, query) }))
    .sort(
      (a, b) =>
        b.score - a.score || b.pattern.approvedAt.localeCompare(a.pattern.approvedAt)
    )
  const chosen: CodePattern[] = []
  let used = 0
  for (const { pattern } of ranked) {
    if (chosen.length >= limit) break
    const size = pattern.content.length + pattern.title.length + 80
    if (used + size > budget) continue
    chosen.push(pattern)
    used += size
  }
  return chosen
}

/** Block appended to the user turn; the instruction keeps the agent from copying blindly. */
export function formatPatternsContext(patterns: CodePattern[]): string {
  if (!patterns.length) return ''
  const items = patterns
    .map((pattern, index) => {
      const meta = [PATTERN_KIND_LABELS[pattern.kind], ...pattern.tags].join(', ')
      const note = pattern.description ? `\n${pattern.description}` : ''
      return `### ${index + 1}. ${pattern.title} (${meta})${note}\n\`\`\`abap\n${pattern.content}\n\`\`\``
    })
    .join('\n\n')
  return [
    '<padroes-aprovados>',
    'Código já aprovado pela equipe para este cliente. Quando fizer sentido para o pedido, siga o mesmo estilo:',
    'nomenclatura, tratamento de erros, BAPIs e estrutura. Não copie trechos que não se aplicam e',
    'diga ao usuário qual padrão você seguiu.',
    '',
    items,
    '</padroes-aprovados>'
  ].join('\n')
}

function mapPattern(row: Record<string, unknown>): CodePattern {
  return {
    id: row.id as string,
    clientId: row.client_id as string,
    moduleId: row.module_id as string,
    fileId: (row.file_id as string | null) ?? null,
    sourceChatId: (row.source_chat_id as string | null) ?? null,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    kind: row.kind as PatternKind,
    tags: (row.tags as string[] | null) ?? [],
    content: row.content as string,
    approvedBy: row.approved_by as string,
    approvedAt: row.approved_at as string,
    revokedAt: (row.revoked_at as string | null) ?? null
  }
}

export async function loadApprovedPatterns(clientId: string, includeRevoked = false): Promise<CodePattern[]> {
  let query = supabase.from('client_code_patterns').select('*').eq('client_id', clientId)
  if (!includeRevoked) query = query.is('revoked_at', null)
  const { data, error } = await query.order('approved_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => mapPattern(row as Record<string, unknown>))
}

async function ensurePatternsFolder(userId: string, clientId: string, moduleId: string): Promise<string> {
  const { data: existing, error } = await supabase
    .from('client_folders')
    .select('id')
    .eq('client_id', clientId)
    .eq('module_id', moduleId)
    .eq('name', PATTERNS_FOLDER_NAME)
    .is('parent_id', null)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (existing) return existing.id as string
  const { data, error: insertError } = await supabase
    .from('client_folders')
    .insert({ client_id: clientId, module_id: moduleId, name: PATTERNS_FOLDER_NAME, user_id: userId })
    .select('id')
    .single()
  if (insertError || !data) throw new Error(insertError?.message ?? 'Não foi possível criar a pasta de padrões.')
  return data.id as string
}

function fileStem(title: string): string {
  return (
    title
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9_-]+/gi, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80) || 'padrao'
  )
}

/**
 * Approve a code block: record the approval first (so a duplicate fails before anything is written),
 * then keep a copy in the client drive under "Padrões aprovados" and link it.
 * The approval stands even if the drive copy fails; the error is reported through `driveError`.
 */
export async function approveCodePattern(
  input: ApproveInput
): Promise<{ pattern: CodePattern; driveError: string | null }> {
  const code = normalizeCode(input.code)
  if (!code) throw new Error('Não há código para aprovar.')
  if (code.length > MAX_PATTERN_CHARS) throw new Error('O trecho passa de 60 mil caracteres. Aprove uma parte menor.')
  const title = input.title.trim().slice(0, 120)
  if (!title) throw new Error('Informe um título.')
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || auth.user?.id !== input.userId) throw new Error('A sessão mudou antes da aprovação.')

  const { data, error } = await supabase
    .from('client_code_patterns')
    .insert({
      client_id: input.clientId,
      module_id: input.moduleId,
      source_chat_id: input.chatId,
      title,
      description: input.description.trim().slice(0, 500) || null,
      kind: detectPatternKind(code),
      tags: input.tags.slice(0, 8),
      content: code
    })
    .select('*')
    .single()
  if (error || !data) {
    if (error?.code === '23505') throw new Error('Este código já está aprovado para o cliente.')
    throw new Error(error?.message ?? 'Não foi possível aprovar o código.')
  }
  let pattern = mapPattern(data as Record<string, unknown>)
  let driveError: string | null = null
  try {
    const folderId = await ensurePatternsFolder(input.userId, input.clientId, input.moduleId)
    const [fileId] = await saveAbapArtifacts(
      {
        userId: input.userId,
        clientId: input.clientId,
        moduleId: input.moduleId,
        folderId,
        chatId: input.chatId ?? '',
        messageId: `pattern-${pattern.id}`
      },
      [{ name: `${fileStem(title)}.abap`, content: code + '\n' }]
    )
    const { error: linkError } = await supabase
      .from('client_code_patterns')
      .update({ file_id: fileId })
      .eq('id', pattern.id)
    if (linkError) throw new Error(linkError.message)
    pattern = { ...pattern, fileId }
  } catch (cause) {
    driveError = (cause as Error).message
  }
  return { pattern, driveError }
}

export async function updatePatternDetails(
  id: string,
  title: string,
  description: string,
  tags: string[]
): Promise<void> {
  const { error } = await supabase
    .from('client_code_patterns')
    .update({ title: title.trim().slice(0, 120), description: description.trim().slice(0, 500) || null, tags: tags.slice(0, 8) })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function revokeCodePattern(id: string): Promise<void> {
  const { error } = await supabase
    .from('client_code_patterns')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteCodePattern(id: string): Promise<void> {
  const { error } = await supabase.from('client_code_patterns').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
