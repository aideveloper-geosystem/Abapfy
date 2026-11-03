import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-typescript.mjs'

const policy = loadTs('src/shared/advancedFlow.ts')
const config = () => ({
  ...structuredClone(policy.DEFAULT_ADVANCED_FLOW),
  enabled: true,
  orchestrator: {
    provider: 'claude',
    model: 'opus-test',
    effort: 'medium',
    instructions: 'Planeje e consolide.'
  },
  agents: ['a', 'b', 'c'].map((id) => ({
    id,
    name: 'Especialista ' + id,
    provider: 'claude',
    model: 'sonnet-test',
    effort: 'medium',
    enabled: true,
    instructions: 'Investigue com evidências.',
    tools: 'read'
  }))
})
test('advanced flows are disabled by default and invalid limits, hooks and models are rejected', () => {
  assert.equal(policy.DEFAULT_ADVANCED_FLOW.enabled, false)
  assert.equal(policy.DEFAULT_ADVANCED_FLOW.agents.length, 0)
  for (const value of [
    { ...config(), maxParallel: 10 },
    { ...config(), maxDelegations: 0 },
    { ...config(), orchestrator: { ...config().orchestrator, model: '' } },
    { ...config(), agents: [config().agents[0], config().agents[0]] },
    {
      ...config(),
      hooks: [
        {
          id: 'h',
          name: 'Hook',
          enabled: true,
          event: 'before_answer',
          action: 'syntax_check',
          instructions: ''
        }
      ]
    }
  ])
    assert.throws(() => policy.parseAdvancedFlow(value))
})

function fixture(options = {}) {
  const calls = [],
    events = [],
    usage = [],
    outputs = [],
    answers = []
  let active = 0,
    maxActive = 0
  const turn = { id: 'private-sap-grant', tools: [] }
  const run = async (args) => {
    calls.push(args)
    if (args.model === 'opus-test') {
      args.onSapTurn?.(turn)
      const delegate = args.extraTools.find((t) => t.name === 'flow_delegate')
      if (options.parent) return options.parent(args, delegate)
      const result = await delegate.execute(
        { tasks: ['a', 'b', 'c'].map((agentId) => ({ agentId, task: 'Investigue ' + agentId })) },
        args.signal
      )
      outputs.push(result)
      const correction = await args.beforeAnswer?.('Resposta candidata')
      if (correction) await args.beforeAnswer?.('Resposta corrigida')
      args.onAnswer?.('Resposta consolidada')
      return 'evidências consolidadas'
    }
    active++
    maxActive = Math.max(active, maxActive)
    try {
      if (options.abort)
        await new Promise((resolve, reject) =>
          args.signal.addEventListener('abort', () => reject(args.signal.reason), { once: true })
        )
      else await new Promise((resolve) => setTimeout(resolve, 10))
      args.signal.throwIfAborted()
      if (options.fail && args.messages[0].content.endsWith('b'))
        throw new Error('Falha de rede simulada')
      if (!options.noEvidence)
        args.onToolResult?.({
          tool: { name: 'read_source' },
          args: { objectPath: '/sap/bc/adt/test' },
          result: { result: { sourceHash: 'hash', source: 'fonte' } }
        })
      args.onUsage?.(100, 20)
      args.onAnswer?.('Conclusão da subtarefa')
      return 'fontes consultadas'
    } finally {
      active--
    }
  }
  const module = loadTs('src/renderer/src/lib/advancedFlowRuntime.ts', {
    './mcpRuntime': { runMcpToolLoop: run }
  })
  const controller = new AbortController()
  const args = {
    config: config(),
    provider: 'claude',
    model: 'default',
    apiKey: 'private-key',
    messages: [{ role: 'user', content: 'Histórico que não deve ser copiado integralmente.' }],
    servers: [{ id: 'external-server' }],
    signal: controller.signal,
    resolveModel: async (_provider, model) => 'key-for-' + model,
    onToolEvent: (e) => events.push(e),
    onUsage: (i, o) => usage.push([i, o]),
    onAnswer: (a) => answers.push(a)
  }
  return {
    module,
    args,
    calls,
    events,
    outputs,
    usage,
    answers,
    controller,
    maxActive: () => maxActive,
    active: () => active
  }
}
test('manual orchestration bounds concurrency, isolates context, shares the SAP grant and accounts for every worker', async () => {
  const f = fixture()
  await f.module.runAdvancedAgentFlow(f.args)
  assert.equal(f.maxActive(), 2)
  assert.equal(f.calls.length, 4)
  assert.deepEqual(f.answers, ['Resposta consolidada'])
  assert.equal(f.usage.length, 3)
  assert.equal(f.outputs[0].tasks.length, 3)
  for (const child of f.calls.slice(1)) {
    assert.equal(child.sapTurn.id, 'private-sap-grant')
    assert.equal(child.servers.length, 0)
    assert.equal(child.onSapTurn, undefined)
    assert.equal(child.messages.length, 1)
    assert.equal(
      child.extraTools.some((t) => t.name === 'flow_delegate'),
      false
    )
    assert.equal(
      child.toolFilter({
        name: 'read_source',
        qualifiedName: 'sap_test_read_source',
        isSapAdt: true,
        requiresConfirmation: false
      }),
      true
    )
    assert.equal(
      child.toolFilter({
        name: 'edit_source',
        qualifiedName: 'sap_test_edit_source',
        isSapAdt: true,
        requiresConfirmation: true
      }),
      false
    )
    assert.equal(
      child.toolFilter({
        name: 'read_source',
        qualifiedName: 'untrusted_mcp_read_source',
        requiresConfirmation: false
      }),
      false
    )
  }
  assert.ok(f.events.some((e) => e.status === 'done' && /100 tokens/.test(e.detail ?? '')))
})
test('worker failures retain other results and a missing key prevents all model requests', async () => {
  const f = fixture({ fail: true })
  await f.module.runAdvancedAgentFlow(f.args)
  assert.equal(f.outputs[0].tasks.filter((t) => t.status === 'failed').length, 1)
  assert.equal(f.outputs[0].tasks.filter((t) => t.status === 'completed').length, 2)
  const denied = fixture()
  await assert.rejects(
    denied.module.runAdvancedAgentFlow({
      ...denied.args,
      resolveModel: async () => {
        throw new Error('Modelo bloqueado')
      }
    }),
    /bloqueado/
  )
  assert.equal(denied.calls.length, 0)
})
test('delegation limits and unknown workers cannot spawn model calls', async () => {
  const f = fixture({
    parent: async (args, tool) => {
      await assert.rejects(
        tool.execute({ tasks: [{ agentId: 'unknown', task: 'Teste' }] }, args.signal),
        /desativado/
      )
      await assert.rejects(
        tool.execute(
          { tasks: ['a', 'b'].map((agentId) => ({ agentId, task: 'Teste' })) },
          args.signal
        ),
        /Limite/
      )
      return 'limites respeitados'
    }
  })
  await f.module.runAdvancedAgentFlow({
    ...f.args,
    config: { ...f.args.config, maxDelegations: 1 }
  })
  assert.equal(f.calls.length, 1)
})
test('hooks run on configured events and evidence requirements block unsupported completion', async () => {
  const hooks = [
    {
      id: 'start',
      name: 'Instruções',
      event: 'session_start',
      action: 'instructions',
      instructions: 'Use o padrão do cliente.',
      enabled: true
    },
    {
      id: 'end',
      name: 'Registrar',
      event: 'after_delegate',
      action: 'checkpoint',
      instructions: '',
      enabled: true
    },
    {
      id: 'evidence',
      name: 'Evidência',
      event: 'before_answer',
      action: 'require_evidence',
      instructions: '',
      enabled: true
    }
  ]
  const f = fixture()
  await f.module.runAdvancedAgentFlow({ ...f.args, config: { ...f.args.config, hooks } })
  assert.match(f.calls[0].systemPrompt, /padrão do cliente/)
  assert.equal(f.events.filter((e) => e.toolName === 'Hook · Registrar').length, 3)
  const noSources = fixture({ noEvidence: true })
  await assert.rejects(
    noSources.module.runAdvancedAgentFlow({
      ...noSources.args,
      config: { ...noSources.args.config, hooks }
    }),
    /nenhuma leitura/
  )
  assert.equal(noSources.answers.length, 0)
})
test('stop cancels and drains all active workers before the flow returns', async () => {
  const f = fixture({ abort: true })
  const running = f.module.runAdvancedAgentFlow(f.args)
  await new Promise((resolve) => setTimeout(resolve, 20))
  f.controller.abort(new DOMException('Cancelado', 'AbortError'))
  await assert.rejects(running, /Cancelado/)
  assert.equal(f.active(), 0)
  assert.equal(f.answers.length, 0)
})
test('saved preferences are isolated by account and a different account cannot save into the old one', () => {
  const data = new Map(),
    auth = { user: { id: 'user-a' } }
  const module = loadTs(
    'src/renderer/src/store/advancedFlowStore.ts',
    {
      './authStore': { useAuthStore: { getState: () => auth } }
    },
    {
      structuredClone,
      localStorage: {
        getItem: (key) => data.get(key) ?? null,
        setItem: (key, value) => data.set(key, value)
      }
    }
  )
  const store = module.useAdvancedFlowStore
  store.getState().load('user-a')
  assert.equal(store.getState().config.enabled, false)
  store.getState().save('user-a', config())
  auth.user = { id: 'user-b' }
  assert.throws(() => store.getState().save('user-a', config()), /conta mudou/)
  store.getState().load('user-b')
  assert.equal(store.getState().config.enabled, false)
  assert.equal(module.readAdvancedFlow('user-a').enabled, true)
})

for (const provider of ['claude', 'openai', 'gemini']) {
  test(
    provider + ' executes a complete coordinator/worker round through the real tool runtime',
    async () => {
      const requests = [],
        answers = []
      let parentRounds = 0
      const globals = {
        window: {
          api: {
            mcp: {
              listTools: async () => [],
              listResources: async () => [],
              onConfirmationPending: () => () => {},
              onConfirmationResolved: () => () => {},
              cancelTool: () => {}
            }
          }
        },
        fetch: async (url, options) => {
          const body = JSON.parse(options.body)
          requests.push(body)
          const parent = body.model === 'opus-test' || url.includes('/opus-test:')
          const delegate = parent && parentRounds++ === 0
          const input = { tasks: [{ agentId: 'a', task: 'Organize os dados fornecidos.' }] }
          const content = parent ? 'Resposta final do orquestrador' : 'Resultado do especialista'
          const response =
            provider === 'claude'
              ? {
                  stop_reason: delegate ? 'tool_use' : 'end_turn',
                  content: delegate
                    ? [{ type: 'tool_use', id: 'call', name: 'flow_delegate', input }]
                    : [{ type: 'text', text: content }],
                  usage: { input_tokens: 10, output_tokens: 5 }
                }
              : provider === 'openai'
                ? {
                    choices: [
                      {
                        message: delegate
                          ? {
                              role: 'assistant',
                              tool_calls: [
                                {
                                  id: 'call',
                                  function: {
                                    name: 'flow_delegate',
                                    arguments: JSON.stringify(input)
                                  }
                                }
                              ]
                            }
                          : { role: 'assistant', content }
                      }
                    ],
                    usage: { prompt_tokens: 10, completion_tokens: 5 }
                  }
                : {
                    candidates: [
                      {
                        content: {
                          role: 'model',
                          parts: delegate
                            ? [{ functionCall: { name: 'flow_delegate', args: input } }]
                            : [{ text: content }]
                        }
                      }
                    ],
                    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 }
                  }
          return { ok: true, json: async () => response }
        }
      }
      const modelMocks = {
        './imagePayload': { openAiTurn: (m) => m, claudeTurn: (m) => m, geminiTurn: (m) => m },
        '@renderer/lib/claudeModels': {
          ANTHROPIC_API_URL: 'https://provider.test',
          claudeHeaders: () => ({}),
          claudeToolLoopParams: (model) => ({ model })
        }
      }
      const actual = loadTs('src/renderer/src/lib/advancedFlowRuntime.ts', modelMocks, globals)
      const flow = config()
      flow.orchestrator.provider = provider
      flow.agents = [{ ...flow.agents[0], provider, tools: 'none' }]
      await actual.runAdvancedAgentFlow({
        config: flow,
        provider,
        model: 'default',
        apiKey: 'not-real',
        servers: [],
        messages: [{ role: 'user', content: 'Faça uma análise com o especialista.' }],
        signal: new AbortController().signal,
        resolveModel: async () => 'not-real',
        onAnswer: (a) => answers.push(a)
      })
      assert.equal(requests.length, 3)
      assert.deepEqual(answers, ['Resposta final do orquestrador'])
      assert.match(JSON.stringify(requests[2]), /Resultado do especialista/)
    }
  )
}

test('configured stages execute in order and expose prior results without offering free delegation', async () => {
  const f = fixture({
    parent: async (args, delegate) => {
      assert.equal(delegate, undefined)
      const prepared = await args.prepareContext()
      assert.match(prepared, /Etapa inicial/)
      assert.match(prepared, /Consolidação/)
      const context = await args.extraTools
        .find((t) => t.name === 'flow_context')
        .execute({ section: 'previous_stage' }, args.signal)
      assert.match(context.source, /Conclusão da subtarefa/)
      assert.match(context.source, /Etapa inicial/)
      args.onAnswer('Resposta por etapas')
      return prepared
    }
  })
  await f.module.runAdvancedAgentFlow({
    ...f.args,
    config: {
      ...f.args.config,
      stages: [
        {
          id: 's1',
          name: 'Etapa inicial',
          instructions: 'Investigue as fontes.',
          agentIds: ['a', 'b'],
          enabled: true
        },
        {
          id: 's2',
          name: 'Consolidação',
          instructions: 'Consolide as evidências anteriores.',
          agentIds: ['c'],
          enabled: true
        }
      ]
    }
  })
  assert.equal(f.maxActive(), 2)
  assert.equal(f.calls.length, 4)
  assert.match(f.calls[3].messages[0].content, /Consolidação/)
  assert.ok(
    f.events.findIndex((e) => e.toolName === 'Etapa · Etapa inicial' && e.status === 'done') <
      f.events.findIndex((e) => e.toolName === 'Etapa · Consolidação' && e.status === 'running')
  )
  assert.deepEqual(f.answers, ['Resposta por etapas'])
})

test('flow library migrates the existing team without changing the original and isolates multiple saved flows', () => {
  const data = new Map(),
    auth = { user: { id: 'user-a' } }
  const oldKey = 'abapfy:advanced-flow:v1:user-a'
  data.set(oldKey, JSON.stringify(config()))
  const original = data.get(oldKey)
  const module = loadTs(
    'src/renderer/src/store/advancedFlowStore.ts',
    { './authStore': { useAuthStore: { getState: () => auth } } },
    {
      structuredClone,
      localStorage: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }
    }
  )
  const store = module.useAdvancedFlowStore
  store.getState().load('user-a')
  assert.equal(store.getState().flows.length, 1)
  assert.equal(store.getState().enabled, true)
  assert.equal(store.getState().config.agents.length, 3)
  store.getState().save('user-a', { ...config(), name: 'Segundo fluxo' }, 'second')
  assert.equal(store.getState().flows.length, 2)
  store.getState().select('user-a', 'migrated-flow')
  assert.notEqual(store.getState().config.name, 'Segundo fluxo')
  store.getState().remove('user-a', 'second')
  assert.equal(store.getState().flows.length, 1)
  assert.equal(data.get(oldKey), original)
  store.getState().load('user-a')
  assert.equal(store.getState().flows.length, 1)
  store.getState().setEnabled('user-a', false)
  assert.equal(store.getState().config.enabled, true)
  auth.user = { id: 'user-b' }
  store.getState().load('user-b')
  assert.equal(store.getState().flows.length, 0)
})
