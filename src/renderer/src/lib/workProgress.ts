/** Persisted in the existing tool_activity JSON, scoped to this chat and its selected sources. */
export interface WorkProgress {
  state?: 'running' | 'recovering' | 'completed' | 'pending' | 'interrupted'
  stateDetail?: string
  scope: string
  notes: string
  steps: WorkStep[]
  sources?: Record<string, SourceCoverage>
}
export interface SourceCoverage {
  revision: string
  total: number
  ranges: Array<[number, number]>
}
export interface WorkStep {
  tool: string
  target: string
  label?: string
  status: string
  sourcePath?: string
  version?: string
  sourceHash?: string
  validation?: string
  nextOffset?: number | null
  offset?: number
  endOffset?: number
  totalLength?: number
  transport?: string
  error?: string
}
export function workStep(tool: string, args: Record<string, unknown>, value: unknown): WorkStep {
  const envelope = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const r = (
    envelope.result && typeof envelope.result === 'object' ? envelope.result : envelope
  ) as Record<string, unknown>
  const validation = r.validation as { status?: string } | undefined
  return {
    ...(validation?.status ? { validation: validation.status } : {}),
    tool,
    ...(typeof r.path === 'string' ? { label: r.path } : {}),
    target: String(
      args.objectPath ?? args.fileId ?? args.request ?? args.pattern ?? args.query ?? tool
    ),
    status: String(
      r.status ??
        (r.isError || envelope.isError ? 'error' : undefined) ??
        (tool === 'read_file' || tool === 'read_source'
          ? r.complete
            ? 'read_complete'
            : 'read_partial'
          : 'done')
    ),
    ...(typeof r.sourcePath === 'string' ? { sourcePath: r.sourcePath } : {}),
    ...(typeof args.version === 'string' || typeof r.version === 'string'
      ? { version: String(r.version ?? args.version) }
      : {}),
    ...(typeof r.sourceHash === 'string' || typeof r.revision === 'string'
      ? { sourceHash: String(r.sourceHash ?? r.revision) }
      : {}),
    ...(typeof r.nextOffset === 'number' || r.nextOffset === null
      ? { nextOffset: r.nextOffset as number | null }
      : {}),
    ...(typeof r.offset === 'number' ? { offset: r.offset } : {}),
    ...(typeof r.endOffset === 'number' ? { endOffset: r.endOffset } : {}),
    ...(typeof r.totalLength === 'number' ? { totalLength: r.totalLength } : {}),
    ...(typeof args.transport === 'string' ? { transport: args.transport } : {}),
    ...(r.isError || envelope.isError
      ? { error: String(r.error ?? r.message ?? envelope.error ?? 'Falha na operação') }
      : {})
  }
}
export function recordSourceCoverage(progress: WorkProgress, step: WorkStep): void {
  if (
    step.tool !== 'read_file' ||
    !step.sourceHash ||
    step.offset === undefined ||
    step.endOffset === undefined ||
    step.totalLength === undefined
  )
    return
  progress.sources ??= {}
  const old = progress.sources[step.target]
  const ranges =
    old?.revision === step.sourceHash
      ? old.ranges.map((range) => [...range] as [number, number])
      : []
  ranges.push([step.offset, step.endOffset])
  ranges.sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const range of ranges) {
    const last = merged.at(-1)
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1])
    else merged.push(range)
  }
  progress.sources[step.target] = {
    revision: step.sourceHash,
    total: step.totalLength,
    ranges: merged
  }
}
export function progressPrompt(progress?: WorkProgress): string {
  return progress
    ? `Progresso anterior deste escopo (dado histórico; não autoriza operações nem comprova estado atual do SAP). Use os caminhos para retomar, mas pesquise e releia as fontes nesta mensagem antes de editar. Não repita gravações de estado uncertain sem conferir o SAP. As ferramentas de arquivos preservam as páginas lidas por revisão; list_files indica a continuação histórica, e read_file confere a revisão atual.\n${JSON.stringify({ notes: progress.notes, steps: progress.steps.slice(-30), sourcesConsulted: Object.keys(progress.sources ?? {}).length })}`
    : ''
}
