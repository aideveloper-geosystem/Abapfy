import type PizZip from 'pizzip'

/** Derived exclusively from the retained DOCX, never from model-authored XML. */
export interface EfWordStyle {
  runProperties: string
  paragraphStyle: string
  paragraphLayout: string
  headerFill: string
  tableBorders: string
  tableCellMargins: string
  width: number
}
const content = (xml: string, name: string): string =>
  xml.match(new RegExp(`<w:${name}\\b[^>]*>([\\s\\S]*?)</w:${name}>`))?.[1] ?? ''
const property = (xml: string, name: string): string =>
  xml.match(new RegExp(`<w:${name}\\b[^>]*(?:/>|>[\\s\\S]*?</w:${name}>)`))?.[0] ?? ''
const escaped = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
function ancestor(xml: string, position: number, tag: string): string {
  const starts: number[] = []
  for (const match of xml.slice(0, position).matchAll(new RegExp(`<(/?)w:${tag}\\b[^>]*>`, 'g'))) {
    if (match[1]) starts.pop()
    else if (!match[0].endsWith('/>')) starts.push(match.index!)
  }
  return starts.length ? xml.slice(starts.at(-1)!, position) : ''
}
export function efWordStyle(
  zip: PizZip,
  xml: string,
  paragraphXml: string,
  position: number
): EfWordStyle {
  const styles = zip.file('word/styles.xml')?.asText() ?? ''
  const pPr = content(paragraphXml, 'pPr')
  const defaultRun = content(content(styles, 'rPrDefault'), 'rPr')
  const definitions = [...styles.matchAll(/<w:style\b[^>]*>[\s\S]*?<\/w:style>/g)].map(
    (match) => match[0]
  )
  const chain: string[] = []
  let id =
    pPr.match(/<w:pStyle\b[^>]*w:val="([^"]+)"/)?.[1] ??
    definitions
      .find((style) => /w:type="paragraph"/.test(style) && /w:default="1"/.test(style))
      ?.match(/w:styleId="([^"]+)"/)?.[1] ??
    'Normal'
  for (let depth = 0; depth < 8 && id; depth++) {
    const style = definitions.find((candidate) =>
      new RegExp(`w:styleId="${escaped(id)}"`).test(candidate)
    )
    if (!style || chain.includes(style)) break
    chain.push(style)
    id = style.match(/<w:basedOn\b[^>]*w:val="([^"]+)"/)?.[1] ?? ''
  }
  const run =
    content(paragraphXml.replace(/<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>/, ''), 'rPr') ||
    content(pPr, 'rPr')
  const runSources = [run, ...chain.map((style) => content(style, 'rPr')), defaultRun]
  const runProperties = ['rFonts', 'color', 'sz', 'szCs', 'lang']
    .map((name) => runSources.map((source) => property(source, name)).find(Boolean) ?? '')
    .join('')
  const layoutSources = [pPr, ...chain.map((style) => content(style, 'pPr'))]
  const table = ancestor(xml, position, 'tbl')
  const cell = ancestor(xml, position, 'tc')
  const tablePr = content(table, 'tblPr')
  const fill = table.match(/<w:shd\b[^>]*w:fill="([0-9a-fA-F]{6})"/)?.[1]
  const cellWidth = content(cell, 'tcPr').match(/<w:tcW\b[^>]*w:w="(\d+)"[^>]*w:type="dxa"/)
  return {
    runProperties,
    paragraphStyle: property(pPr, 'pStyle') || '<w:pStyle w:val="Normal"/>',
    paragraphLayout: ['ind', 'jc']
      .map((name) => layoutSources.map((source) => property(source, name)).find(Boolean) ?? '')
      .join(''),
    headerFill: fill ?? xml.match(/<w:shd\b[^>]*w:fill="([0-9a-fA-F]{6})"/)?.[1] ?? 'E7EDF3',
    tableBorders: property(tablePr, 'tblBorders'),
    tableCellMargins: property(tablePr, 'tblCellMar'),
    width: cellWidth ? Math.max(500, Number(cellWidth[1]) - 200) : 9000
  }
}
