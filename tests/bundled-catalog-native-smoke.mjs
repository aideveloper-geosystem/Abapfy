import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { loadTs } from './load-typescript.mjs'
const profile = await mkdtemp(path.join(os.tmpdir(), 'abapfy-bundled-client-'))
await mkdir(path.join(profile, 'local-features'))
await writeFile(
  path.join(profile, 'local-features/fresh-user.json'),
  JSON.stringify({
    embeddingEnabled: false,
    embeddingModel: 'C:/invalid/old.gguf',
    embeddingExecutable: 'C:/invalid/old.exe'
  })
)
const handlers = new Map(),
  webContents = {}
const service = loadTs(
  'src/main/localFeatures.ts',
  {
    electron: {
      app: { isPackaged: true, getPath: () => profile, getAppPath: () => profile },
      dialog: {},
      ipcMain: { handle: (name, handler) => handlers.set(name, handler) }
    }
  },
  { process: { ...process, resourcesPath: path.resolve(process.argv[2] || 'resources') }, fetch }
)
service.registerLocalFeatures(() => ({ webContents }))
try {
  for (const query of [
    'Preciso validar informações do pedido de compra antes de salvar ME21N ME22N',
    'BAPI_PO_CREATE1'
  ]) {
    const result = await handlers.get('localFeatures:search')(
      { sender: webContents },
      'fresh-user',
      query
    )
    assert.equal(result.mode, 'hybrid', result.warning)
    assert.ok(
      result.results.some(
        (entry) =>
          entry.name === (query.includes('BAPI') ? 'BAPI_PO_CREATE1' : 'ME_PROCESS_PO_CUST')
      )
    )
    console.log(
      JSON.stringify({
        query,
        mode: result.mode,
        candidates: result.results.map((entry) => entry.name)
      })
    )
  }
  assert.equal(handlers.has('localFeatures:transcribe'), false)
  console.log('Cliente novo: busca híbrida sem configuração, importação ou indexação.')
} finally {
  service.closeLocalFeatures()
}
