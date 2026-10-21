/** Semantic content only: model output can never inject Word XML. */
export type EfWordBlock =
  | { type: 'paragraph' | 'heading'; text: string }
  | { type: 'code'; text: string; language?: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'diagram'; steps: string[]; caption?: string }

const escapeXml = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!
  )

function validText(value: unknown): asserts value is string {
  // XML 1.0 cannot represent these control characters.
  if (
    typeof value !== 'string' ||
    value.length > 120_000 ||
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  )
    throw new Error('Texto de bloco EF inválido.')
}

function paragraph(
  text: string,
  kind: 'paragraph' | 'heading' | 'code' | 'tableHeader' = 'paragraph'
): string {
  validText(text)
  const heading = kind === 'heading',
    code = kind === 'code',
    bold = heading || kind === 'tableHeader'
  const properties = `<w:pStyle w:val="Normal"/><w:spacing w:before="${heading ? 180 : 0}" w:after="${code ? 0 : 120}" w:line="${code ? 240 : 276}" w:lineRule="auto"/><w:jc w:val="left"/>${heading ? '<w:keepNext/><w:outlineLvl w:val="2"/>' : ''}${code ? '<w:shd w:val="clear" w:fill="F2F4F7"/>' : ''}`
  const runs = text
    .split('\n')
    .map((line, i) => `${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${escapeXml(line)}</w:t>`)
    .join('')
  return `<w:p><w:pPr>${properties}</w:pPr><w:r><w:rPr><w:rFonts w:ascii="${code ? 'Consolas' : 'Calibri'}" w:hAnsi="${code ? 'Consolas' : 'Calibri'}"/><w:b w:val="${bold ? 1 : 0}"/><w:bCs w:val="${bold ? 1 : 0}"/><w:i w:val="0"/><w:color w:val="000000"/><w:sz w:val="${code ? 18 : 22}"/></w:rPr>${runs}</w:r></w:p>`
}

function table(headers: string[], rows: string[][]): string {
  if (
    !Array.isArray(headers) ||
    !headers.length ||
    headers.length > 12 ||
    !Array.isArray(rows) ||
    rows.length > 100
  )
    throw new Error('Tabela EF inválida: use até 12 colunas e 100 linhas.')
  const allRows = [headers, ...rows]
  const width = Math.floor(9000 / headers.length)
  const content = allRows
    .map((row, i) => {
      if (!Array.isArray(row) || row.length !== headers.length)
        throw new Error('Tabela EF com colunas inconsistentes.')
      return `<w:tr>${i === 0 ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${row
        .map((cell) => {
          validText(cell)
          return `<w:tc><w:tcPr><w:tcW w:w="${Math.floor(5000 / headers.length)}" w:type="pct"/>${i === 0 ? '<w:shd w:val="clear" w:fill="E7EDF3"/>' : ''}</w:tcPr>${paragraph(cell, i === 0 ? 'tableHeader' : 'paragraph')}</w:tc>`
        })
        .join('')}</w:tr>`
    })
    .join('')
  const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map((side) => `<w:${side} w:val="single" w:sz="4" w:color="C8D0DA"/>`)
    .join('')
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${borders}</w:tblBorders><w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${headers.map(() => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>${content}</w:tbl>`
}

export function renderEfWordBlocks(blocks: EfWordBlock[]): string {
  if (
    !Array.isArray(blocks) ||
    !blocks.length ||
    blocks.length > 200 ||
    JSON.stringify(blocks).length > 500_000
  )
    throw new Error('Blocos EF inválidos ou grandes demais.')
  const content = blocks
    .map((block) => {
      if (!block || typeof block !== 'object') throw new Error('Bloco EF inválido.')
      switch (block.type) {
        case 'heading':
        case 'code':
          return paragraph(block.text, block.type)
        case 'paragraph':
          validText(block.text)
          return block.text
            .split(/\n\s*\n/)
            .map((text) => paragraph(text))
            .join('')
        case 'table':
          return table(block.headers, block.rows)
        case 'diagram': {
          if (!Array.isArray(block.steps) || !block.steps.length || block.steps.length > 30)
            throw new Error('Diagrama EF inválido: use de 1 a 30 etapas.')
          const steps = block.steps.flatMap((step, i) => {
            validText(step)
            return [...(i ? [['↓']] : []), [`${i + 1}. ${step}`]]
          })
          if (block.caption !== undefined) validText(block.caption)
          return table([block.caption || 'Fluxo do processo'], steps)
        }
        default:
          throw new Error('Tipo de bloco EF desconhecido.')
      }
    })
    .join('')
  // A Word table cell must always end in a paragraph, including after nested tables.
  return content + paragraph('')
}
