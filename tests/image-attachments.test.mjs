import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-typescript.mjs'
const images = loadTs('src/renderer/src/lib/imagePayload.ts')
const clipboard = loadTs('src/renderer/src/lib/imageAttachments.ts')
const png = 'data:image/png;base64,cG5n'
const jpeg = 'data:image/jpeg;base64,anBlZw=='
const turn = {
  role: 'user',
  content: 'Compare as capturas',
  imageDataUrls: [png, jpeg],
  imageDataUrl: png
}
const plain = (value) => JSON.parse(JSON.stringify(value))
test('Ctrl+V captura arquivos de imagem sem interceptar colagem comum ou duplicar files/items', () => {
  const file = { type: 'image/png', name: 'image.png' }
  assert.equal(
    clipboard.clipboardImages({
      items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
      files: [file]
    }).length,
    1
  )
  assert.equal(
    clipboard.clipboardImages({ items: [{ kind: 'string', type: 'text/plain' }], files: [] })
      .length,
    0
  )
  assert.equal(clipboard.clipboardImages({ items: [], files: [file] })[0], file)
})
test('formatos multimodais preservam várias imagens e o texto em Claude, OpenAI e Gemini', () => {
  const claude = plain(images.claudeTurn(turn))
  assert.equal(claude.content.length, 3)
  assert.equal(claude.content[0].source.media_type, 'image/png')
  assert.equal(claude.content[1].source.media_type, 'image/jpeg')
  assert.equal(claude.content[2].text, turn.content)
  const openai = plain(images.openAiTurn(turn))
  assert.equal(openai.content[1].image_url.url, png)
  assert.equal(openai.content[2].image_url.url, jpeg)
  const gemini = plain(images.geminiTurn(turn))
  assert.equal(gemini.parts[1].inlineData.mimeType, 'image/jpeg')
  assert.equal(gemini.parts[2].text, turn.content)
  assert.deepEqual(
    plain(images.claudeTurn({ role: 'assistant', content: 'OK', imageDataUrls: [png] })),
    { role: 'assistant', content: 'OK' }
  )
  assert.throws(
    () =>
      images.claudeTurn({
        role: 'user',
        content: '',
        imageDataUrls: ['https://example.com/image.png']
      }),
    /inválido/
  )
})
test('stream e contagem enviam os bytes da imagem em cada provedor, inclusive captura SAP', async () => {
  const models = loadTs('src/renderer/src/lib/claudeModels.ts')
  const requests = []
  const api = loadTs(
    'src/renderer/src/lib/aiClient.ts',
    { '@renderer/lib/supabaseClient': { supabase: {} }, '@renderer/lib/claudeModels': models },
    {
      TextDecoder,
      fetch: async (url, init) => {
        requests.push({ url, body: JSON.parse(init.body) })
        return {
          ok: true,
          body: { getReader: () => ({ read: async () => ({ done: true }) }) },
          json: async () => ({ input_tokens: 321 })
        }
      }
    }
  )
  const signal = new AbortController().signal
  for (const provider of ['claude', 'openai', 'gemini'])
    await api.streamChat({
      provider,
      model: 'vision-test',
      apiKey: 'test',
      messages: [turn],
      signal,
      onDelta: () => {}
    })
  assert.equal(requests[0].body.messages[0].content[0].source.data, 'cG5n')
  assert.equal(requests[1].body.messages[0].content[1].image_url.url, png)
  assert.equal(requests[2].body.contents[0].parts[1].inlineData.data, 'anBlZw==')
  assert.equal(
    await api.countClaudeContext({
      model: 'vision-test',
      apiKey: 'test',
      messages: [turn],
      prompt: '',
      signal
    }),
    321
  )
  assert.equal(requests[3].body.messages[0].content.length, 3)
})
test('compactação preserva imagens recentes e considera seu custo no contexto', () => {
  const context = loadTs('src/renderer/src/lib/contextCompactor.ts')
  assert.equal(context.restoredContext([turn], null)[0].imageDataUrls[0], png)
  assert.ok(
    context.contextTokens([turn]) > context.contextTokens([{ role: 'user', content: turn.content }])
  )
})
