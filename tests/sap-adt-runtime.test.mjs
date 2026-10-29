import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-typescript.mjs'
function fixture(provider = 'openai', fail = false, onCall) {
  const calls = [],
    requests = []
  let round = 0
  let enabledTools = true,
    answerWithTool = true
  let diagnostics = []
  const tool = {
    qualifiedName: 'sap_test_search_objects',
    serverId: 'connection',
    serverName: 'Sandbox · mandante 100',
    name: 'search_objects',
    description: 'Search objects',
    inputSchema: {
      type: 'object',
      properties: { pattern: { type: 'string' } },
      required: ['pattern']
    },
    requiresConfirmation: false,
    isSapAdt: true
  }
  const module = loadTs(
    'src/renderer/src/lib/mcpRuntime.ts',
    {
      './imagePayload': { openAiTurn: (m) => m, claudeTurn: (m) => m, geminiTurn: (m) => m },
      '@renderer/lib/claudeModels': {
        ANTHROPIC_API_URL: 'https://provider.example.test',
        claudeHeaders: () => ({}),
        claudeToolLoopParams: () => ({})
      }
    },
    {
      window: {
        api: {
          sapAdt: {
            connectionId: 'selected-connection',
            beginTurn: async (token, agent, userId, connectionId) => {
              calls.push(['begin', token, agent, userId, connectionId])
              return { id: 'private-grant', tools: enabledTools ? [tool] : [], diagnostics }
            },
            callTool: async (...args) => {
              calls.push(['call', ...args])
              if (onCall) return onCall(...args)
              return { result: { objects: [{ name: 'ZCL_TEST' }] } }
            },
            endTurn: async (id) => {
              calls.push(['end', id])
            }
          },
          mcp: {
            listTools: async () => [],
            listResources: async () => [],
            onConfirmationPending: () => () => {},
            onConfirmationResolved: () => () => {},
            cancelTool: () => {}
          }
        }
      },
      fetch: async (_url, options) => {
        requests.push(JSON.parse(options.body))
        if (fail) throw new Error('Provider failed')
        const first = round++ === 0 && answerWithTool
        const call = { name: tool.qualifiedName, arguments: JSON.stringify({ pattern: 'Z*' }) }
        return {
          ok: true,
          json: async () =>
            provider === 'openai'
              ? {
                  choices: [
                    {
                      message: first
                        ? { role: 'assistant', tool_calls: [{ id: 'call1', function: call }] }
                        : { role: 'assistant', content: 'done' }
                    }
                  ]
                }
              : provider === 'claude'
                ? {
                    content: first
                      ? [
                          {
                            type: 'tool_use',
                            id: 'call1',
                            name: call.name,
                            input: { pattern: 'Z*' }
                          }
                        ]
                      : []
                  }
                : {
                    candidates: [
                      {
                        content: {
                          role: 'model',
                          parts: first
                            ? [{ functionCall: { name: call.name, args: { pattern: 'Z*' } } }]
                            : [{ text: 'done' }]
                        }
                      }
                    ]
                  }
        }
      }
    }
  )
  const args = {
    provider,
    model: 'test',
    apiKey: 'provider-key',
    messages: [{ role: 'user', content: 'Search' }],
    servers: [],
    signal: new AbortController().signal
  }
  return {
    module,
    tool,
    calls,
    requests,
    args,
    setCatalog: (enabled, messages = []) => {
      enabledTools = enabled
      diagnostics = messages
    },
    skipTool: () => {
      answerWithTool = false
    }
  }
}
for (const provider of ['openai', 'claude', 'gemini'])
  test(`ADT tool dispatch works for ${provider} without exposing session token or turn grant to the model`, async () => {
    const f = fixture(provider)
    const result = await f.module.runMcpToolLoop({
      ...f.args,
      sapAdt: {
        connectionId: 'selected-connection',
        token: 'private-auth-token',
        userId: 'test-user',
        agent: { source: 'default', id: 'abap' }
      }
    })
    assert.deepEqual(f.calls[0], [
      'begin',
      'private-auth-token',
      { source: 'default', id: 'abap' },
      'test-user',
      'selected-connection'
    ])
    assert.match(result, /ZCL_TEST/)
    assert.equal(f.calls[1][0], 'call')
    assert.equal(f.calls[1][1], 'private-grant')
    assert.equal(f.calls.at(-1)[0], 'end')
    assert.equal(JSON.stringify(f.requests).includes('private-auth-token'), false)
    assert.equal(JSON.stringify(f.requests).includes('private-grant'), false)
  })
test('without SAP opt-in and without MCP servers no integration or model request occurs', async () => {
  const f = fixture()
  assert.equal(await f.module.runMcpToolLoop(f.args), null)
  assert.equal(f.calls.length, 0)
  assert.equal(f.requests.length, 0)
})
test('provider failure still revokes the per-message SAP grant', async () => {
  const f = fixture('openai', true)
  await assert.rejects(
    f.module.runMcpToolLoop({
      ...f.args,
      sapAdt: {
        connectionId: 'selected-connection',
        token: 'private-auth-token',
        userId: 'test-user',
        agent: { source: 'default', id: 'abap' }
      }
    }),
    /Provider failed/
  )
  assert.equal(f.calls.at(-1)[0], 'end')
})

test('missing agent binding is shown exactly and never silently falls back to a generated report', async () => {
  const f = fixture()
  f.setCatalog(false, ['DEV: conexão habilitada, mas este agente não está autorizado.'])
  const events = []
  const result = await f.module.runMcpToolLoop({
    ...f.args,
    sapAdt: {
      connectionId: 'selected-connection',
      token: 'private-auth-token',
      userId: 'test-user',
      agent: { source: 'default', id: 'consultant' }
    },
    onToolEvent: (event) => events.push(event)
  })
  assert.match(result, /agente não está autorizado/)
  assert.equal(f.requests.length, 0)
  assert.equal(events.find((event) => event.serverName === 'SAP ADT').status, 'error')
  assert.equal(f.calls.at(-1)[0], 'end')
})
test('selected connection diagnostics are explicit and no-call results never claim SAP access', async () => {
  const f = fixture('claude')
  f.skipTool()
  f.setCatalog(true, ['DEV: pesquisa disponível; consulta de tabelas desativada.'])
  const result = await f.module.runMcpToolLoop({
    ...f.args,
    systemPrompt: 'Use somente a conexão selecionada.',
    sapAdt: {
      connectionId: 'selected-connection',
      token: 'private-auth-token',
      userId: 'test-user',
      agent: { source: 'default', id: 'abap' }
    }
  })
  assert.match(f.requests[0].system, /Somente a conexão selecionada/)
  assert.match(f.requests[0].system, /search_objects/)
  assert.match(result, /consulta de tabelas desativada/)
  assert.match(result, /Nenhuma ferramenta SAP ADT foi executada/)
  assert.equal(
    f.calls.some((call) => call[0] === 'call'),
    false
  )
})

test('interrupted SAP mutations retain an uncertain receipt and revoke the turn without replay', async () => {
  const controller = new AbortController(),
    progress = []
  const f = fixture('openai', false, () => {
    controller.abort()
    throw new DOMException('Interrupted', 'AbortError')
  })
  f.tool.name = 'edit_source'
  await assert.rejects(
    f.module.runMcpToolLoop({
      ...f.args,
      signal: controller.signal,
      sapAdt: {
        connectionId: 'selected-connection',
        token: 'private-auth-token',
        userId: 'test-user',
        agent: { source: 'default', id: 'abap' }
      },
      progress: { scope: 'scope', notes: '', steps: [] },
      onProgress: (value) => progress.push(value)
    }),
    /Interrupted/
  )
  assert.equal(progress.at(-1).steps.at(-1).status, 'uncertain')
  assert.match(progress.at(-1).steps.at(-1).error, /confira a fonte/)
  assert.equal(f.calls.filter((call) => call[0] === 'call').length, 1)
  assert.equal(f.calls.at(-1)[0], 'end')
})
