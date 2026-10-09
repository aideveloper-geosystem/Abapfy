import { prepareCppRuntime } from './prepare-cpp-runtime.mjs'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'

if (process.platform !== 'win32' || process.arch !== 'x64')
  throw new Error('Este bootstrap de teste exige Windows x64.')
const root = path.resolve('.local-ai')
await mkdir(root, { recursive: true })
async function json(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Abapfy-local-tests' } })
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`)
  return response.json()
}
async function hash(file) {
  const value = createHash('sha256')
  for await (const chunk of createReadStream(file)) value.update(chunk)
  return value.digest('hex')
}
async function download(url, target, digest) {
  if (!digest || !/^[a-f0-9]{64}$/.test(digest)) throw new Error(`SHA-256 ausente para ${target}`)
  try {
    if ((await hash(target)) === digest) {
      console.log(`Já verificado: ${path.basename(target)}`)
      return
    }
  } catch {
    /* missing file */
  }
  console.log(`Baixando ${path.basename(target)}…`)
  const response = await fetch(url)
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}: ${url}`)
  await pipeline(Readable.fromWeb(response.body), createWriteStream(`${target}.part`))
  if ((await hash(`${target}.part`)) !== digest) throw new Error(`Checksum incorreto: ${target}`)
  await rename(`${target}.part`, target)
}
async function binary(repo, pattern, folder, name) {
  const releases = await json(`https://api.github.com/repos/ggml-org/${repo}/releases?per_page=12`)
  const release = releases.find((r) => r.assets.some((a) => pattern.test(a.name)))
  if (!release) throw new Error(`Binário oficial Windows não encontrado: ${repo}`)
  const asset = release.assets.find((a) => pattern.test(a.name))
  const zip = path.join(root, `${folder}.zip`),
    destination = path.join(root, folder)
  await download(asset.browser_download_url, zip, asset.digest?.replace(/^sha256:/, ''))
  const quote = (value) => `'${value.replace(/'/g, "''")}'`
  const command = `Expand-Archive -LiteralPath ${quote(zip)} -DestinationPath ${quote(destination)} -Force`
  await promisify(execFile)(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      Buffer.from(command, 'utf16le').toString('base64')
    ],
    { windowsHide: true }
  )
  async function find(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        const result = await find(file)
        if (result) return result
      } else if (entry.name === name) return file
    }
  }
  const executable = await find(destination)
  if (!executable) throw new Error(`${name} ausente no release ${release.tag_name}`)
  return { executable, release: release.tag_name, sha256: await hash(executable) }
}
async function model(repo, filename) {
  const files = await json(`https://huggingface.co/api/models/${repo}/tree/main`)
  const metadata = files.find((f) => f.path === filename)
  const target = path.join(root, filename)
  await download(
    `https://huggingface.co/${repo}/resolve/main/${filename}`,
    target,
    metadata?.lfs?.oid
  )
  return target
}
if (process.argv.includes('--vulkan')) {
  const previous = JSON.parse(await readFile(path.join(root, 'runtime.json'), 'utf8'))
  const vulkan = await binary(
    'llama.cpp',
    new RegExp(`^llama-${previous.releases.llama}-bin-win-vulkan-x64\\.zip$`),
    'llama-vulkan',
    'llama-server.exe'
  )
  await writeFile(
    path.join(root, 'runtime.json'),
    JSON.stringify(
      {
        ...previous,
        embeddingVulkanExecutable: vulkan.executable,
        releases: { ...previous.releases, vulkan: vulkan.release },
        executableHashes: { ...previous.executableHashes, vulkan: vulkan.sha256 }
      },
      null,
      2
    )
  )
  console.log('Vulkan instalado. Reinicie o Abapfy e selecione GPU Vulkan em Administracao.')
  process.exit(0)
}
const llama = await binary(
  'llama.cpp',
  /^llama-.*-bin-win-cpu-x64\.zip$/,
  'llama',
  'llama-server.exe'
)
await prepareCppRuntime(llama.executable)
const embeddingModel = await model('ggml-org/embeddinggemma-2-GGUF', 'embeddinggemma-2-Q8_0.gguf')
const existing = await readFile(path.join(root, 'runtime.json'), 'utf8')
  .then(JSON.parse)
  .catch(() => ({}))
const manifest = {
  embeddingVulkanExecutable: existing.embeddingVulkanExecutable,
  embeddingExecutable: llama.executable,
  embeddingModel,
  releases: { vulkan: existing.releases?.vulkan, llama: llama.release },
  executableHashes: { vulkan: existing.executableHashes?.vulkan, llama: llama.sha256 }
}
await writeFile(path.join(root, 'runtime.json'), JSON.stringify(manifest, null, 2))
console.log('Runtimes prontos. Reinicie o Abapfy e abra Administracao - Catalogo SAP.')
