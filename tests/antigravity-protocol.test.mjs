import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-typescript.mjs'

const protocol = loadTs('src/shared/antigravityProtocol.ts')
const shared = loadTs('src/shared/antigravity.ts')

const tool = {
  qualifiedName: 'sap_read_table',
  serverName: 'SAP ADT',
  description: 'Lê linhas de uma tabela.',
  inputSchema: { type: 'object', properties: { table: { type: 'string' } }, required: ['table'] }
}

test('parseia chamadas de ferramenta e separa a narração', () => {
  const out = protocol.parseModelOutput(
    'Vou consultar.\n<tool_call>\n{"name":"sap_read_table","arguments":{"table":"T001"}}\n</tool_call>\n<tool_call>{"name":"b","arguments":{}}</tool_call>\nResultado inventado aqui'
  )
  assert.equal(out.narration, 'Vou consultar.')
  assert.equal(out.calls.map((call) => call.name).join(','), 'sap_read_table,b')
  assert.equal(JSON.stringify(out.calls[0].input), '{"table":"T001"}')
  assert.equal(out.invalid.length, 0)
})

test('aceita JSON em cerca de código e chaves alternativas', () => {
  const out = protocol.parseModelOutput(
    '<tool_call>\n```json\n{"tool":"x","args":{"a":1}}\n```\n</tool_call>'
  )
  assert.equal(out.calls.length, 1)
  assert.equal(out.calls[0].name, 'x')
  assert.equal(JSON.stringify(out.calls[0].input), '{"a":1}')
})

test('resposta sem chamada não gera ferramentas', () => {
  const out = protocol.parseModelOutput('Aqui está a resposta final.')
  assert.equal(out.calls.length, 0)
  assert.equal(out.invalid.length, 0)
  assert.equal(out.narration, '')
})

test('JSON inválido e chamada sem fechamento voltam como inválidos e nunca executam', () => {
  const broken = protocol.parseModelOutput('<tool_call>{"name": "a", "arguments": {</tool_call>')
  assert.equal(broken.calls.length, 0)
  assert.equal(broken.invalid.length, 1)
  const cut = protocol.parseModelOutput('Texto\n<tool_call>{"name":"a","arguments":{"x":')
  assert.equal(cut.calls.length, 0)
  assert.equal(cut.invalid.length, 1)
  assert.equal(cut.narration, 'Texto')
  const noName = protocol.parseModelOutput('<tool_call>{"arguments":{}}</tool_call>')
  assert.equal(noName.calls.length, 0)
  assert.equal(noName.invalid.length, 1)
  const arrayArgs = protocol.parseModelOutput('<tool_call>{"name":"a","arguments":[1]}</tool_call>')
  assert.equal(arrayArgs.calls.length, 0)
})

test('o prompt reúne instruções, protocolo, catálogo e a conversa em ordem', () => {
  const prompt = protocol.buildAntigravityPrompt({
    systemPrompt: 'Seja objetivo.',
    tools: [tool],
    turns: [
      { role: 'user', content: 'Oi' },
      { role: 'assistant', content: 'Olá' },
      { role: 'user', content: 'Leia T001', imageDataUrls: ['data:image/png;base64,AAAA'] }
    ]
  })
  assert.match(prompt, /<instrucoes_do_sistema>\nSeja objetivo\./)
  assert.match(prompt, /<tool_call>/)
  assert.match(prompt, /### sap_read_table/)
  assert.match(prompt, /\[USUÁRIO\]\nOi\n\n\[ASSISTENTE\]\nOlá\n\n\[USUÁRIO\]\nLeia T001/)
  assert.match(prompt, /imagem\(ns\) anexada\(s\) não podem ser enviadas/)
  assert.ok(prompt.indexOf('<instrucoes_do_sistema>') < prompt.indexOf('<conversa>'))
  assert.ok(!prompt.includes('AAAA'), 'o conteúdo da imagem não deve ir no prompt')
})

test('sem ferramentas o prompt não anuncia o protocolo', () => {
  const prompt = protocol.buildAntigravityPrompt({ turns: [{ role: 'user', content: 'Oi' }] })
  assert.ok(!prompt.includes('<tool_call>'))
  assert.ok(!prompt.includes('Catálogo de ferramentas'))
})

test('esquemas gigantes são reduzidos no catálogo', () => {
  const properties = Object.fromEntries(
    Array.from({ length: 200 }, (_, i) => [`campo_${i}`, { type: 'string', description: 'x'.repeat(100) }])
  )
  const catalog = protocol.toolCatalog([{ ...tool, inputSchema: { type: 'object', properties } }])
  assert.ok(catalog.length < 4000)
  assert.match(catalog, /campo_0/)
})

test('resultados de ferramenta são devolvidos em blocos nomeados', () => {
  const text = protocol.renderToolResults([{ name: 'a', json: '{"ok":true}' }])
  assert.equal(text, '<tool_result name="a">\n{"ok":true}\n</tool_result>')
})

test('apenas slugs Gemini são aceitos', () => {
  const ok = (id) => shared.ANTIGRAVITY_MODEL_PATTERN.test(id)
  assert.ok(ok('gemini-4-neon-high'))
  assert.ok(ok('gemini-3.8-flash-medium'))
  assert.ok(!ok('claude-opus-5-5-medium'))
  assert.ok(!ok('gpt-oss-120b-medium'))
  assert.ok(!ok('gemini-4 --flag'))
  assert.ok(!ok('-gemini-x'))
  assert.ok(!ok('gemini-' + 'a'.repeat(80)))
})
