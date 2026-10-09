import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadTs } from './load-typescript.mjs'

const base = process.argv[2]
if (!base) throw new Error('Uso: node tests/local-ai-native-smoke.mjs <pasta BASE_BADI>')
const root = path.resolve('tmp/local-ai-tests', `native-${Date.now()}`)
await mkdir(path.join(root, 'local-features'), { recursive: true })
const manifest = JSON.parse(await readFile('.local-ai/runtime.json', 'utf8'))
const { CATALOG_FILES, buildCatalog, lexicalRanking } = loadTs('src/main/localCatalog.ts')
const files = Object.fromEntries(
  await Promise.all(
    CATALOG_FILES.map(async (name) => [name, await readFile(path.join(base, name), 'utf8')])
  )
)
const started = performance.now()
const complete = buildCatalog(files)
assert.equal(complete.length, 11685)
const catalogMs = Math.round(performance.now() - started)
const selectedNames = new Set([
  'ME_PROCESS_PO_CUST',
  'MB_DOCUMENT_BADI',
  'LE_SHP_DELIVERY_PROC',
  'BAPI_PO_CREATE1',
  'BAPI_SALESORDER_CREATEFROMDAT2',
  'BAPI_GOODSMVT_CREATE',
  'BAPI_USER_GET_DETAIL'
])
const sample = [
  ...complete.filter((r) => selectedNames.has(r.name)),
  ...complete.slice(0, 12),
  ...complete.filter((r) => r.type === 'bapi').slice(0, 8)
]
assert.ok(sample.some((r) => r.name === 'ME_PROCESS_PO_CUST'))
await writeFile(path.join(root, 'local-features/catalog.json'), JSON.stringify(sample))
await writeFile(path.join(root, 'local-features/native-user.json'), JSON.stringify(manifest))
const handlers = new Map(),
  webContents = {}
const service = loadTs(
  'src/main/localFeatures.ts',
  {
    electron: {
      app: { getPath: (kind) => (kind === 'temp' ? root : root), getAppPath: () => root },
      dialog: {},
      ipcMain: { handle: (name, handler) => handlers.set(name, handler) }
    },
    './catalogAdminAuth': { requireCatalogAdmin: async () => {} },
    '../../scripts/catalog-bundle.mjs': { loadBundle: async () => null },
    'node:fs/promises': {
      ...(await import('node:fs/promises')),
      access: async (file) => {
        if (String(file).endsWith('manifest.json')) throw new Error('not installed')
        await (await import('node:fs/promises')).access(file)
      }
    }
  },
  { fetch, setInterval, clearInterval }
)
service.registerLocalFeatures(() => ({ webContents }))
const invoke = (name, ...args) =>
  handlers.get(`localFeatures:${name}`)({ sender: webContents }, 'native-user', ...args)
const report = {
  fullCatalogCount: complete.length,
  catalogMs,
  sampleCount: sample.length,
  nativeVersions: manifest.releases
}
try {
  const indexingStart = performance.now()
  await invoke('indexCatalog')
  const deadline = Date.now() + 180000
  while (Date.now() < deadline && (await invoke('status')).indexing)
    await new Promise((resolve) => setTimeout(resolve, 500))
  const status = await invoke('status')
  if (status.indexError) throw new Error(status.indexError)
  assert.equal(status.indexedCount, sample.length)
  report.sampleIndexMs = Math.round(performance.now() - indexingStart)
  const queryStart = performance.now()
  const result = await invoke('search', 'validar informações do pedido de compra')
  assert.equal(result.mode, 'hybrid')
  report.queryMs = Math.round(performance.now() - queryStart)
  report.semanticCandidates = result.results.map((r) => r.name)
  assert.ok(result.results.some((r) => r.name === 'ME_PROCESS_PO_CUST'))
  assert.equal((await invoke('search', 'ME_PROCESS_PO_CUST')).results[0].name, 'ME_PROCESS_PO_CUST')
  console.log(JSON.stringify(report, null, 2))
  await writeFile(path.join(root, 'report.json'), JSON.stringify(report, null, 2))
} finally {
  service.closeLocalFeatures()
}
