import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfjsWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import mammoth from 'mammoth'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

export interface AttachmentFile {
  id: string
  name: string
  size: number
  status: 'reading' | 'ready' | 'error'
  content?: string
  imageDataUrl?: string
  error?: string
}

async function extractPdfText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  const pageTexts: string[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const textContent = await page.getTextContent()
    const pageText = textContent.items.map((item) => ('str' in item ? item.str : '')).join(' ')
    pageTexts.push(pageText)
  }

  return pageTexts.join('\n\n')
}

async function extractDocxText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer: buffer })
  return result.value
}

const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'json',
  'yaml',
  'yml',
  'xml',
  'csv',
  'log',
  'abap',
  'cds',
  'dcl',
  'sql',
  'js',
  'jsx',
  'ts',
  'tsx',
  'py',
  'java',
  'cs',
  'c',
  'cpp',
  'h',
  'go',
  'rb',
  'php',
  'sh',
  'ps1',
  'html',
  'css',
  'scss',
  'ini',
  'conf',
  'toml',
  'gitignore'
])

function extensionOf(filename: string): string {
  const parts = filename.split('.')
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ''
}

export async function extractTextFromFile(file: File): Promise<string> {
  const extension = extensionOf(file.name)

  if (extension === 'pdf' || file.type === 'application/pdf') {
    const text = await extractPdfText(file)
    if (!text.trim())
      throw new Error(
        'O PDF não possui texto extraível. Envie uma versão com texto ou aplique OCR ao original.'
      )
    return text
  }

  if (
    extension === 'docx' ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const text = await extractDocxText(file)
    if (!text.trim())
      throw new Error(
        'O DOCX não possui texto extraível. Confira o original ou envie uma versão com texto.'
      )
    return text
  }

  if (extension === 'doc') {
    throw new Error('Formato .doc antigo não é suportado — salve como .docx ou .txt.')
  }

  if (TEXT_EXTENSIONS.has(extension) || file.type.startsWith('text/') || !file.type) {
    return await file.text()
  }

  throw new Error(`Tipo de arquivo não suportado: .${extension || '?'}`)
}

const ATTACHED_FILES_BLOCK = /\n*<attached-files>[\s\S]*?<\/attached-files>\s*$/

export function buildMessageWithAttachments(
  text: string,
  attachments: { name: string; content: string }[]
): string {
  if (attachments.length === 0) return text

  const block = JSON.stringify({ files: attachments }).replace(/</g, '\\u003c')
  return `${text}\n\n<attached-files>\n${block}\n</attached-files>`
}

export interface ParsedAttachedMessage {
  text: string
  attachments: { name: string }[]
}

export function attachmentSources(content: string): { name: string; content: string }[] {
  const match = content.match(/<attached-files>([\s\S]*)<\/attached-files>\s*$/)
  if (!match) return []
  try {
    const value = JSON.parse(match[1])
    if (Array.isArray(value.files))
      return value.files.filter(
        (file: { name?: unknown; content?: unknown }) =>
          typeof file.name === 'string' && typeof file.content === 'string'
      )
  } catch {
    /* Legacy messages contain XML wrappers. */
  }
  return Array.from(match[1].matchAll(/<file name="([^"]*)">\n?([\s\S]*?)<\/file>/g), (m) => ({
    name: m[1],
    content: m[2].replace(/\n$/, '')
  }))
}
export function parseMessageAttachments(content: string): ParsedAttachedMessage {
  const attachments = attachmentSources(content)
  if (!attachments.length) return { text: content, attachments: [] }
  return {
    text: content.replace(ATTACHED_FILES_BLOCK, '').trim(),
    attachments: attachments.map(({ name }) => ({ name }))
  }
}

/** The originals remain in persisted messages; model requests receive stable references. */
export function attachmentContext(content: string, messageKey: string): string {
  const files = attachmentSources(content)
  if (!files.length) return content
  return `${parseMessageAttachments(content).text}\n\nAnexos completos disponíveis pelas ferramentas workspace_read_file e workspace_list_files: ${JSON.stringify(files.map((file, index) => ({ fileId: `attachment-${messageKey}-${index}`, name: file.name })))}. Consulte os arquivos antes de responder.`
}
