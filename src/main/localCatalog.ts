import type { SapCatalogEntry } from '../shared/localFeatures'

/** RFC 4180 CSV, including quoted commas, escaped quotes and multiline descriptions. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = [],
    field = '',
    quoted = false
  text = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"'
        i++
      } else quoted = !quoted
    } else if (c === ',' && !quoted) {
      row.push(field)
      field = ''
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      if (row.some(Boolean)) rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (quoted) throw new Error('CSV com aspas não fechadas.')
  row.push(field)
  if (row.some(Boolean)) rows.push(row)
  const headers = rows.shift() ?? []
  if (!headers.length) throw new Error('CSV vazio.')
  return rows.map((cells) => {
    if (cells.length !== headers.length)
      throw new Error('CSV com quantidade inconsistente de colunas.')
    return Object.fromEntries(
      headers.flatMap((header, i) => (header ? [[header, cells[i].trim()]] : []))
    )
  })
}

export const CATALOG_FILES = [
  'BADI_DEFINITION_AND_ATRIBUTES.csv',
  'BADI_INTERFACE.csv',
  'BAPIS.csv',
  'ENHACEMENT_OBJECTS.csv'
] as const

// This SAP export doubles an opening quote but sometimes leaves its closing
// quote single in the final description column. Repair only those complete
// physical records; keep the strict parser for all other CSV structures.
export function repairSapDescriptions(text: string, precedingColumns: number): string {
  const pattern = new RegExp(`^((?:"[^"]*",){${precedingColumns}})"(.*)",$`)
  return text
    .split(/\r?\n/)
    .map((line) => {
      if ((line.match(/"/g)?.length ?? 0) % 2 === 0) return line
      const match = line.match(pattern)
      if (!match) return line
      const description = match[2].replace(/""/g, '"').replace(/"/g, '""')
      return `${match[1]}"${description}",`
    })
    .join('\n')
}

export function buildCatalog(files: Record<string, string>): SapCatalogEntry[] {
  const definitions = parseCsv(repairSapDescriptions(files[CATALOG_FILES[0]], 17))
  const interfaces = parseCsv(files[CATALOG_FILES[1]])
  const bapis = parseCsv(repairSapDescriptions(files[CATALOG_FILES[2]], 12))
  const objects = parseCsv(files[CATALOG_FILES[3]])
  for (const [rows, key] of [
    [definitions, 'EXIT_NAME'],
    [interfaces, 'INTER_NAME'],
    [bapis, 'FUNCNAME'],
    [objects, 'ENHNAME']
  ] as const) {
    if (!rows.length || rows.some((r) => !r[key]))
      throw new Error(`CSV sem identificador obrigatório: ${key}.`)
  }
  const interfaceMap = new Map(interfaces.map((r) => [r.EXIT_NAME, r.INTER_NAME]))
  // Preserve the graph separately while indexing only one document per technical object.
  const groups = new Map<string, Set<string>>()
  for (const r of objects) {
    if (r.VERSION !== 'A') continue
    let group = groups.get(r.ENHNAME)
    if (!group) {
      group = new Set()
      groups.set(r.ENHNAME, group)
    }
    group.add(`${r.OBJ_TYPE}:${r.OBJ_NAME}`)
  }
  const links = new Map<string, Set<string>>()
  for (const [enhancement, members] of groups) {
    for (const member of members) {
      const name = member.slice(member.indexOf(':') + 1)
      let related = links.get(name)
      if (!related) {
        related = new Set()
        links.set(name, related)
      }
      related.add(`ENHO:${enhancement}`)
      for (const other of members) if (other !== member) related.add(other)
    }
  }
  const catalog: SapCatalogEntry[] = definitions.map((r) => ({
    id: `badi:${r.EXIT_NAME}`,
    type: 'badi',
    name: r.EXIT_NAME,
    description: r['Descrição'] ?? '',
    package: r.DEVCLASS ?? '',
    interface: interfaceMap.get(r.EXIT_NAME) ?? '',
    program: '',
    relatedObjects: [
      ...new Set([
        ...(links.get(r.EXIT_NAME) ?? []),
        ...(links.get(interfaceMap.get(r.EXIT_NAME) ?? '') ?? [])
      ])
    ],
    source: CATALOG_FILES[0]
  }))
  catalog.push(
    ...bapis.map((r): SapCatalogEntry => ({
      id: `bapi:${r.FUNCNAME}`,
      type: 'bapi',
      name: r.FUNCNAME,
      description: r['Texto breve'] ?? '',
      package: '',
      interface: '',
      program: r.PNAME ?? '',
      relatedObjects: [...(links.get(r.FUNCNAME) ?? [])],
      source: CATALOG_FILES[2]
    }))
  )
  if (new Set(catalog.map((r) => r.id)).size !== catalog.length)
    throw new Error('Identificadores duplicados no catálogo.')
  return catalog
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}
const STOP_WORDS = new Set([
  'a',
  'o',
  'as',
  'os',
  'de',
  'do',
  'da',
  'dos',
  'das',
  'e',
  'em',
  'um',
  'uma',
  'para',
  'por',
  'que',
  'no',
  'na',
  'nas',
  'nos',
  'com',
  'preciso',
  'quero',
  'como',
  'qual',
  'sap',
  'ecc'
])

/** Remove presentation directives, preserving requirements and technical identifiers. */
export function catalogQuery(query: string): string {
  const parts = query.split(/(?<=[.!?])\s+|\n+/)
  const meaningful = parts.filter((part) => {
    // An identifier supplied alongside a directive remains a useful lookup key.
    if (/\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/.test(part)) return true
    return !/^(?:consulte .*?(?:catálogo|catalogo|base local|candidatos)|cite |separe |ranqueie |informe (?:a origem|o csv)|n[aã]o invente |n[aã]o gere (?:c[oó]digo|m[eé]todos|assinaturas|esqueleto|abap))/i.test(
      part.trim()
    )
  })
  return meaningful.join(' ').trim() || query.trim()
}

const PURCHASE_ORDER =
  /pedido(?:s)?(?: de)? compra|pedido(?:s)? de compras|purchase order|me21n|me22n/i

// Search vocabulary only; these aliases do not assert methods or transaction compatibility.
function searchTerms(query: string): string[] {
  const terms = normalize(query)
    .split(/[^a-z0-9_/]+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t))
  if (PURCHASE_ORDER.test(query))
    terms.push('po', 'purchase', 'purchasing', 'order', 'pedido', 'compras', 'mepo')
  return [...new Set(terms)]
}

export function lexicalRanking(
  catalog: SapCatalogEntry[],
  query: string
): Array<{ index: number; score: number }> {
  const q = normalize(query.trim())
  const terms = searchTerms(query)
  const transactionPrefixes = [...query.matchAll(/\b([A-Z]{2,5})\d+[A-Z0-9]*\b/g)]
    .map((match) => match[1].toLowerCase())
    .filter((prefix) => prefix !== 'se')
  if (!terms.length) return []
  return catalog
    .map((entry, index) => {
      const name = normalize(entry.name),
        description = normalize(entry.description)
      const technical = normalize(
        `${entry.interface} ${entry.program} ${entry.package} ${entry.relatedObjects.join(' ')}`
      )
      const nameTokens = new Set(name.split(/[^a-z0-9]+/))
      let score = name === q ? 1000 : 0
      if (terms.includes(name)) score += 500
      if (
        transactionPrefixes.some(
          (prefix) => name.startsWith(`${prefix}_`) || normalize(entry.package) === prefix
        )
      )
        score += 64
      for (const term of terms)
        score +=
          (name.includes(term) ? 12 : 0) +
          (description.includes(term) ? 5 : 0) +
          (technical.includes(term) ? 2 : 0)
      // Exact technical segments (PO, PURCHASE) are stronger than incidental substrings.
      if (PURCHASE_ORDER.test(query)) {
        if (nameTokens.has('po')) score += 24
        if (
          /\bprocessamento\b|procmto|process/i.test(entry.description) ||
          nameTokens.has('process')
        )
          score += 8
      }
      return { index, score }
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 40)
}

export function documentText(entry: SapCatalogEntry): string {
  return `title: ${entry.name} | text: Tipo: ${entry.type}. Descrição: ${entry.description}. Pacote: ${entry.package}. Interface: ${entry.interface}. Programa: ${entry.program}. Objetos relacionados: ${entry.relatedObjects.slice(0, 20).join(', ')}`
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || !a.length) throw new Error('Dimensões incompatíveis nos embeddings.')
  let dot = 0,
    normA = 0,
    normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] ** 2
    normB += b[i] ** 2
  }
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0
}

export function hybridRanking(
  lexical: Array<{ index: number; score: number }>,
  semantic: Array<{ index: number; score: number }>
): Array<{ index: number; score: number }> {
  const scores = new Map<number, number>()
  for (const list of [lexical, semantic])
    list.forEach((r, rank) => scores.set(r.index, (scores.get(r.index) ?? 0) + 1 / (60 + rank + 1)))
  // Reserve strong textual matches: agreement between two weak lists must not
  // discard objects matching the requested technical family and terminology.
  lexical
    .filter((r) => r.score >= 80 && r.score < 500)
    .slice(0, 3)
    .forEach((r, rank) =>
      scores.set(r.index, Math.max(scores.get(r.index) ?? 0, 0.05 + 1 / (61 + rank)))
    )
  // Technical identifiers remain authoritative even when their semantic neighbors are similar.
  lexical.filter((r) => r.score >= 500).forEach((r) => scores.set(r.index, 1 + r.score / 1000))
  return [...scores]
    .map(([index, score]) => ({ index, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
}
