export const MAX_IMAGE_ATTACHMENTS = 3
const MAX_SOURCE_BYTES = 15 * 1024 * 1024
const MAX_IMAGE_BYTES = 2 * 1024 * 1024
export function isImageFile(file: Pick<File, 'type' | 'name'>): boolean {
  return /^image\/(png|jpeg|webp)$/i.test(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name)
}
export function clipboardImages(data: DataTransfer): File[] {
  const files = Array.from(data.items)
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null)
  return files.length
    ? files
    : Array.from(data.files).filter((file) => file.type.startsWith('image/'))
}
export async function readImageAttachment(file: File): Promise<string> {
  if (!isImageFile(file)) throw new Error('Use uma imagem PNG, JPEG ou WebP.')
  if (file.size > MAX_SOURCE_BYTES)
    throw new Error('Imagem muito grande. Use um arquivo de até 15 MB.')
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image()
    element.onload = () => resolve(element)
    element.onerror = () => reject(new Error('A imagem está inválida ou não pode ser aberta.'))
    element.src = source
  })
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('Imagem sem dimensões válidas.')
  if (
    file.size <= MAX_IMAGE_BYTES &&
    Math.max(image.naturalWidth, image.naturalHeight) <= 3072 &&
    /^data:image\/(png|jpeg|webp);base64,/.test(source)
  )
    return source
  const canvas = document.createElement('canvas')
  const scale = Math.min(1, 3072 / Math.max(image.naturalWidth, image.naturalHeight))
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Não foi possível preparar a imagem.')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const png = canvas.toDataURL('image/png')
  if (png.length <= (MAX_IMAGE_BYTES * 4) / 3) return png
  for (const quality of [0.92, 0.8, 0.65]) {
    const jpeg = canvas.toDataURL('image/jpeg', quality)
    if (jpeg.length <= (MAX_IMAGE_BYTES * 4) / 3) return jpeg
  }
  throw new Error('A imagem continua muito grande. Recorte a área que deseja analisar.')
}
