export interface VisualTurn {
  role: string
  content: string
  imageDataUrl?: string
  imageDataUrls?: string[]
}
export function turnImages(turn: VisualTurn): { mediaType: string; data: string; url: string }[] {
  if (turn.role !== 'user') return []
  const urls = [
    ...new Set([...(turn.imageDataUrls ?? []), ...(turn.imageDataUrl ? [turn.imageDataUrl] : [])])
  ]
  return urls.map((url) => {
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(url)
    if (!match || match[2].length > 8 * 1024 * 1024 || match[2].length % 4 !== 0)
      throw new Error('Anexo de imagem inválido ou muito grande. Remova e anexe novamente.')
    return { mediaType: match[1], data: match[2], url }
  })
}
export function claudeTurn(turn: VisualTurn): { role: string; content: unknown } {
  const images = turnImages(turn)
  return {
    role: turn.role,
    content: images.length
      ? [
          ...images.map((image) => ({
            type: 'image',
            source: { type: 'base64', media_type: image.mediaType, data: image.data }
          })),
          { type: 'text', text: turn.content }
        ]
      : turn.content
  }
}
export function openAiTurn(turn: VisualTurn): { role: string; content: unknown } {
  const images = turnImages(turn)
  return {
    role: turn.role,
    content: images.length
      ? [
          { type: 'text', text: turn.content },
          ...images.map((image) => ({ type: 'image_url', image_url: { url: image.url } }))
        ]
      : turn.content
  }
}
export function geminiTurn(turn: VisualTurn): { role: string; parts: unknown[] } {
  return {
    role: turn.role === 'assistant' ? 'model' : 'user',
    parts: [
      ...turnImages(turn).map((image) => ({
        inlineData: { mimeType: image.mediaType, data: image.data }
      })),
      { text: turn.content }
    ]
  }
}
