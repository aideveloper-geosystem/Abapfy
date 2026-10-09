import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfjsWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import mammoth from 'mammoth'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

const MAX_CHARS_PER_FILE = 60000

export interface AttachmentFile {
  id: string
  name: string
  size: number
  status: 'reading' | 'ready' | 'error'
  content?: string
  imageDataUrl?: string
  error?: string
}

function truncate(text: string): string {
  if (text.length <= MAX_CHARS_PER_FILE) return text
  return `${text.slice(0, MAX_CHARS_PER_FILE)}\n\n[...conteúdo truncado — arquivo maior que ${MAX_CHARS_PER_FILE} caracteres...]`
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
    return truncate(await extractPdfText(file))
  }

  if (
    extension === 'docx' ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return truncate(await extractDocxText(file))
  }

  if (extension === 'doc') {
    throw new Error('Formato .doc antigo não é suportado — salve como .docx ou .txt.')
  }

  if (TEXT_EXTENSIONS.has(extension) || file.type.startsWith('text/') || !file.type) {
    return truncate(await file.text())
  }

  throw new Error(`Tipo de arquivo não suportado: .${extension || '?'}`)
}

const ATTACHED_FILES_BLOCK = /\n*<attached-files>[\s\S]*?<\/attached-files>\s*$/

export function buildMessageWithAttachments(
  text: string,
  attachments: { name: string; content: string }[]
): string {
  if (attachments.length === 0) return text

  const block = attachments
    .map(
      (attachment) =>
        `<file name="${attachment.name.replace(/"/g, "'")}">\n${attachment.content}\n</file>`
    )
    .join('\n')

  return `${text}\n\n<attached-files>\n${block}\n</attached-files>`
}

export interface ParsedAttachedMessage {
  text: string
  attachments: { name: string }[]
}

export function parseMessageAttachments(content: string): ParsedAttachedMessage {
  const match = content.match(/<attached-files>([\s\S]*?)<\/attached-files>/)
  if (!match) return { text: content, attachments: [] }

  const text = content.replace(ATTACHED_FILES_BLOCK, '').trim()
  const names = Array.from(match[1].matchAll(/<file name="([^"]*)">/g)).map((m) => m[1])

  return { text, attachments: names.map((name) => ({ name })) }
}
