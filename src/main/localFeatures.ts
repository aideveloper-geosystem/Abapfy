import { app, dialog, ipcMain, type BrowserWindow } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createServer } from 'node:net'
import { access, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import {
  DEFAULT_LOCAL_FEATURES,
  type LocalFeatureSettings,
  type LocalFeatureStatus,
  type LocalSearchResult,
  type SapCatalogEntry
} from '../shared/localFeatures'
import {
  buildCatalog,
  catalogQuery,
  CATALOG_FILES,
  cosine,
  documentText,
  hybridRanking,
  lexicalRanking
} from './localCatalog'
import { loadBundle, publishBundle, type LoadedBundle } from '../../scripts/catalog-bundle.mjs'
import { archiveCatalog } from '../../scripts/catalog-archive.mjs'
import { openWindowsDictation } from './windowsDictation'
import { requireCatalogAdmin } from './catalogAdminAuth'
import { compactionSettingsSchema, contextSnapshotSchema } from '../shared/compaction'

interface Index {
  fingerprint: string
  vectors: number[][]
}
const configs = new Map<string, LocalFeatureSettings>()
let catalog: SapCatalogEntry[] | null = null
let index: Index | null = null
let indexError: string | null = null
let indexing: { userId: string; controller: AbortController } | null = null
let embeddingProcess: ChildProcess | null = null
let embeddingUrl = '',
  embeddingKey = ''
let embeddingRuntime: string | null = null
let catalogHash: ReturnType<typeof createHash> | null = null
let bundled: Promise<LoadedBundle | null> | null = null
function installedBundle(): Promise<LoadedBundle | null> {
  bundled ??= (async () => {
    const folder = app.isPackaged
      ? join(process.resourcesPath, 'local-search')
      : join(app.getAppPath(), 'resources', 'local-search')
    if (!(await exists(join(folder, 'manifest.json')))) {
      if (app.isPackaged)
        throw new Error(
          'Esta atualizacao nao contem o catalogo SAP. Instale uma atualizacao completa.'
        )
      return null
    }
    return loadBundle(folder)
  })()
  return bundled
}
let searchController: AbortController | null = null
let runtimeQueue: Promise<unknown> = Promise.resolve()

function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = runtimeQueue.then(fn, fn)
  runtimeQueue = next.catch(() => undefined)
  return next
}
function root(): string {
  return join(app.getPath('userData'), 'local-features')
}
function validateUser(userId: string): void {
  if (typeof userId !== 'string' || !/^[a-z0-9-]{1,80}$/i.test(userId))
    throw new Error('Usuário inválido.')
}
async function atomicJson(path: string, value: unknown): Promise<void> {
  await mkdir(root(), { recursive: true })
  await writeFile(`${path}.tmp`, JSON.stringify(value))
  await rename(`${path}.tmp`, path)
}
async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback
    throw error
  }
}
async function settings(userId: string): Promise<LocalFeatureSettings> {
  validateUser(userId)
  if (!configs.has(userId)) {
    const saved = await readJson<Partial<LocalFeatureSettings>>(join(root(), `${userId}.json`), {})
    const installed = await readJson<Partial<LocalFeatureSettings>>(
      join(app.getAppPath(), '.local-ai', 'runtime.json'),
      {}
    )
    const value = { ...DEFAULT_LOCAL_FEATURES }
    value.compaction = compactionSettingsSchema.safeParse(saved.compaction).success
      ? compactionSettingsSchema.parse(saved.compaction)
      : { ...DEFAULT_LOCAL_FEATURES.compaction }
    value.embeddingBackend = saved.embeddingBackend === 'vulkan' ? 'vulkan' : 'cpu'
    for (const field of [
      'embeddingExecutable',
      'embeddingModel',
      'embeddingVulkanExecutable'
    ] as const) {
      if (typeof saved[field] === 'string' && saved[field]) value[field] = saved[field]!
      else if (typeof installed[field] === 'string') value[field] = installed[field]!
    }
    configs.set(userId, value)
  }
  return configs.get(userId)!
}
async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return Boolean(path)
  } catch {
    return false
  }
}
async function loadCatalog(): Promise<void> {
  if (!catalog) catalog = await readJson<SapCatalogEntry[]>(join(root(), 'catalog.json'), [])
  if (!index)
    index = await readJson<Index>(join(root(), 'index.json'), { fingerprint: '', vectors: [] })
}
async function fingerprint(config: LocalFeatureSettings): Promise<string> {
  const model = await stat(config.embeddingModel)
  // Clone the catalog hash state to preserve existing checkpoint fingerprints.
  catalogHash ??= createHash('sha256').update(JSON.stringify(catalog))
  return catalogHash
    .copy()
    .update(
      `${config.embeddingModel}:${model.size}:${model.mtimeMs}:embeddinggemma2:768:search-prefix-v1`
    )
    .digest('hex')
}
export async function localFeatureStatus(userId: string): Promise<LocalFeatureStatus> {
  const value = await settings(userId)
  await loadCatalog()
  const embeddingReady =
    (await exists(
      value.embeddingBackend === 'vulkan'
        ? value.embeddingVulkanExecutable
        : value.embeddingExecutable
    )) && (await exists(value.embeddingModel))
  const compatible = embeddingReady && index?.fingerprint === (await fingerprint(value))
  return {
    settings: { ...value },
    embeddingReady,
    catalogCount: catalog!.length,
    indexedCount: compatible ? index!.vectors.length : 0,
    indexing: Boolean(indexing),
    indexError,
    embeddingRuntime
  }
}
function stopEmbedding(): void {
  embeddingProcess?.kill()
  embeddingProcess = null
  embeddingKey = ''
  embeddingUrl = ''
  embeddingRuntime = null
}
export function closeLocalFeatures(): void {
  indexing?.controller.abort()
  searchController?.abort()
  stopEmbedding()
}
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close((error) => (error ? reject(error) : resolve(port)))
    })
  })
}
async function ensureEmbedding(config: LocalFeatureSettings, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted()
  const executable =
    config.embeddingBackend === 'vulkan'
      ? config.embeddingVulkanExecutable
      : config.embeddingExecutable
  const key = `${executable}|${config.embeddingModel}|${config.embeddingBackend}`
  if (embeddingProcess && embeddingKey === key && embeddingUrl) return embeddingUrl
  stopEmbedding()
  if (!(await exists(executable)) || !(await exists(config.embeddingModel)))
    throw new Error('O runtime do catalogo nao esta disponivel nesta instalacao.')
  const port = await freePort()
  const url = `http://127.0.0.1:${port}`
  const child = spawn(
    executable,
    [
      '-m',
      config.embeddingModel,
      '--embedding',
      '--pooling',
      'mean',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '-c',
      '8192',
      '-b',
      '2048',
      '-ub',
      '2048',
      '-np',
      '1',
      '-t',
      '4',
      '-tb',
      '4',
      '-lv',
      '4',
      '-ngl',
      config.embeddingBackend === 'vulkan' ? '99' : '0'
    ],
    { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
  )
  embeddingProcess = child
  embeddingKey = key
  let failure = '',
    tail = '',
    startupLog = ''
  child.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString()
    tail = (tail + text).slice(-2000)
    startupLog = (startupLog + text).slice(-64000)
  })
  child.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString()
    tail = (tail + text).slice(-2000)
    startupLog = (startupLog + text).slice(-64000)
  })
  child.on('error', (error) => {
    failure = error.message
  })
  child.on('exit', () => {
    if (embeddingProcess === child) {
      embeddingProcess = null
      embeddingUrl = ''
      embeddingKey = ''
    }
    failure ||= tail || 'Servidor de embeddings encerrado.'
  })
  const abort = (): void => {
    child.kill()
  }
  signal.addEventListener('abort', abort, { once: true })
  try {
    const deadline = Date.now() + 90000
    while (Date.now() < deadline) {
      signal.throwIfAborted()
      if (failure) throw new Error(failure)
      try {
        const response = await fetch(`${url}/health`, {
          signal: AbortSignal.any([signal, AbortSignal.timeout(1000)])
        })
        if (response.ok) {
          const offloaded = /offloaded (\d+)\/\d+ layers to GPU/.exec(startupLog)
          if (config.embeddingBackend === 'vulkan' && (!offloaded || Number(offloaded[1]) === 0))
            throw new Error(
              'Vulkan não transferiu camadas para a GPU. Selecione CPU ou verifique o driver/runtime.'
            )
          const device = /using device Vulkan\d+ \(([^\n]+?)\) \(/.exec(startupLog)?.[1]
          embeddingRuntime =
            config.embeddingBackend === 'vulkan'
              ? `GPU Vulkan · ${device || 'dispositivo Vulkan'} · ${offloaded![1]} camadas na GPU`
              : 'CPU · 4 threads'
          embeddingUrl = url
          return url
        }
      } catch (error) {
        signal.throwIfAborted()
        if ((error as Error).message.startsWith('Vulkan não')) throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    throw new Error('Tempo excedido ao iniciar EmbeddingGemma 2.')
  } catch (error) {
    child.kill()
    throw error
  } finally {
    signal.removeEventListener('abort', abort)
  }
}
async function embed(
  config: LocalFeatureSettings,
  texts: string[],
  signal: AbortSignal
): Promise<number[][]> {
  const url = await ensureEmbedding(config, signal)
  const response = await fetch(`${url}/v1/embeddings`, {
    method: 'POST',
    signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: texts, model: 'embeddinggemma-2' })
  })
  if (!response.ok)
    throw new Error(`Embedding local ${response.status}: ${(await response.text()).slice(0, 400)}`)
  const data = (await response.json()) as { data?: Array<{ index: number; embedding: number[] }> }
  const vectors = [...(data.data ?? [])].sort((a, b) => a.index - b.index).map((r) => r.embedding)
  if (
    vectors.length !== texts.length ||
    vectors.some(
      (v) =>
        !Array.isArray(v) ||
        v.length !== 768 ||
        v.some((n) => typeof n !== 'number' || !Number.isFinite(n)) ||
        !v.some((n) => n !== 0)
    )
  )
    throw new Error('O modelo não retornou embeddings válidos de 768 dimensões.')
  return vectors
}
async function indexCatalog(userId: string): Promise<void> {
  const config = await settings(userId)
  await loadCatalog()
  if (!catalog!.length) throw new Error('Importe BASE_BADI primeiro.')
  const controller = indexing?.controller ?? new AbortController()
  indexing = { userId, controller }
  indexError = null
  try {
    const key = await fingerprint(config)
    if (index!.fingerprint !== key) index = { fingerprint: key, vectors: [] }
    // Checkpoints permit continuation after cancellation or application restart.
    while (index!.vectors.length < catalog!.length) {
      controller.signal.throwIfAborted()
      const start = index!.vectors.length
      const vectors = await serial(() =>
        embed(config, catalog!.slice(start, start + 4).map(documentText), controller.signal)
      )
      index!.vectors.push(...vectors)
      if (index!.vectors.length % 128 === 0 || index!.vectors.length === catalog!.length)
        await atomicJson(join(root(), 'index.json'), index)
    }
  } catch (error) {
    indexError = controller.signal.aborted
      ? 'Indexação interrompida. Clique em indexar para continuar.'
      : (error as Error).message
    if (index) await atomicJson(join(root(), 'index.json'), index)
  } finally {
    indexing = null
  }
}
export async function searchLocalCatalog(
  userId: string,
  query: string
): Promise<LocalSearchResult> {
  let config = await settings(userId)
  const shipped = await installedBundle()
  if (shipped)
    config = {
      ...config,
      embeddingExecutable: shipped.embeddingExecutable,
      embeddingModel: shipped.embeddingModel,
      embeddingBackend: 'cpu'
    }
  if (typeof query !== 'string' || !query.trim() || query.length > 4000)
    throw new Error('Consulta inválida ou maior que 4000 caracteres.')
  await loadCatalog()
  const activeCatalog = shipped?.catalog ?? catalog!
  const activeVectors = shipped?.vectors ?? index!.vectors
  const effectiveQuery = catalogQuery(query)
  const wantsEnhancements =
    /\bbadis?\b|\bbadís?\b|\benhancements?\b/i.test(query) && !/\bbapis?\b/i.test(query)
  const eligible = (i: number): boolean => !wantsEnhancements || activeCatalog[i].type === 'badi'
  const lexical = lexicalRanking(activeCatalog, effectiveQuery).filter((r) => eligible(r.index))
  let ranking = lexical.slice(0, 8),
    mode: LocalSearchResult['mode'] = 'lexical',
    warning: string | undefined
  const controller = new AbortController()
  searchController = controller
  try {
    if (!activeCatalog.length) throw new Error('Catálogo local não importado.')
    if (
      activeVectors.length !== activeCatalog.length ||
      (!shipped && index!.fingerprint !== (await fingerprint(config)))
    )
      throw new Error(
        'Índice semântico incompleto ou desatualizado; consulta somente por palavras-chave.'
      )
    const [vector] = await serial(() =>
      embed(config, [`task: search result | query: ${effectiveQuery}`], controller.signal)
    )
    controller.signal.throwIfAborted()
    const semantic = activeVectors
      .map((v, i) => ({ index: i, score: eligible(i) ? cosine(vector, v) : -Infinity }))
      .filter((r) => Number.isFinite(r.score))
      .sort((a, b) => b.score - a.score)
      .slice(0, 40)
    ranking = hybridRanking(lexical, semantic)
    mode = 'hybrid'
  } catch (error) {
    warning = (error as Error).message
  } finally {
    if (searchController === controller) searchController = null
  }
  if (controller.signal.aborted) return { mode: 'disabled', results: [] }
  return {
    mode,
    query: effectiveQuery,
    results: ranking.map((r) => ({
      ...activeCatalog[r.index],
      relatedObjects: activeCatalog[r.index].relatedObjects.slice(0, 30),
      score: r.score
    })),
    ...(warning ? { warning } : {})
  }
}
export function registerLocalFeatures(getWindow: () => BrowserWindow | null): void {
  const handle = (
    name: string,
    fn: (userId: string, ...args: unknown[]) => Promise<unknown>
  ): void => {
    ipcMain.handle(`localFeatures:${name}`, (event, userId: string, ...args: unknown[]) => {
      if (event.sender !== getWindow()?.webContents) throw new Error('Janela não autorizada.')
      validateUser(userId)
      return fn(userId, ...args)
    })
  }
  handle('status', localFeatureStatus)
  handle('setCompaction', async (userId, value) => {
    const config = await settings(userId)
    config.compaction = compactionSettingsSchema.parse(value)
    await atomicJson(join(root(), `${userId}.json`), config)
    return localFeatureStatus(userId)
  })
  const contextPath = (userId: string, chatId: unknown): string => {
    if (typeof chatId !== 'string' || !/^[a-z0-9-]{1,100}$/i.test(chatId))
      throw new Error('Chat inválido.')
    return join(root(), 'contexts', userId, `${chatId}.json`)
  }
  handle('loadContext', async (userId, chatId) => {
    const saved = await readJson(contextPath(userId, chatId), null)
    const parsed = contextSnapshotSchema.safeParse(saved)
    return parsed.success ? parsed.data : null
  })
  handle('saveContext', async (userId, chatId, snapshot) => {
    const value = contextSnapshotSchema.parse(snapshot)
    if (JSON.stringify(value).length > 100000)
      throw new Error('Resumo de contexto excede o limite local.')
    const path = contextPath(userId, chatId)
    await mkdir(join(root(), 'contexts', userId), { recursive: true })
    await atomicJson(path, value)
  })
  handle('setEmbeddingBackend', async (userId, backend, token) => {
    await requireCatalogAdmin(userId, token)
    if (backend !== 'cpu' && backend !== 'vulkan') throw new Error('Backend inválido.')
    if (indexing) throw new Error('Interrompa a indexação antes de alterar CPU/GPU.')
    const config = await settings(userId)
    searchController?.abort()
    stopEmbedding()
    config.embeddingBackend = backend
    await atomicJson(join(root(), `${userId}.json`), config)
    return localFeatureStatus(userId)
  })
  handle('pickRuntimeFile', async (userId, field, token) => {
    await requireCatalogAdmin(userId, token)
    const fields = ['embeddingExecutable', 'embeddingModel', 'embeddingVulkanExecutable'] as const
    if (!fields.includes(field as (typeof fields)[number])) throw new Error('Campo inválido.')
    if (indexing) throw new Error('Interrompa a indexação antes de alterar o runtime.')
    const executable = String(field).endsWith('Executable')
    const picked = await dialog.showOpenDialog(getWindow()!, {
      title: `Selecionar ${String(field)}`,
      properties: ['openFile'],
      filters: [
        {
          name: executable ? 'Executável local' : 'Modelo local',
          extensions: executable ? ['exe'] : ['gguf']
        }
      ]
    })
    if (!picked.canceled && picked.filePaths[0]) {
      if (executable && basename(picked.filePaths[0]).toLowerCase() !== 'llama-server.exe')
        throw new Error('Selecione llama-server.exe.')
      const config = await settings(userId)
      config[field as (typeof fields)[number]] = picked.filePaths[0]
      stopEmbedding()
      await atomicJson(join(root(), `${userId}.json`), config)
    }
    return localFeatureStatus(userId)
  })
  handle('importCatalog', async (userId, token) => {
    await requireCatalogAdmin(userId, token)
    if (indexing) throw new Error('Interrompa a indexação antes de importar.')
    const picked = await dialog.showOpenDialog(getWindow()!, {
      title: 'Selecionar pasta BASE_BADI',
      properties: ['openDirectory']
    })
    if (!picked.canceled && picked.filePaths[0]) {
      const files: Record<string, string> = {}
      for (const name of CATALOG_FILES) {
        const path = join(picked.filePaths[0], name)
        if ((await stat(path)).size > 100 * 1024 * 1024) throw new Error('CSV maior que 100 MB.')
        files[name] = await readFile(path, 'utf8')
        if (files[name].includes('\uFFFD')) throw new Error('CSV deve estar em UTF-8.')
      }
      const next = buildCatalog(files)
      await atomicJson(join(root(), 'catalog.json'), next)
      catalog = next
      catalogHash = null
      index = { fingerprint: '', vectors: [] }
      indexError = null
      await atomicJson(join(root(), 'index.json'), index)
    }
    return localFeatureStatus(userId)
  })
  handle('indexCatalog', async (userId, token) => {
    await requireCatalogAdmin(userId, token)
    if (indexing) throw new Error('Indexação já em andamento.')
    // Establish ownership before returning to the renderer; indexCatalog updates progress.
    indexing = { userId, controller: new AbortController() }
    void indexCatalog(userId).catch((error: Error) => {
      indexError = error.message
      indexing = null
    })
    return localFeatureStatus(userId)
  })
  handle('publishCatalog', async (userId, token) => {
    await requireCatalogAdmin(userId, token)
    if (indexing) throw new Error('Aguarde a indexacao terminar antes de publicar.')
    const config = await settings(userId)
    const chosen = await dialog.showOpenDialog(getWindow()!, {
      title: 'Pasta do pacote para a proxima atualizacao',
      properties: ['openDirectory'],
      defaultPath: app.isPackaged ? undefined : join(app.getAppPath(), 'resources')
    })
    if (chosen.canceled || !chosen.filePaths[0]) return null
    const published = await publishBundle({
      catalogPath: join(root(), 'catalog.json'),
      indexPath: join(root(), 'index.json'),
      modelPath: config.embeddingModel,
      executablePath: config.embeddingExecutable,
      output: join(chosen.filePaths[0], 'local-search'),
      legalDirectory: app.isPackaged
        ? join(process.resourcesPath, 'local-search')
        : join(app.getAppPath(), 'resources', 'local-search-licenses'),
      version: new Date().toISOString().replace(/[:.]/g, '-')
    })
    const archive = await archiveCatalog(published.directory)
    bundled = null
    return { ...published, ...archive }
  })
  handle('cancelIndex', async (userId, token) => {
    await requireCatalogAdmin(userId, token)
    if (indexing?.userId === userId) indexing.controller.abort()
  })
  handle('cancel', async () => {
    searchController?.abort()
  })
  handle('search', (userId, query) => searchLocalCatalog(userId, query as string))
  ipcMain.handle('localFeatures:openWindowsDictation', async (event) => {
    const window = getWindow()
    if (!window || event.sender !== window.webContents) throw new Error('Janela nao autorizada.')
    await openWindowsDictation(window)
  })
}
