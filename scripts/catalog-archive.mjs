import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { hashFile, validateBundle } from './catalog-bundle.mjs'
export async function archiveCatalog(directory) {
  if (process.platform !== 'win32')
    throw new Error('A preparação do arquivo da atualização exige Windows.')
  await validateBundle(directory)
  const archive = path.join(path.dirname(path.resolve(directory)), 'catalog-local-search.zip')
  const quote = (value) => `'${value.replace(/'/g, "''")}'`
  const script = `$ErrorActionPreference='Stop'; Compress-Archive -Path ${quote(path.join(path.resolve(directory), '*'))} -DestinationPath ${quote(archive)} -Force`
  await promisify(execFile)(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      Buffer.from(script, 'utf16le').toString('base64')
    ],
    { windowsHide: true, timeout: 300000 }
  )
  return { archive, sha256: await hashFile(archive) }
}
