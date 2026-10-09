import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import * as filesystem from 'node:fs/promises'
import path from 'node:path'
import { loadTs } from './load-typescript.mjs'
import assert from 'node:assert/strict'

const live = path.join(process.env.APPDATA, 'abapfy/local-features')
const root = await mkdtemp(path.resolve('tmp/local-ai-tests/search-'))
await mkdir(path.join(root, 'local-features'))
const manifest = JSON.parse(await readFile('.local-ai/runtime.json', 'utf8'))
await writeFile(path.join(root, 'local-features/diagnostic-user.json'), JSON.stringify({ ...manifest, embeddingBackend: 'vulkan' }))
const handlers = new Map(), webContents = {}
const service = loadTs('src/main/localFeatures.ts', {
  electron: { app: { getPath: () => root, getAppPath: () => path.resolve('.') }, ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, dialog: {} },
  'node:fs/promises': { ...filesystem, readFile: (file, ...args) => filesystem.readFile(['catalog.json', 'index.json'].includes(path.basename(file)) ? path.join(live, path.basename(file)) : file, ...args) }
}, { fetch })
service.registerLocalFeatures(() => ({ webContents }))
const report = []
try {
  for (const query of [
    'Preciso validar informações do pedido de compra antes de salvar, em SAP ECC, nas transações ME21N/ME22N. Consulte o catálogo local e ranqueie os pontos de enhancement candidatos. Cite o nome e o CSV de origem. Separe o que a base comprova do que preciso verificar no SAP. Não invente métodos ou assinaturas.',
    'validar informações do pedido de compra antes de salvar ME21N ME22N',
    'pedido de compra',
    'ME_PROCESS_PO_CUST',
    'BAPI_PO_CREATE1'
  ]) {
    const result = await handlers.get('localFeatures:search')({ sender: webContents }, 'diagnostic-user', query)
    assert.equal(result.mode, 'hybrid', result.warning)
    if (query.includes('ME21N')) assert.ok(result.results.some((r) => r.name === 'ME_PROCESS_PO_CUST'))
    if (query === 'ME_PROCESS_PO_CUST' || query === 'BAPI_PO_CREATE1') assert.equal(result.results[0].name, query)
    const item = { query, effectiveQuery: result.query, mode: result.mode, warning: result.warning, candidates: result.results.map((r) => ({ name: r.name, description: r.description, source: r.source })) }
    report.push(item); console.log(JSON.stringify(item))
  }
  await writeFile(path.join(root, 'report.json'), JSON.stringify(report, null, 2))
  console.log(`Relatório: ${path.join(root, 'report.json')}`)
} finally { service.closeLocalFeatures() }
