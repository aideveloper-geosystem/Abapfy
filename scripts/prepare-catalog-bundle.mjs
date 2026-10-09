import { prepareCppRuntime } from './prepare-cpp-runtime.mjs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { publishBundle } from './catalog-bundle.mjs'
const runtime = JSON.parse(await readFile('.local-ai/runtime.json', 'utf8'))
await prepareCppRuntime(runtime.embeddingExecutable)
const data = path.join(process.env.APPDATA, 'abapfy', 'local-features')
const output = process.argv[2] || 'resources/local-search'
const result = await publishBundle({
  catalogPath: path.join(data, 'catalog.json'),
  indexPath: path.join(data, 'index.json'),
  modelPath: runtime.embeddingModel,
  executablePath: runtime.embeddingExecutable,
  output,
  version: new Date().toISOString().replace(/[:.]/g, '-')
})
console.log(JSON.stringify(result))
