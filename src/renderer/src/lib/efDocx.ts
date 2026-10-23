import { applyEfTemplateEdits, type EfTemplateEdit, type EfTemplateSnapshot } from './efTemplate'
import { efEstimateBlocks, type EfCalculatedEstimate, type EfEstimateInput } from './efEstimate'

export interface EfDocxData {
  specification_type?: 'simples' | 'tecnica' | 'avancada'
  project_name: string
  author: string
  client_name: string
  module: string
  brief_description: string
  summary_description: string
  macro_overview: string
  functional_spec: string
  template_revision?: string
  template_edits?: EfTemplateEdit[]
  estimate?: EfEstimateInput
}
export interface EfDocumentIdentity {
  author: string
  clientName: string
  module: string
  issueDate: string
}

export const EF_DOCX_OUTPUT_CONTRACT = `## Contrato de saída do documento EF

Esta sessão está usando o Agente de EF do Abapfy. Quando o pedido exigir gerar ou
revisar uma EF completa, responda APENAS com o bloco abaixo, que será transformado
no modelo Word oficial. Para explicações e acompanhamento curto, responda em
Markdown sem gerar novo documento. Para lacunas críticas, use o formato clarify:

\`\`\`ef-docx
{
  "specification_type": "simples | tecnica | avancada",
  "project_name": "...",
  "author": "...",
  "client_name": "...",
  "module": "...",
  "brief_description": "...",
  "summary_description": "...",
  "macro_overview": "...",
  "functional_spec": "..."
}
\`\`\`

O conteúdo entre chaves precisa ser JSON válido. Use \\n dentro dos valores para separar
parágrafos. Nunca omita project_name ou functional_spec. Para informação desconhecida,
use "A CONFIRMAR" em vez de inventar.`

function normalizeParsedData(parsed: unknown): EfDocxData | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const record = parsed as Record<string, unknown>
  if (typeof record.project_name !== 'string' || !record.project_name.trim()) return null
  if (typeof record.functional_spec !== 'string' || !record.functional_spec.trim()) return null

  const field = (value: unknown, fallback: string): string =>
    typeof value === 'string' && value.trim() ? value.trim() : fallback

  return {
    ...(['simples', 'tecnica', 'avancada'].includes(record.specification_type as string)
      ? { specification_type: record.specification_type as EfDocxData['specification_type'] }
      : {}),
    project_name: record.project_name.trim(),
    author: field(record.author, 'A CONFIRMAR'),
    client_name: field(record.client_name, 'A CONFIRMAR'),
    module: field(record.module, 'A CONFIRMAR'),
    brief_description: field(record.brief_description, ''),
    summary_description: field(record.summary_description, ''),
    macro_overview: field(record.macro_overview, ''),
    functional_spec: field(record.functional_spec, ''),
    ...(typeof record.template_revision === 'string'
      ? { template_revision: record.template_revision }
      : {}),
    ...(Array.isArray(record.template_edits)
      ? { template_edits: record.template_edits as EfTemplateEdit[] }
      : {}),
    ...(record.estimate && typeof record.estimate === 'object'
      ? { estimate: record.estimate as EfEstimateInput }
      : {})
  }
}

function jsonCandidates(raw: string): string[] {
  const trimmed = raw.trim()
  const candidates = [trimmed]
  const fencedBlocks = trimmed.matchAll(/```(?:ef-docx|json)?\s*\r?\n([\s\S]*?)\r?\n?```/gi)
  for (const match of fencedBlocks) candidates.push(match[1].trim())
  return [...new Set(candidates)]
}

/**
 * Detecta e normaliza os dados da EF a partir de um texto JSON (bloco de código ou a
 * mensagem inteira) — pelo formato dos dados, não pela linguagem declarada no bloco, já
 * que o modelo às vezes usa ```json em vez de ```ef-docx apesar da instrução no agente.
 * Exige os dois campos mais característicos do template (project_name + functional_spec)
 * para não confundir com o JSON de outro agente.
 */
export function parseEfDocxData(raw: string): EfDocxData | null {
  for (const candidate of jsonCandidates(raw)) {
    try {
      const normalized = normalizeParsedData(JSON.parse(candidate))
      if (normalized) return normalized
    } catch {
      // O candidato pode ser texto Markdown; tenta o próximo bloco cercado.
    }
  }
  return null
}

function plainTextFromMarkdown(raw: string): string {
  return raw
    .replace(/^```[\w-]*\s*$/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '- ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim()
}

function labeledValue(raw: string, labels: string[]): string | null {
  const lines = raw.split(/\r?\n/).map(plainTextFromMarkdown)
  for (const line of lines) {
    for (const label of labels) {
      const match = line.match(new RegExp(`^\\s*${escapeRegex(label)}\\s*:\\s*(.+)$`, 'i'))
      if (match?.[1]?.trim()) return match[1].trim()
    }
  }
  return null
}

export function isLegacyEfDocument(raw: string): boolean {
  // A short follow-up must not become a Word document merely because the
  // conversation uses the EF agent. Legacy documents need an explicit title
  // and multiple actual specification sections.
  const lines = raw.split(/\r?\n/).map(plainTextFromMarkdown)
  const section = (pattern: RegExp): boolean => lines.some((line) => pattern.test(line))
  return (
    section(/^Especificação Funcional\b/i) &&
    section(/^(?:\d+[.)]?\s*)?Objetivo\s*:?$/i) &&
    section(/^(?:\d+[.)]?\s*)?Escopo\s*:?$/i) &&
    section(/^(?:\d+[.)]?\s*)?(?:Fluxo(?: do processo)?|Processo|Regras de negócio)\s*:?$/i)
  )
}

function legacyMacroOverview(raw: string): string {
  const lines = raw.split(/\r?\n/)
  const start = lines.findIndex((line) =>
    /^(?:\d+[.)]?\s*)?(?:Visão geral|Visão macro|Visão geral do processo|Macro(?: overview|fluxo)?)\s*:?$/i.test(
      plainTextFromMarkdown(line)
    )
  )
  if (start < 0) return 'A CONFIRMAR'
  const remaining = lines.slice(start + 1)
  const next = remaining.findIndex((line) => /^#{1,6}\s|^\s*\d+[.)]\s/.test(line))
  return (
    plainTextFromMarkdown((next < 0 ? remaining : remaining.slice(0, next)).join('\n')) ||
    'A CONFIRMAR'
  )
}

/**
 * Garante o download também para respostas antigas/em Markdown do EF Consultant.
 * O fallback só deve ser habilitado pela tela quando esse agente estiver ativo,
 * evitando transformar respostas normais de outros agentes em documentos.
 */
export function parseEfDocxResponse(raw: string, allowMarkdownFallback = false): EfDocxData | null {
  const structured = parseEfDocxData(raw)
  if (structured || !allowMarkdownFallback) return structured
  if (!isLegacyEfDocument(raw)) return null

  const functionalSpec = plainTextFromMarkdown(raw)
  if (!functionalSpec) return null

  const heading = raw.match(/^#\s+(.+)$/m)?.[1]?.trim()
  const projectName =
    labeledValue(raw, ['Nome do Projeto', 'Projeto', 'Título', 'Titulo']) ??
    (heading
      ? plainTextFromMarkdown(heading).replace(/^Especificação Funcional\s*[-–—:]?\s*/i, '')
      : null) ??
    'Especificação Funcional'
  const firstParagraph = functionalSpec.split(/\r?\n\s*\r?\n/).find((part) => part.trim()) ?? ''

  return {
    project_name: projectName || 'Especificação Funcional',
    author: labeledValue(raw, ['Autor']) ?? 'A CONFIRMAR',
    client_name: labeledValue(raw, ['Empresa Cliente', 'Cliente', 'Empresa']) ?? 'A CONFIRMAR',
    module: labeledValue(raw, ['Módulo SAP', 'Modulo SAP', 'Módulo', 'Modulo']) ?? 'A CONFIRMAR',
    brief_description: firstParagraph.slice(0, 500),
    summary_description: firstParagraph,
    macro_overview: legacyMacroOverview(raw),
    functional_spec: functionalSpec
  }
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function generateEfDocx(
  data: EfDocxData,
  clientTemplate?: EfTemplateSnapshot,
  estimate?: EfCalculatedEstimate,
  identity?: EfDocumentIdentity
): Promise<Blob> {
  if (!clientTemplate)
    throw new Error(
      'O modelo EF deve ser carregado do drive: default.docx ou base.docx na raiz do módulo EFs do cliente. Gere uma nova EF para usar esse modelo.'
    )
  if (
    clientTemplate.paragraphs.some((paragraph) => paragraph.slot) &&
    !['simples', 'tecnica', 'avancada'].includes(data.specification_type ?? '')
  )
    throw new Error(
      'Escolha o tipo da EF: Técnica, Simples ou Avançada antes de gerar o documento.'
    )
  const edits = data.template_edits?.map((edit) => ({ ...edit }))
  if (edits) {
    for (const paragraph of clientTemplate.paragraphs) {
      if (!paragraph.editable || !paragraph.slot) continue
      const slot = paragraph.slot
      const existing = edits.findIndex((edit) => edit.paragraph_id === paragraph.id)
      if (existing >= 0 && !slot.startsWith('estimate_')) {
        const edit = edits[existing]
        if (
          (edit.text !== undefined && (typeof edit.text !== 'string' || !edit.text.trim())) ||
          (edit.blocks !== undefined && !edit.blocks.length)
        )
          throw new Error(
            `O campo ${slot} do modelo EF está vazio. Preencha o conteúdo ou indique A CONFIRMAR.`
          )
      }
      const identityValues: Record<string, string | undefined> = {
        author: identity?.author,
        revision_author: identity?.author,
        client_name: identity?.clientName,
        module: identity?.module,
        issue_date: identity?.issueDate,
        revision_date: identity?.issueDate
      }
      if (identityValues[slot]) {
        const edit = { paragraph_id: paragraph.id, text: identityValues[slot]! }
        if (existing >= 0) edits[existing] = edit
        else edits.push(edit)
      } else if (slot.startsWith('estimate_')) {
        const blocks = efEstimateBlocks(
          estimate ?? {
            status: 'pending',
            clientName: data.client_name,
            capturedAt: '',
            reasons: ['Gere novamente a EF para consultar os parâmetros do cliente.']
          },
          slot
        )
        const edit = { paragraph_id: paragraph.id, blocks }
        if (existing >= 0) edits[existing] = edit
        else edits.push(edit)
      } else if (existing < 0) {
        const values: Record<string, string> = {
          project_name: data.project_name,
          author: data.author,
          client_name: data.client_name,
          module: data.module,
          summary: data.summary_description,
          description: data.brief_description
        }
        const fallback = values[slot]
        if (fallback?.trim()) edits.push({ paragraph_id: paragraph.id, text: fallback.trim() })
        else if (
          [
            'context',
            'objectives',
            'process',
            'scope',
            'out_of_scope',
            'acceptance',
            'risks'
          ].includes(slot)
        )
          throw new Error(
            `A seção ${slot} do modelo não foi preenchida. Gere novamente a EF com todas as seções organizadas.`
          )
        else edits.push({ paragraph_id: paragraph.id, text: 'A CONFIRMAR' })
      }
    }
  }
  // Fill explicit project-name placeholders even when the model omits a copy
  // hidden in a cover/header text box. Never infer arbitrary institutional text.
  if (edits && data.project_name?.trim()) {
    for (const paragraph of clientTemplate.paragraphs) {
      if (
        !paragraph.editable ||
        !/^(?:INSIRA AQUI O NOME DO PROJETO|NOME DO PROJETO)$/i.test(paragraph.text.trim())
      )
        continue
      const existing = edits.find((edit) => edit.paragraph_id === paragraph.id)
      if (existing) {
        if (
          existing.blocks === undefined &&
          (!existing.text?.trim() || existing.text.trim() === paragraph.text.trim())
        )
          existing.text = data.project_name.trim()
      } else edits.push({ paragraph_id: paragraph.id, text: data.project_name.trim() })
    }
  }
  return applyEfTemplateEdits(clientTemplate, data.template_revision, edits)
}

export function efDocxFileName(data: EfDocxData): string {
  const slug = data.project_name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `EF_${slug.slice(0, 120) || 'projeto'}.docx`
}
