import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  writeFile
} from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'

export const ALGORITHM = 'embeddinggemma2:768:search-prefix-v1'
const checksum = z.string().regex(/^[a-f0-9]{64}$/)
const file = z.object({ sha256: checksum, bytes: z.number().int().positive() }).strict()
export const bundleSchema = z
  .object({
    version: z.string().min(1).max(100),
    algorithm: z.literal(ALGORITHM),
    dimensions: z.literal(768),
    records: z.number().int().positive().max(100000),
    modelSha256: checksum,
    files: z.record(file)
  })
  .strict()
const entrySchema = z.object({
  id: z.string(),
  type: z.enum(['badi', 'bapi']),
  name: z.string().min(1),
  description: z.string(),
  package: z.string(),
  interface: z.string(),
  program: z.string(),
  relatedObjects: z.array(z.string()),
  source: z.string()
})
export async function hashFile(file) {
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(file)) hash.update(bytes)
  return hash.digest('hex')
}
function safePath(root, name) {
  if (
    !/^[a-zA-Z0-9_./-]+$/.test(name) ||
    name.split('/').some((part) => !part || part === '..' || part === '.')
  )
    throw new Error('Caminho inválido no pacote de catálogo.')
  const result = path.resolve(root, name)
  if (!result.startsWith(path.resolve(root) + path.sep)) throw new Error('Arquivo fora do pacote.')
  return result
}
export async function validateBundle(root, verifyHashes = true) {
  const manifest = bundleSchema.parse(
    JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'))
  )
  for (const required of [
    'catalog.json',
    'index.f32',
    'embedding-model.gguf',
    'runtime/llama-server.exe',
    'runtime/msvcp140.dll',
    'runtime/vcruntime140.dll',
    'runtime/vcruntime140_1.dll',
    'LICENSE-embeddinggemma.txt',
    'LICENSE-llama.txt',
    'NOTICE.txt'
  ])
    if (!manifest.files[required]) throw new Error(`Pacote incompleto: ${required}`)
  if (
    manifest.files['index.f32'].bytes !== manifest.records * 768 * 4 ||
    manifest.files['embedding-model.gguf'].sha256 !== manifest.modelSha256
  )
    throw new Error('Índice/modelo incompatíveis.')
  const realRoot = await realpath(root)
  const declared = new Set(['manifest.json', ...Object.keys(manifest.files)])
  const checkContents = async (directory, prefix = '') => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = `${prefix}${entry.name}`
      if (entry.isDirectory()) await checkContents(path.join(directory, entry.name), `${name}/`)
      else if (!entry.isFile() || !declared.has(name))
        throw new Error(`Arquivo não declarado no pacote: ${name}`)
    }
  }
  await checkContents(root)
  for (const [name, expected] of Object.entries(manifest.files)) {
    const file = safePath(root, name)
    if (!(await realpath(file)).startsWith(realRoot + path.sep))
      throw new Error('Link fora do pacote.')
    const info = await stat(file)
    if (
      !info.isFile() ||
      info.size !== expected.bytes ||
      (verifyHashes && (await hashFile(file)) !== expected.sha256)
    )
      throw new Error(`Arquivo inválido no pacote: ${name}`)
  }
  const catalog = z
    .array(entrySchema)
    .parse(JSON.parse(await readFile(path.join(root, 'catalog.json'), 'utf8')))
  if (
    catalog.length !== manifest.records ||
    new Set(catalog.map((entry) => entry.id)).size !== catalog.length
  )
    throw new Error('Quantidade/IDs do catálogo inválidos.')
  return { manifest, catalog }
}
export async function loadBundle(root) {
  const { manifest, catalog } = await validateBundle(root)
  const bytes = await readFile(path.join(root, 'index.f32'))
  const vectors = Array.from({ length: manifest.records }, (_, row) => {
    const vector = Array.from({ length: 768 }, (_, column) =>
      bytes.readFloatLE((row * 768 + column) * 4)
    )
    if (vector.some((n) => !Number.isFinite(n)) || !vector.some((n) => n !== 0))
      throw new Error('Vetor inválido no pacote.')
    return vector
  })
  return {
    manifest,
    catalog,
    vectors,
    embeddingExecutable: path.join(root, 'runtime', 'llama-server.exe'),
    embeddingModel: path.join(root, 'embedding-model.gguf')
  }
}
export async function publishBundle({
  catalogPath,
  indexPath,
  modelPath,
  executablePath,
  output,
  version,
  legalDirectory = path.resolve('resources/local-search-licenses')
}) {
  const catalogBytes = await readFile(catalogPath)
  const originalCatalog = JSON.parse(catalogBytes.toString('utf8'))
  const catalog = z.array(entrySchema).parse(originalCatalog)
  const index = JSON.parse(await readFile(indexPath, 'utf8'))
  const info = await stat(modelPath)
  const expected = createHash('sha256')
    .update(JSON.stringify(originalCatalog))
    .update(`${modelPath}:${info.size}:${info.mtimeMs}:${ALGORITHM}`)
    .digest('hex')
  if (index.fingerprint !== expected || index.vectors?.length !== catalog.length || !catalog.length)
    throw new Error('Indexe a base completa com este modelo antes de publicar.')
  const bytes = Buffer.alloc(catalog.length * 768 * 4)
  index.vectors.forEach((vector, row) => {
    if (
      !Array.isArray(vector) ||
      vector.length !== 768 ||
      vector.some((n) => typeof n !== 'number' || !Number.isFinite(n)) ||
      !vector.some((n) => n !== 0)
    )
      throw new Error('Dimensões/valores inválidos no índice.')
    vector.forEach((value, column) => bytes.writeFloatLE(value, (row * 768 + column) * 4))
  })
  const target = path.resolve(output),
    parent = path.dirname(target)
  await mkdir(parent, { recursive: true })
  const stage = await mkdtemp(path.join(parent, '.catalog-stage-'))
  await mkdir(path.join(stage, 'runtime'))
  await writeFile(path.join(stage, 'catalog.json'), catalogBytes)
  await writeFile(path.join(stage, 'index.f32'), bytes)
  await copyFile(modelPath, path.join(stage, 'embedding-model.gguf'))
  const notices = [
    'LICENSE-embeddinggemma.txt',
    'LICENSE-llama.txt',
    'NOTICE.txt',
    'MODEL-README.md',
    'GGUF-README.md'
  ]
  for (const name of notices)
    await copyFile(path.join(legalDirectory, name), path.join(stage, name))
  const runtime = path.dirname(executablePath)
  // Include dependencies and licenses; inference on clients uses portable CPU binaries.
  for (const entry of await readdir(runtime, { withFileTypes: true }))
    if (
      entry.isFile() &&
      (entry.name === 'llama-server.exe' || /\.dll$|license|copying/i.test(entry.name))
    )
      await copyFile(path.join(runtime, entry.name), path.join(stage, 'runtime', entry.name))
  const files = {}
  for (const name of [
    'catalog.json',
    'index.f32',
    'embedding-model.gguf',
    ...notices,
    ...(await readdir(path.join(stage, 'runtime'))).map((name) => `runtime/${name}`)
  ])
    files[name] = {
      sha256: await hashFile(safePath(stage, name)),
      bytes: (await stat(safePath(stage, name))).size
    }
  const manifest = bundleSchema.parse({
    version,
    algorithm: ALGORITHM,
    dimensions: 768,
    records: catalog.length,
    modelSha256: files['embedding-model.gguf'].sha256,
    files
  })
  await writeFile(path.join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2))
  await validateBundle(stage)
  // Preserve the previous published package for recovery; never overwrite a partial package.
  let previous
  try {
    await stat(target)
    await validateBundle(target)
    previous = `${target}.previous-${Date.now()}`
    await rename(target, previous)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  try {
    await rename(stage, target)
  } catch (error) {
    if (previous) await rename(previous, target)
    throw error
  }
  return { directory: target, version: manifest.version, records: manifest.records }
}
