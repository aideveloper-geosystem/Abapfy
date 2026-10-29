import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { loadTs } from './load-typescript.mjs'
const recovery = loadTs('src/renderer/src/lib/providerRecovery.ts')
const progressModule = loadTs('src/renderer/src/lib/workProgress.ts')
function runtime(provider, replies, webTools = []) {
  const requests = [],
    events = [],
    checkpoints = []
  let round = 0
  const module = loadTs(
    'src/renderer/src/lib/mcpRuntime.ts',
    {
      './providerRecovery': {
        ...recovery,
        recoverProvider: (operation, options) =>
          recovery.recoverProvider(operation, { ...options, wait: async () => {} }),
        providerJson: (request, label, options) =>
          recovery.providerJson(request, label, { ...options, wait: async () => {} })
      },
      './imagePayload': {
        openAiTurn: (m) => m,
        claudeTurn: (m) => m,
        geminiTurn: (m) => ({ role: m.role, parts: [{ text: m.content }] })
      },
      '@renderer/lib/claudeModels': {
        ANTHROPIC_API_URL: 'https://provider.test',
        claudeHeaders: () => ({}),
        claudeToolLoopParams: () => ({}),
        claudeWebTools: () => webTools
      }
    },
    {
      window: {
        api: {
          mcp: {
            listResources: async () => [],
            onConfirmationPending: () => () => {},
            onConfirmationResolved: () => () => {},
            cancelTool: () => {}
          }
        }
      },
      fetch: async (_url, options) => {
        requests.push(JSON.parse(options.body))
        const reply = replies(Math.min(round++, 100)),
          fn = reply.call
        if (reply.httpError)
          return {
            ok: false,
            status: reply.httpError,
            headers: { get: () => null },
            text: async () =>
              JSON.stringify({
                error: {
                  type: reply.errorType ?? 'overloaded_error',
                  message: reply.errorMessage ?? 'Overloaded'
                }
              })
          }
        return {
          ok: true,
          json: async () =>
            provider === 'openai'
              ? {
                  choices: [
                    {
                      message: fn
                        ? {
                            role: 'assistant',
                            tool_calls: [
                              {
                                id: `call${round}`,
                                function: { name: fn.name, arguments: JSON.stringify(fn.args) }
                              }
                            ]
                          }
                        : { role: 'assistant', content: reply.text }
                    }
                  ]
                }
              : provider === 'claude'
                ? {
                    stop_reason: reply.stopReason,
                    content:
                      reply.rawContent ??
                      (fn
                        ? [{ type: 'tool_use', id: `call${round}`, name: fn.name, input: fn.args }]
                        : [{ type: 'text', text: reply.text }])
                  }
                : {
                    candidates: [
                      {
                        content: {
                          role: 'model',
                          parts: fn
                            ? [{ functionCall: { name: fn.name, args: fn.args } }]
                            : [{ text: reply.text }]
                        }
                      }
                    ]
                  }
        }
      }
    }
  )
  const reads = []
  const workspace = {
    coverage: () => '1 arquivo disponível; 1 integralmente lido',
    tools: [
      {
        qualifiedName: 'workspace_read_file',
        serverId: 'selected',
        serverName: 'Arquivos',
        name: 'read_file',
        description: 'Read',
        inputSchema: { type: 'object', properties: { fileId: { type: 'string' } } },
        requiresConfirmation: false,
        execute: async (args, signal) => {
          signal.throwIfAborted()
          reads.push(args)
          return {
            fileId: args.fileId,
            source: 'REPORT z_complete.',
            revision: 'revision',
            complete: true,
            nextOffset: null
          }
        }
      }
    ]
  }
  return {
    module,
    reads,
    requests,
    events,
    checkpoints,
    args: {
      provider,
      model: 'model',
      apiKey: 'private-provider-key',
      messages: [{ role: 'user', content: 'Leia o arquivo e explique.' }],
      servers: [],
      workspace,
      signal: new AbortController().signal,
      progress: {
        scope: 'user/chat/client/module/folder/connection/agent',
        notes: 'Retomar a análise anterior.',
        steps: []
      },
      onProgress: (value) => checkpoints.push(value),
      onToolEvent: (value) => events.push(value)
    }
  }
}
for (const provider of ['openai', 'claude', 'gemini'])
  test(`file tools and work continuation run in ${provider}, preserving the model conclusion and source receipts`, async () => {
    const f = runtime(provider, (round) =>
      round === 0
        ? { call: { name: 'workspace_read_file', args: { fileId: 'file-1' } } }
        : { text: 'O programa declara REPORT z_complete.' }
    )
    const evidence = await f.module.runMcpToolLoop(f.args)
    assert.equal(f.reads.length, 1)
    assert.match(evidence, /REPORT z_complete/)
    assert.match(evidence, /integralmente lido/)
    assert.match(JSON.stringify(f.requests[0]), /Retomar a análise anterior/)
    assert.match(f.checkpoints.at(-1).notes, /declara REPORT/)
    assert.equal(f.checkpoints.at(-1).steps[0].status, 'read_complete')
    assert.equal(JSON.stringify(f.requests).includes('private-provider-key'), false)
    assert.equal(
      f.events.some((event) => event.detail?.includes('file-1')),
      true
    )
  })

test('round exhaustion reports pending work and persists the continuation rather than claiming success', async () => {
  const f = runtime('openai', () => ({
    call: { name: 'workspace_read_file', args: { fileId: 'file-1' } }
  }))
  const evidence = await f.module.runMcpToolLoop(f.args)
  assert.equal(f.reads.length, 256)
  assert.match(evidence, /orçamento de trabalho/)
  assert.equal(f.checkpoints.at(-1).steps.at(-1).status, 'pending')
})

test('working-window exhaustion does not cut a source page or issue a provider request over budget', async () => {
  const f = runtime('claude', () => ({ text: 'unused' }))
  const evidence = await f.module.runMcpToolLoop({ ...f.args, inputBudget: 2 })
  assert.equal(f.requests.length, 0)
  assert.match(evidence, /pendências/)
})

test('SAP save, validation and uncertain outcomes are preserved from the real main-process response envelope', () => {
  const saved = progressModule.workStep(
    'edit_source',
    { objectPath: '/sap/bc/adt/programs/z', transport: 'DEVK900001' },
    {
      result: {
        status: 'saved_inactive',
        sourceHash: 'abc',
        sourcePath: '/sap/bc/adt/programs/z/source/main',
        validation: { status: 'syntax_errors' }
      }
    }
  )
  assert.equal(saved.status, 'saved_inactive')
  assert.equal(saved.sourceHash, 'abc')
  const uncertain = progressModule.workStep(
    'edit_source',
    { objectPath: 'z' },
    { isError: true, result: { status: 'uncertain', message: 'Releia a fonte' } }
  )
  assert.equal(uncertain.status, 'uncertain')
  assert.match(uncertain.error, /Releia/)
})

test('progress UI renders actual object results, failures and continuation without exposing stored scope', () => {
  const { ToolActivityBadges } = loadTs('src/renderer/src/components/ToolActivityBadges.tsx', {
    './AiPresentation': { AiPresentation: () => null },
    './RichText': { RichText: ({ content }) => createElement('p', null, content) },
    './AiInterface.css': {}
  })
  const html = renderToStaticMarkup(
    createElement(ToolActivityBadges, {
      items: [
        {
          id: 'progress',
          label: 'Progresso',
          kind: 'document',
          status: 'done',
          workProgress: {
            scope: 'private-scope',
            notes: 'Conferir o include.',
            steps: [
              { tool: 'edit_source', target: 'ZCL_EXAMPLE', status: 'saved_inactive' },
              { tool: 'read_file', target: 'arquivo', status: 'read_partial', nextOffset: 12000 }
            ]
          }
        }
      ]
    })
  )
  assert.match(html, /Salvo inativo/)
  assert.match(html, /Continuar em 12000/)
  assert.match(html, /Conferir o include/)
  assert.doesNotMatch(html, /private-scope/)
})

for (const provider of ['openai', 'claude', 'gemini'])
  test(`large tool results remain readable by continuation in ${provider} without replaying the operation`, async () => {
    const value = { source: 'prefix '.repeat(18000) + 'AFTER_THE_OLD_CUT' }
    const serialized = JSON.stringify(value)
    const f = runtime(provider, (round) =>
      round === 0
        ? { call: { name: 'workspace_read_file', args: { fileId: 'large' } } }
        : round === 1
          ? {
              call: {
                name: 'workspace_read_result',
                args: { resultId: 'result-1', offset: serialized.indexOf('AFTER_THE_OLD_CUT') }
              }
            }
          : { text: 'Conferido o final do resultado.' }
    )
    let operations = 0
    f.args.workspace.tools[0].execute = async () => {
      operations++
      return value
    }
    const evidence = await f.module.runMcpToolLoop(f.args)
    assert.equal(operations, 1)
    assert.match(JSON.stringify(f.requests[1]), /workspace_read_result/)
    assert.ok(JSON.stringify(f.requests[1]).length < 30000)
    assert.match(JSON.stringify(f.requests[2]), /AFTER_THE_OLD_CUT/)
    assert.match(evidence, /AFTER_THE_OLD_CUT/)
  })

test('a provider failure after reading leaves the checkpoint available for persistence and resumption', async () => {
  const f = runtime('openai', (round) => {
    if (round > 0) throw Error('Provider disconnected')
    return { call: { name: 'workspace_read_file', args: { fileId: 'file-1' } } }
  })
  await assert.rejects(f.module.runMcpToolLoop(f.args), /Provider disconnected/)
  assert.equal(f.checkpoints.at(-1).steps[0].status, 'read_complete')
  assert.equal(f.checkpoints.at(-1).scope, f.args.progress.scope)
})

test('an empty tool result does not turn a completed operation into a serialization failure or replay', async () => {
  const f = runtime('gemini', (round) =>
    round === 0
      ? { call: { name: 'workspace_read_file', args: { fileId: 'empty' } } }
      : { text: 'A ferramenta encerrou sem dados.' }
  )
  let operations = 0
  f.args.workspace.tools[0].execute = async () => {
    operations++
    return undefined
  }
  await f.module.runMcpToolLoop(f.args)
  assert.equal(operations, 1)
  assert.equal(f.requests[1].contents.at(-1).parts[0].functionResponse.response.result, null)
})

for (const provider of ['openai', 'claude', 'gemini'])
  test(`session recovery in ${provider} keeps tool results and returns the existing answer once`, async () => {
    const f = runtime(provider, (round) =>
      round === 0
        ? { call: { name: 'workspace_read_file', args: { fileId: 'one' } } }
        : round === 1
          ? { httpError: 529 }
          : { text: 'Resposta final do trabalho.' }
    )
    const answers = []
    await f.module.runMcpToolLoop({ ...f.args, onAnswer: (text) => answers.push(text) })
    assert.equal(f.reads.length, 1)
    assert.equal(f.requests.length, 3)
    assert.deepEqual(answers, ['Resposta final do trabalho.'])
    assert.equal(f.checkpoints.at(-1).state, 'completed')
    assert.ok(
      f.events.some(
        (e) => e.toolName.includes('temporariamente indisponível') && e.status === 'running'
      )
    )
    assert.match(JSON.stringify(f.requests[2]), /REPORT z_complete/)
  })

test('working context renews automatically while source tools and the latest receipts remain available', async () => {
  const f = runtime('openai', (round) =>
    round < 80
      ? { call: { name: 'workspace_read_file', args: { fileId: 'large' } } }
      : { text: 'Trabalho concluído após renovar o contexto.' }
  )
  f.args.inputBudget = 10000
  f.args.workspace.tools[0].execute = async () => ({
    source: 'x'.repeat(9000),
    complete: true,
    revision: 'stable',
    totalLength: 9000,
    offset: 0,
    endOffset: 9000,
    nextOffset: null
  })
  const answers = []
  await f.module.runMcpToolLoop({ ...f.args, onAnswer: (text) => answers.push(text) })
  assert.equal(f.requests.length, 81)
  assert.ok(f.events.some((e) => e.toolName.includes('Contexto reorganizado')))
  assert.equal(answers.length, 1)
  assert.equal(f.checkpoints.at(-1).state, 'completed')
})

test('Claude pause_turn continues with the original signed blocks instead of restarting the task', async () => {
  const original = [
    { type: 'thinking', thinking: 'estado anterior', signature: 'signed-state' },
    { type: 'server_tool_use', id: 'server-1', name: 'web_search', input: { query: 'SAP' } },
    { type: 'web_search_tool_result', tool_use_id: 'server-1', content: [] }
  ]
  const f = runtime('claude', (round) =>
    round === 0
      ? { stopReason: 'pause_turn', rawContent: original }
      : round === 1
        ? { call: { name: 'workspace_read_file', args: { fileId: 'one' } } }
        : { text: 'Resultado final.' }
  )
  const answers = []
  await f.module.runMcpToolLoop({ ...f.args, onAnswer: (text) => answers.push(text) })
  assert.equal(f.requests.length, 3)
  assert.deepEqual(f.requests[1].messages[1].content, original)
  assert.equal(f.reads.length, 1)
  assert.deepEqual(answers, ['Resultado final.'])
})

test('Claude output length continues the answer and never executes incomplete tool arguments', async () => {
  const f = runtime('claude', (round) =>
    round === 0
      ? {
          stopReason: 'max_tokens',
          rawContent: [
            {
              type: 'tool_use',
              id: 'partial',
              name: 'workspace_read_file',
              input: { fileId: 'wrong' }
            }
          ]
        }
      : round === 1
        ? { call: { name: 'workspace_read_file', args: { fileId: 'right' } } }
        : { text: 'Pronto.' }
  )
  await f.module.runMcpToolLoop(f.args)
  assert.equal(f.reads.length, 1)
  assert.equal(f.reads[0].fileId, 'right')
  const parts = runtime('claude', (round) =>
    round === 0 ? { stopReason: 'max_tokens', text: 'Parte 1. ' } : { text: 'Parte 2.' }
  )
  const answers = []
  await parts.module.runMcpToolLoop({ ...parts.args, onAnswer: (text) => answers.push(text) })
  assert.deepEqual(answers, ['Parte 1. Parte 2.'])
  assert.equal(parts.requests.length, 2)
})

test('provider error marks the whole activity interrupted even if all individual tool calls completed', () => {
  const { ToolActivityBadges } = loadTs('src/renderer/src/components/ToolActivityBadges.tsx', {
    './AiPresentation': { AiPresentation: () => null },
    './RichText': { RichText: () => null },
    './AiInterface.css': {}
  })
  const html = renderToStaticMarkup(
    createElement(ToolActivityBadges, {
      interrupted: true,
      items: [{ id: 'read', kind: 'mcp', label: 'Leitura finalizada', status: 'done' }]
    })
  )
  assert.match(html, /Interrompida/)
  assert.doesNotMatch(html, /Concluída/)
})

test('unavailable web capability falls back once while keeping the selected source tools and session', async () => {
  const f = runtime(
    'claude',
    (round) =>
      round === 0
        ? {
            httpError: 400,
            errorType: 'invalid_request_error',
            errorMessage: 'web_search is not enabled'
          }
        : round === 1
          ? { call: { name: 'workspace_read_file', args: { fileId: 'one' } } }
          : { text: 'Resultado com os arquivos.' },
    [{ name: 'web_search', type: 'web_search_20260209' }]
  )
  const answers = []
  await f.module.runMcpToolLoop({
    ...f.args,
    claudeWebSearch: true,
    onAnswer: (text) => answers.push(text)
  })
  assert.equal(
    f.requests[0].tools.some((tool) => tool.name === 'web_search'),
    true
  )
  assert.equal(
    f.requests[1].tools.some((tool) => tool.name === 'web_search'),
    false
  )
  assert.equal(
    f.requests[2].tools.some((tool) => tool.name === 'web_search'),
    false
  )
  assert.equal(f.reads.length, 1)
  assert.deepEqual(answers, ['Resultado com os arquivos.'])
})
