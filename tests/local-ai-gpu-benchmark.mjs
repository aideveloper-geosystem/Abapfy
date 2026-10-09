import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadTs } from './load-typescript.mjs'

const base = process.argv[2]
if (!base) throw new Error('Uso: node tests/local-ai-gpu-benchmark.mjs <BASE_BADI>')
const manifest = JSON.parse(await readFile('.local-ai/runtime.json', 'utf8'))
const { CATALOG_FILES, buildCatalog } = loadTs('src/main/localCatalog.ts')
const files = Object.fromEntries(await Promise.all(CATALOG_FILES.map(async (name) => [name, await readFile(path.join(base, name), 'utf8')])))
const complete = buildCatalog(files)
// Spread the same real records across the complete catalog for both backends.
const sample = Array.from({ length: 64 }, (_, i) => complete[Math.floor(i * complete.length / 64)])
const root = path.resolve('tmp/local-ai-tests', `gpu-${Date.now()}`)
const report = { release: manifest.releases.llama, sampleCount: sample.length, backends: {} }
await mkdir(root, { recursive: true })
for (const backend of ['cpu', 'vulkan']) {
  const directory = path.join(root, backend)
  await mkdir(path.join(directory, 'local-features'), { recursive: true })
  await writeFile(path.join(directory, 'local-features/catalog.json'), JSON.stringify(sample))
  await writeFile(path.join(directory, 'local-features/benchmark-user.json'), JSON.stringify({ ...manifest, embeddingBackend: backend }))
  const handlers = new Map(), webContents = {}
  const service = loadTs('src/main/localFeatures.ts', {
    './catalogAdminAuth': { requireCatalogAdmin: async () => {} },
    electron: { app: { getPath: () => directory, getAppPath: () => root }, dialog: {}, ipcMain: { handle: (name, handler) => handlers.set(name, handler) } }
  }, { fetch })
  service.registerLocalFeatures(() => ({ webContents }))
  const invoke = (name, ...args) => handlers.get(`localFeatures:${name}`)({ sender: webContents }, 'benchmark-user', ...args)
  try {
    console.log(`Iniciando ${backend}: ${sample.length} registros reais`)
    const started = performance.now()
    await invoke('indexCatalog')
    const deadline = Date.now() + 240000
    let status
    do { await new Promise((resolve) => setTimeout(resolve, 500)); status = await invoke('status') } while (status.indexing && Date.now() < deadline)
    assert.equal(status.indexing, false, 'Tempo excedido')
    if (status.indexError) throw new Error(status.indexError)
    assert.equal(status.indexedCount, sample.length)
    const indexMs = Math.round(performance.now() - started)
    const queryStart = performance.now()
    const result = await invoke('search', 'validar informações do pedido de compra')
    assert.equal(result.mode, 'hybrid', result.warning)
    const queryMs = Math.round(performance.now() - queryStart)
    const saved = JSON.parse(await readFile(path.join(directory, 'local-features/index.json'), 'utf8'))
    const switched = await invoke('setEmbeddingBackend', backend === 'cpu' ? 'vulkan' : 'cpu')
    assert.equal(switched.indexedCount, sample.length, 'Troca CPU/GPU deve preservar checkpoint')
    report.backends[backend] = { indexMs, queryMs, runtime: status.embeddingRuntime, fingerprint: saved.fingerprint, results: result.results.map((r) => r.name) }
    console.log(JSON.stringify(report.backends[backend]))
  } catch (error) { report.backends[backend] = { error: error.message }; console.log(`${backend}: ${error.message}`) }
  finally { service.closeLocalFeatures() }
}
if (report.backends.cpu.indexMs && report.backends.vulkan.indexMs) {
  assert.equal(report.backends.cpu.fingerprint, report.backends.vulkan.fingerprint)
  report.speedup = report.backends.cpu.indexMs / report.backends.vulkan.indexMs
  const cpu = JSON.parse(await readFile(path.join(root, 'cpu/local-features/index.json'), 'utf8')).vectors
  const gpu = JSON.parse(await readFile(path.join(root, 'vulkan/local-features/index.json'), 'utf8')).vectors
  const { cosine } = loadTs('src/main/localCatalog.ts')
  const agreement = cpu.map((v, i) => cosine(v, gpu[i]))
  report.vectorAgreement = { minCosine: Math.min(...agreement), meanCosine: agreement.reduce((a, b) => a + b, 0) / agreement.length }
  assert.ok(report.vectorAgreement.minCosine > .99, 'Vetores CPU/GPU divergentes')
}
await writeFile(path.join(root, 'report.json'), JSON.stringify(report, null, 2))
console.log(`Relatório: ${path.join(root, 'report.json')}`)
if (report.backends.cpu.error || report.backends.vulkan.error) process.exitCode = 1
