import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'

/** One native helper, serialized JSON requests, no retries after uncertain input. */
export class SapNativeWorker {
  private child: ChildProcessWithoutNullStreams | null = null
  private sequence = 0
  private queue: Promise<unknown> = Promise.resolve()
  private pending: { id: number; resolve: (value: unknown) => void; reject: (error: Error) => void } | null = null

  constructor(private readonly script: string) {}

  close(): void {
    const child = this.child
    this.child = null
    this.pending?.reject(new Error('O auxiliar SAP foi interrompido. Confira o estado da janela antes de repetir uma ação.'))
    this.pending = null
    child?.kill()
  }

  run(request: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    const result = this.queue.then(() => this.execute(request, signal))
    this.queue = result.catch(() => undefined)
    return result
  }

  private start(): ChildProcessWithoutNullStreams {
    if (this.child) return this.child
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand',
      Buffer.from("[Console]::InputEncoding = [Text.UTF8Encoding]::new($false); $source = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadLine())); & ([ScriptBlock]::Create($source))", 'utf16le').toString('base64')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    this.child = child
    // The fixed application script is sent once, separately from JSON request data.
    child.stdin.write(Buffer.from(this.script, 'utf8').toString('base64') + '\n')
    child.stderr.resume()
    const lines = createInterface({ input: child.stdout })
    lines.on('line', (line) => {
      if (this.child !== child) return
      try {
        if (line.length > 10 * 1024 * 1024) throw new Error('Resposta SAP muito grande.')
        const data = JSON.parse(line.replace(/^\uFEFF/, '')) as { id: number; ok: boolean; result?: unknown; error?: string }
        if (!this.pending || data.id !== this.pending.id || typeof data.ok !== 'boolean') throw new Error('Resposta SAP fora de sequência.')
        const pending = this.pending
        this.pending = null
        if (data.ok) pending.resolve(data.result)
        else pending.reject(new Error(data.error || 'A entrada SAP falhou.'))
      } catch { this.close() }
    })
    const onFailure = (): void => { if (this.child === child) this.close() }
    child.on('error', onFailure)
    child.on('close', () => { lines.close(); onFailure() })
    child.stdin.on('error', onFailure)
    return child
  }

  private execute(request: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    if (signal?.aborted) return Promise.reject(new Error('Ação SAP interrompida.'))
    const child = this.start()
    return new Promise((resolve, reject) => {
      const id = ++this.sequence
      const cleanup = (): void => { clearTimeout(timeout); signal?.removeEventListener('abort', abort) }
      const abort = (): void => this.close()
      const timeout = setTimeout(() => this.close(), 30_000)
      this.pending = {
        id,
        resolve: (value) => { cleanup(); resolve(value) },
        reject: (error) => { cleanup(); reject(error) }
      }
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) { abort(); return }
      child.stdin.write(JSON.stringify({ ...request, id }) + '\n', (error) => { if (error && this.child === child) this.close() })
    })
  }
}
