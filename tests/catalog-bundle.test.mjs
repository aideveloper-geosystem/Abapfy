import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ALGORITHM, loadBundle, publishBundle, validateBundle } from '../scripts/catalog-bundle.mjs'
import { loadTs } from './load-typescript.mjs'

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'abapfy-bundle-'))
  const modelPath = path.join(root, 'model.gguf'),
    executablePath = path.join(root, 'runtime', 'llama-server.exe')
  await mkdir(path.dirname(executablePath))
  await writeFile(executablePath, 'fixture-runtime')
  await writeFile(path.join(root, 'runtime', 'ggml.dll'), 'fixture-dll')
  for (const name of ['msvcp140.dll', 'vcruntime140.dll', 'vcruntime140_1.dll'])
    await writeFile(path.join(root, 'runtime', name), 'fixture-crt')
  await writeFile(modelPath, 'fixture-model')
  const catalog = [
    {
      id: 'badi:ME_PROCESS_PO_CUST',
      type: 'badi',
      name: 'ME_PROCESS_PO_CUST',
      description: 'Pedido de compra',
      interface: '',
      package: 'ME',
      program: '',
      relatedObjects: [],
      source: 'BADI.csv'
    }
  ]
  const info = await stat(modelPath)
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(catalog))
    .update(`${modelPath}:${info.size}:${info.mtimeMs}:${ALGORITHM}`)
    .digest('hex')
  const catalogPath = path.join(root, 'catalog.json'),
    indexPath = path.join(root, 'index.json')
  await writeFile(catalogPath, JSON.stringify(catalog))
  await writeFile(
    indexPath,
    JSON.stringify({
      fingerprint,
      vectors: [Array.from({ length: 768 }, (_, i) => (i === 0 ? 0.125 : 0.001))]
    })
  )
  return {
    root,
    args: {
      catalogPath,
      indexPath,
      modelPath,
      executablePath,
      output: path.join(root, 'published'),
      version: 'v1'
    }
  }
}
test('pacote inclui runtime/modelo/licenças e mantém o índice em outra instalação sem reindexar', async () => {
  const { root, args } = await fixture()
  const result = await publishBundle(args)
  assert.equal(result.records, 1)
  const destination = path.join(root, 'another-install')
  await cp(args.output, destination, { recursive: true })
  const relocated = await loadBundle(destination)
  assert.equal(relocated.vectors[0][0], 0.125)
  assert.equal(relocated.catalog[0].name, 'ME_PROCESS_PO_CUST')
  assert.equal(relocated.embeddingModel, path.join(destination, 'embedding-model.gguf'))
  assert.ok(relocated.manifest.files['runtime/ggml.dll'])
  assert.ok(relocated.manifest.files['LICENSE-embeddinggemma.txt'])
  assert.equal(relocated.manifest.files['index.f32'].bytes, 3072)
})
test('índice incompleto, modelo diferente e corrupção impedem publicação ou carregamento', async () => {
  const { args } = await fixture()
  await publishBundle(args)
  await writeFile(args.indexPath, JSON.stringify({ fingerprint: 'invalid', vectors: [] }))
  await assert.rejects(publishBundle({ ...args, version: 'v2' }), /Indexe a base completa/)
  assert.equal((await validateBundle(args.output)).manifest.version, 'v1')
  await writeFile(path.join(args.output, 'embedding-model.gguf'), 'corrupted-blob')
  await assert.rejects(loadBundle(args.output), /Arquivo inválido/)
})
test('manifestos não podem apontar para arquivos fora do pacote', async () => {
  const { args } = await fixture()
  await publishBundle(args)
  const file = path.join(args.output, 'manifest.json'),
    manifest = JSON.parse(await readFile(file, 'utf8'))
  manifest.files['../outside'] = { bytes: 1, sha256: 'a'.repeat(64) }
  await writeFile(file, JSON.stringify(manifest))
  await assert.rejects(validateBundle(args.output), /Caminho inválido/)
})
test('sessão e papel administrativo são verificados no servidor antes de operações nativas', async () => {
  let identity = 'user-a',
    role = 'USER',
    requests = 0
  const { requireCatalogAdmin } = loadTs(
    'src/main/catalogAdminAuth.ts',
    {},
    {
      process: {
        env: { ABAPFY_SUPABASE_URL: 'https://example.test', ABAPFY_SUPABASE_ANON_KEY: 'public' }
      },
      fetch: async (url) => {
        requests++
        return {
          ok: true,
          json: async () => (url.includes('/auth/') ? { id: identity } : [{ role }])
        }
      }
    }
  )
  await assert.rejects(requireCatalogAdmin('user-a', null), /Sessão/)
  assert.equal(requests, 0)
  await assert.rejects(requireCatalogAdmin('user-a', 'token'), /administradores/)
  role = 'ADMIN'
  await requireCatalogAdmin('user-a', 'token')
  identity = 'user-b'
  await assert.rejects(requireCatalogAdmin('user-a', 'token'), /inválida/)
})
test('ditado só envia Win+H se a janela estiver em foco e usa helper oculto sem gravação', async () => {
  const calls = []
  const { openWindowsDictation } = loadTs(
    'src/main/windowsDictation.ts',
    {
      'node:child_process': {
        execFile: (file, args, options, callback) => {
          calls.push({ file, args, options })
          callback(null, '', '')
        }
      }
    },
    { process: { platform: 'win32' } }
  )
  await assert.rejects(openWindowsDictation({ isFocused: () => false }), /campo de mensagem/)
  assert.equal(calls.length, 0)
  const handle = Buffer.alloc(8)
  handle.writeBigUInt64LE(123n)
  await openWindowsDictation({ isFocused: () => true, getNativeWindowHandle: () => handle })
  assert.equal(calls[0].options.windowsHide, true)
  const script = Buffer.from(calls[0].args.at(-1), 'base64').toString('utf16le')
  assert.match(script, /GetForegroundWindow/)
  assert.match(script, /Key\(91,false\),Key\(72,false\)/)
  assert.match(script, /Open\(123\)/)
})
