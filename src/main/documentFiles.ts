import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function openGeneratedDocx(
  bytes: unknown,
  fileName: unknown,
  tempRoot: string,
  openPath: (path: string) => Promise<string>
): Promise<void> {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length < 4 ||
    bytes.length > 20 * 1024 * 1024 ||
    bytes[0] !== 0x50 ||
    bytes[1] !== 0x4b
  )
    throw new Error('Arquivo Word inválido ou maior que 20 MB.')
  if (
    typeof fileName !== 'string' ||
    !/^[\p{L}\p{N}_ .()-]{1,150}\.docx$/u.test(fileName) ||
    fileName.includes('..')
  )
    throw new Error('Nome de arquivo Word inválido.')
  const directory = await mkdtemp(join(tempRoot, 'abapfy-ef-'))
  const filePath = join(directory, fileName)
  await writeFile(filePath, bytes, { flag: 'wx' })
  const error = await openPath(filePath)
  if (error)
    throw new Error(`A EF foi salva, mas não foi possível abrir o Word/aplicativo padrão: ${error}`)
}
