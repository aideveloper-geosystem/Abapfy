import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-typescript.mjs'

const recovery = loadTs('src/renderer/src/lib/providerRecovery.ts')

function harness(replies, signal = new AbortController().signal) {
  const prompts = []
  const reads = []
  const narration = []
  const asked = []
  let round = 0
  const module = loadTs(
    'src/renderer/src/lib/mcpRuntime.ts',
    {
      './providerRecovery': recovery,
      './imagePayload': { openAiTurn: (m) => m, claudeTurn: (m) => m, geminiTurn: (m) => m },
      '@renderer/lib/claudeModels': {
        ANTHROPIC_API_URL: 'https://provider.test',
        claudeHeaders: () => ({}),
        claudeToolLoopParams: () => ({}),
        claudeWebTools: () => []
      }
    },
    {
      fetch: async () => {
        throw new Error('Nenhuma API por chave deve ser chamada com o Antigravity.')
      },
      window: {
        api: {
          mcp: {
            listResources: async () => [],
            onConfirmationPending: () => () => {},
            onConfirmationResolved: () => () => {},
            cancelTool: () => {}
          },
          antigravity: {
            cancel: async () => {},
            ask: async (request) => {
              asked.push(request)
              prompts.push(request.prompt)
              const reply = replies(round++)
              return {
                content: reply,
                modelUsed: request.model,
                inputTokens: 100,
                outputTokens: 10,
                conversationId: 'c'
              }
            }
          }
        }
      }
    }
  )
  const workspace = {
    coverage: () => '1 arquivo',
    tools: [
      {
        qualifiedName: 'workspace_read_file',
        serverId: 'selected',
        serverName: 'Arquivos',
        name: 'read_file',
        description: 'Lê um arquivo do cliente.',
        inputSchema: { type: 'object', properties: { fileId: { type: 'string' } } },
        requiresConfirmation: false,
        execute: async (args) => {
          reads.push(args)
          return { fileId: args.fileId, source: 'REPORT z_complete.', complete: true, nextOffset: null }
        }
      }
    ]
  }
  return {
    module,
    prompts,
    reads,
    narration,
    asked,
    args: {
      provider: 'antigravity',
      model: 'gemini-4-neon-high',
      apiKey: 'antigravity-local',
      messages: [{ role: 'user', content: 'Leia o arquivo e explique.' }],
      systemPrompt: 'Você é um consultor SAP.',
      servers: [],
      workspace,
      signal,
      onNarration: (text) => narration.push(text),
      onUsage: () => {}
    }
  }
}

const call = (name, args) => `<tool_call>\n${JSON.stringify({ name, arguments: args })}\n</tool_call>`

test('antigravity executa a ferramenta pedida em texto e devolve o resultado na rodada seguinte', async () => {
  const h = harness((round) =>
    round === 0
      ? `Vou ler o arquivo.\n${call('workspace_read_file', { fileId: 'file-1' })}\nResultado inventado: nada.`
      : 'O programa declara REPORT z_complete.'
  )
  const evidence = await h.module.runMcpToolLoop(h.args)
  assert.equal(h.reads.length, 1)
  assert.equal(h.asked.length, 2)
  assert.equal(h.asked[0].model, 'gemini-4-neon-high')
  assert.deepEqual(h.narration, ['Vou ler o arquivo.'])
  // catálogo e instruções vão no primeiro prompt
  assert.match(h.prompts[0], /### workspace_read_file/)
  assert.match(h.prompts[0], /Você é um consultor SAP\./)
  // o resultado volta como tool_result e o texto inventado depois da chamada é descartado
  assert.match(h.prompts[1], /<tool_result name="workspace_read_file">/)
  assert.match(h.prompts[1], /REPORT z_complete\./)
  assert.ok(!h.prompts[1].includes('Resultado inventado'))
  assert.match(evidence, /O programa declara REPORT z_complete\./)
})

test('antigravity: chamada malformada não executa nada e o modelo recebe a correção', async () => {
  const h = harness((round) =>
    round === 0
      ? '<tool_call>{"name": "workspace_read_file", "arguments": {</tool_call>'
      : round === 1
        ? call('workspace_read_file', { fileId: 'file-2' })
        : 'Concluído.'
  )
  await h.module.runMcpToolLoop(h.args)
  assert.equal(h.reads.length, 1)
  assert.equal(h.reads[0].fileId, 'file-2')
  assert.match(h.prompts[1], /NÃO foram executadas/)
})

test('antigravity: ferramenta desconhecida volta como erro ao modelo sem derrubar a tarefa', async () => {
  const h = harness((round) =>
    round === 0 ? call('ferramenta_inexistente', {}) : 'Não foi possível.'
  )
  await h.module.runMcpToolLoop(h.args)
  assert.equal(h.reads.length, 0)
  assert.match(h.prompts[1], /Ferramenta MCP desconhecida/)
})

test('antigravity: insistir em chamadas inválidas interrompe com erro claro', async () => {
  const h = harness(() => '<tool_call>não é json</tool_call>')
  await assert.rejects(() => h.module.runMcpToolLoop(h.args), /formatar as chamadas/)
  assert.equal(h.asked.length, 4)
})

test('antigravity: cancelar o signal interrompe antes de pedir ao IDE', async () => {
  const controller = new AbortController()
  controller.abort()
  const h = harness(() => 'x', controller.signal)
  await assert.rejects(() => h.module.runMcpToolLoop(h.args))
  assert.equal(h.asked.length, 0)
})

test('antigravity: janela de trabalho esgotada vira pendência sem enviar ao IDE', async () => {
  const h = harness(() => 'unused')
  const evidence = await h.module.runMcpToolLoop({ ...h.args, inputBudget: 2 })
  assert.equal(h.asked.length, 0)
  assert.match(evidence, /pendências/)
})
