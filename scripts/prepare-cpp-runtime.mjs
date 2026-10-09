import { copyFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

// Copy only the official x64 redistributable CRT from the build machine's VS installation.
export async function prepareCppRuntime(executablePath) {
  const destination = path.dirname(executablePath)
  let source = process.env.ABAPFY_VC_REDIST_DIR
  let redistributionList
  if (!source) {
    const installations = path.join(
      process.env.ProgramFiles || 'C:/Program Files',
      'Microsoft Visual Studio/2022'
    )
    for (const edition of await readdir(installations).catch(() => [])) {
      const installation = path.join(installations, edition)
      const redist = path.join(installation, 'VC/Redist/MSVC')
      for (const version of (await readdir(redist).catch(() => [])).sort().reverse()) {
        const candidate = path.join(redist, version, 'x64/Microsoft.VC143.CRT')
        if (
          await stat(candidate)
            .then((info) => info.isDirectory())
            .catch(() => false)
        ) {
          source = candidate
          redistributionList = path.join(installation, 'Licenses/1033/Redist.txt')
          break
        }
      }
      if (source) break
    }
  }
  if (!source)
    throw new Error(
      'Instale os redistribuíveis C++ do Visual Studio no computador de preparação ou defina ABAPFY_VC_REDIST_DIR para Microsoft.VC143.CRT x64.'
    )
  const files = (await readdir(source)).filter((name) => /\.dll$/i.test(name))
  for (const name of ['msvcp140.dll', 'vcruntime140.dll', 'vcruntime140_1.dll'])
    if (!files.includes(name)) throw new Error(`Redistribuível C++ ausente: ${name}`)
  const quote = (value) => `'${value.replace(/'/g, "''")}'`
  const script = `$ErrorActionPreference='Stop'; Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1'); foreach ($file in @(${files.map((name) => quote(path.join(source, name))).join(',')})) { $signature=Get-AuthenticodeSignature -LiteralPath $file; if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft Corporation') { throw 'Redistribuível C++ sem assinatura Microsoft válida' } }`
  await promisify(execFile)(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      Buffer.from(script, 'utf16le').toString('base64')
    ],
    { windowsHide: true, timeout: 60000 }
  )
  for (const name of files) await copyFile(path.join(source, name), path.join(destination, name))
  if (redistributionList)
    await copyFile(
      redistributionList,
      path.join(destination, 'LICENSE-Microsoft-Redistribution.txt')
    )
  console.log(`Runtime C++ x64: ${files.length} DLLs oficiais incluídas.`)
}
