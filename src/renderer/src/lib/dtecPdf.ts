import type { StructuredValue } from './structuredResponse'

const LABELS: Record<string, string> = {
  object_name: 'Objeto', object_type: 'Tipo de objeto', sap_module: 'Módulo SAP',
  objective: 'Objetivo', structure: 'Estrutura técnica', tables: 'Tabelas e estruturas',
  parameters: 'Parâmetros e interface', processing_logic: 'Fluxo de processamento',
  error_handling: 'Tratamento de erros e exceções', dependencies: 'Dependências',
  performance_notes: 'Performance e riscos', change_log_template: 'Histórico de alterações',
  analyzed_objects: 'Objetos analisados', coverage: 'Cobertura da análise', limitations: 'Limitações e lacunas',
  security_notes: 'Segurança e autorizações', validation: 'Verificações recomendadas',
  name: 'Nome', direction: 'Direção', type: 'Tipo', required: 'Obrigatório', description: 'Descrição',
  source: 'Origem / evidência', usage: 'Uso', step: 'Etapa', routine: 'Rotina', condition: 'Condição',
  action: 'Ação', inputs: 'Entradas', outputs: 'Saídas'
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]!)
}

function label(key: string): string {
  return LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function renderValue(value: StructuredValue): string {
  if (value === null || value === '') return '<p>Não informado.</p>'
  if (Array.isArray(value)) {
    if (!value.length) return '<p>Não informado.</p>'
    return value.map((item, index) => `<article class="item"><div class="item-number">${String(index + 1).padStart(2, '0')}</div><div>${renderValue(item)}</div></article>`).join('')
  }
  if (typeof value === 'object') {
    return Object.entries(value).map(([key, entry]) => `<div class="field"><strong>${escapeHtml(label(key))}</strong>${renderValue(entry)}</div>`).join('')
  }
  const displayed = value === true ? 'Sim' : value === false ? 'Não' : value === 'partial' ? 'Parcial' : value === 'complete' ? 'Completa' : String(value)
  return `<p>${escapeHtml(displayed).replace(/\r?\n/g, '<br>')}</p>`
}

function renderSection(key: string, value: StructuredValue): string {
  if (!['parameters', 'tables', 'dependencies'].includes(key) || !Array.isArray(value) || value.length === 0 ||
    !value.every((item) => item !== null && typeof item === 'object' && !Array.isArray(item))) return renderValue(value)
  const rows = value as Record<string, StructuredValue>[]
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))]
  return `<table><thead><tr>${columns.map((column) => `<th>${escapeHtml(label(column))}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((column) => `<td>${renderValue(row[column] ?? null)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
}

export function dtecPdfFileName(data: Record<string, StructuredValue>): string {
  const name = String(data.object_name || 'objeto').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 70)
  return `DTec_${name}.pdf`
}

export function buildDtecPdfHtml(data: Record<string, StructuredValue>): string {
  const title = escapeHtml(String(data.object_name || 'Objeto não identificado'))
  const preferred = ['object_name', 'object_type', 'sap_module', 'analyzed_objects', 'coverage', 'limitations', 'objective', 'structure', 'tables', 'parameters', 'processing_logic', 'error_handling', 'dependencies', 'performance_notes', 'security_notes', 'validation', 'change_log_template']
  const entries = [
    ...preferred.filter((key) => key in data).map((key) => [key, data[key]] as const),
    ...Object.entries(data).filter(([key]) => !preferred.includes(key))
  ]
  const sections = entries.filter(([key]) => !['object_name', 'object_type', 'sap_module'].includes(key))
    .map(([key, value], index) => `<section><h2><span>${String(index + 1).padStart(2, '0')}</span>${escapeHtml(label(key))}</h2>${renderSection(key, value)}</section>`).join('')
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>DTec ${title}</title><style>
    @page { size: A4; margin: 20mm 18mm 19mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; color: #233241; font-size: 10pt; line-height: 1.58; }
    header { border-top: 6px solid #0b74a7; padding-top: 24px; margin-bottom: 32px; }
    .eyebrow { color: #0b74a7; font-size: 9pt; font-weight: 700; letter-spacing: 1.7px; text-transform: uppercase; }
    h1 { margin: 9px 0 14px; font-size: 25pt; line-height: 1.15; color: #152636; overflow-wrap: anywhere; }
    .subtitle { font-size: 12pt; color: #536879; margin: 0 0 20px; }
    .meta { display: flex; gap: 10px; flex-wrap: wrap; }
    .meta span { padding: 5px 10px; background: #eaf3f8; border-radius: 5px; font-size: 9pt; }
    section { margin: 0 0 24px; break-inside: auto; }
    h2 { color: #173750; border-bottom: 1px solid #cbdbe5; padding-bottom: 7px; margin: 0 0 12px; font-size: 14pt; break-after: avoid; }
    h2 span { color: #0b74a7; font-size: 9pt; margin-right: 12px; }
    p { margin: 0 0 9px; white-space: normal; overflow-wrap: anywhere; }
    .item { display: grid; grid-template-columns: 28px 1fr; gap: 8px; margin: 0 0 9px; padding: 10px 12px; border: 1px solid #dce7ed; border-radius: 6px; break-inside: avoid; }
    .item-number { color: #0b74a7; font-weight: 700; font-size: 9pt; }
    .field { margin: 0 0 8px; break-inside: avoid; }
    .field strong { display: block; color: #557183; font-size: 8pt; text-transform: uppercase; letter-spacing: .5px; }
    .field p { margin: 2px 0 6px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 9pt; }
    thead { display: table-header-group; }
    th, td { border: 1px solid #cbdbe5; padding: 7px; vertical-align: top; overflow-wrap: anywhere; }
    th { text-align: left; color: #173750; background: #eaf3f8; }
    td p { margin: 0; }
    tr { break-inside: avoid; }
  </style></head><body><header><div class="eyebrow">Abapfy · Documentação técnica</div><h1>${title}</h1><p class="subtitle">Fluxo e arquitetura do objeto ABAP analisado</p><div class="meta"><span>Tipo: ${escapeHtml(String(data.object_type || 'A confirmar'))}</span><span>Módulo: ${escapeHtml(String(data.sap_module || 'A confirmar'))}</span></div></header>${sections}</body></html>`
}
