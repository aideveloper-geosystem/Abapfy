declare module 'pizzip' {
  interface PizZipFile {
    name: string
    date: Date
    asText(): string
    asUint8Array(): Uint8Array
  }

  interface PizZipGenerateOptions {
    type: 'blob' | 'uint8array' | 'string' | 'base64' | 'arraybuffer'
    mimeType?: string
    compression?: 'STORE' | 'DEFLATE'
  }

  class PizZip {
    files: Record<string, PizZipFile>
    constructor(data?: ArrayBuffer | Uint8Array | string, options?: Record<string, unknown>)
    file(name: string): PizZipFile | null
    file(name: string, content: string | Uint8Array | ArrayBuffer, options?: { date?: Date }): PizZip
    generate(options: { type: 'blob'; mimeType?: string; compression?: string }): Blob
    generate(options: PizZipGenerateOptions): unknown
  }

  export default PizZip
}
