import type { StructuredValue } from './structuredResponse'

export const CUSTOMIZING_OUTPUT_CONTRACT = `## Apresentação de Customizing
Responda em português com JSON válido, conforme o esquema do agente. Não gere ABAP nem blocos de código para transações, tabelas ou caminhos IMG.
Mantenha summary conciso. Para vários caminhos use img_paths: [{title: "Atividade", levels: ["SPRO", "IMG de referência SAP", "Área raiz", "Subárea", "Atividade final"]}]. Para um único caminho, img_path deve conter um nível por item, da raiz até a atividade final. Não misture caminhos distintos no mesmo array de níveis. Não invente níveis ausentes: sinalize A CONFIRMAR e explique como verificar.
Em transactions informe code, purpose, tables (somente tabelas/views comprovadas; A CONFIRMAR quando desconhecidas), steps (etapas objetivas de consulta/manutenção) e evidence. Códigos de transação são identificadores, não código-fonte.
Inclua prerequisites, configuration_steps (step, action, expected_result, caution), validation, transport, impacts_and_risks, open_points e evidence quando pertinentes. Separe hipóteses de fatos verificados. O formato será apresentado como árvore SPRO, tabelas e etapas numeradas, com rótulos em português.`

const labels: Record<string, string> = {
  summary: 'Resumo', scope: 'Cenário', product: 'Produto', release: 'Versão', module: 'Módulo', scenario: 'Processo',
  standard_solution: 'Solução standard', available: 'Disponível', explanation: 'Orientação',
  prerequisites: 'Pré-requisitos', configuration_steps: 'Etapas de configuração', validation: 'Validação funcional',
  transport: 'Transporte', required: 'Necessário', guidance: 'Procedimento', impacts_and_risks: 'Impactos e riscos',
  area: 'Área', description: 'Descrição', severity: 'Criticidade', mitigation: 'Mitigação',
  open_points: 'Pontos a confirmar', evidence: 'Evidências', source: 'Fonte', status: 'Situação', note: 'Observação',
  action: 'Ação', expected_result: 'Resultado esperado', caution: 'Atenção', step: 'Etapa',
  code: 'Transação', purpose: 'Objetivo', tables: 'Tabelas / views', steps: 'Etapas', title: 'Atividade'
}
const values: Record<string, string> = {
  yes: 'Sim', no: 'Não', partial: 'Parcial', a_confirmar: 'A confirmar',
  documented: 'Documentado', system_discovered: 'Encontrado no sistema', live_verified: 'Verificado no sistema',
  low: 'Baixa', medium: 'Média', high: 'Alta', critical: 'Crítica'
}
const label = (key: string): string => labels[key] ?? key.replace(/_/g, ' ')
const object = (value: StructuredValue): value is Record<string, StructuredValue> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

// Escape untrusted values so identifiers/text cannot create fences, HTML or table columns.
function text(value: StructuredValue | undefined): string {
  if (value === undefined || value === null || value === '') return '—'
  if (Array.isArray(value)) return value.map(text).join('; ')
  if (object(value)) return Object.entries(value).map(([key, item]) => `${label(key)}: ${text(item)}`).join('; ')
  const raw = typeof value === 'boolean' ? (value ? 'Sim' : 'Não') : String(value)
  return (values[raw] ?? raw).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/[\\`*_{}\[\]()#+.!|~-]/g, '\\$&').replace(/\r?\n/g, ' ')
}

function details(value: StructuredValue): string {
  if (Array.isArray(value)) return value.map((item, index) => `${index + 1}. ${details(item)}`).join('\n\n')
  if (object(value)) return Object.entries(value).filter(([, item]) => item !== null && item !== '')
    .map(([key, item]) => `**${label(key)}:** ${text(item)}`).join('  \n')
  return text(value)
}

function tree(value: StructuredValue): string {
  const levels = Array.isArray(value) ? value : [value]
  // Also support older answers that put a complete breadcrumb in each array item.
  const breadcrumbs = levels.filter((item): item is string => typeof item === 'string')
  const paths = breadcrumbs.some((item) => item.includes('>'))
    ? breadcrumbs.map((item) => item.split('>').map((part) => part.trim()).filter(Boolean))
    : [levels]
  return paths.map((path) => path.map((item, depth) => `${'  '.repeat(depth)}- ${text(item)}`).join('\n')).join('\n\n')
}

export function customizingMarkdown(data: Record<string, StructuredValue>): string {
  return Object.entries(data).filter(([, value]) => value !== null && value !== '' &&
    (!Array.isArray(value) || value.length > 0)).map(([key, value]) => {
    if (key === 'img_path') return `## Caminho SPRO / IMG\n\n${tree(value)}`
    if (key === 'img_paths' && Array.isArray(value)) return `## Caminhos SPRO / IMG\n\n${value.map((path, index) =>
      object(path) ? `### ${text(path.title ?? `Atividade ${index + 1}`)}\n\n${tree(path.levels ?? [])}` : tree(path)).join('\n\n')}`
    if (key === 'transactions' && Array.isArray(value)) {
      const rows = value.filter(object)
      return `## Transações e tabelas\n\n| Transação | Objetivo | Tabelas / views | Evidência |\n| --- | --- | --- | --- |\n${rows.map((row) =>
        `| ${text(row.code)} | ${text(row.purpose)} | ${text(row.tables)} | ${text(row.evidence)} |`).join('\n')}\n\n${rows.filter((row) => row.steps).map((row) =>
        `### Etapas — ${text(row.code)}\n\n${details(row.steps)}`).join('\n\n')}`
    }
    return `## ${label(key)}\n\n${details(value)}`
  }).join('\n\n')
}

export function isCustomizingResponse(data: Record<string, StructuredValue>): boolean {
  return ('img_path' in data || 'img_paths' in data) && 'transactions' in data
}
