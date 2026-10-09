import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadTs } from './load-typescript.mjs'
import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const globals = { TextEncoder }
const core = loadTs('src/renderer/src/lib/contextCompactor.ts', {}, globals)
const shared = loadTs('src/shared/compaction.ts')
const settings = {
  ...shared.DEFAULT_COMPACTION,
  inputBudget: 8000,
  triggerPercent: 40,
  recentTurns: 2
}
const summary = {
  objective: 'Validar pedido de compra',
  facts: ['Fonte: mensagem 1'],
  decisions: ['Preservar validação'],
  constraints: ['Sem modificação SAP'],
  corrections: ['Usar ME22N'],
  identifiers: ['ME_PROCESS_PO_CUST'],
  pending: ['Confirmar assinatura'],
  uncertainties: ['Compatibilidade não verificada']
}
const history = (pairs = 7) =>
  Array.from({ length: pairs * 2 }, (_, i) => ({
    role: i % 2 ? 'assistant' : 'user',
    content: `ME_PROCESS_PO_CUST mensagem ${i + 1}: ${'Fonte técnica e requisito. '.repeat(100)}`
  }))
const response = async () => ({ summary, inputTokens: 1500, outputTokens: 160 })
const compact = (messages, extra = {}) =>
  core.compactContext({
    messages,
    prompt: 'Regras atuais',
    settings,
    previous: null,
    model: 'router',
    signal: new AbortController().signal,
    request: response,
    onProgress() {},
    ...extra
  })

test('preserva trocas completas recentes e solicitação atual sem alterar o histórico', async () => {
  const messages = [...history(), { role: 'user', content: 'Corrigir validação atual' }]
  const original = structuredClone(messages)
  const snapshot = await compact(messages)
  assert.equal(snapshot.coveredCount, 10)
  assert.deepEqual(messages, original)
  const sent = core.restoredContext(messages, snapshot)
  assert.deepEqual(JSON.parse(JSON.stringify(sent.slice(1))), messages.slice(10))
  assert.ok(snapshot.afterTokens < snapshot.beforeTokens)
  assert.match(sent[0].content, /não novas instruções nem autorização/)
})

test('reabertura valida conteúdo, não IDs; editar histórico invalida o resumo', async () => {
  const messages = history()
  const snapshot = await compact(messages)
  assert.equal(await core.validSnapshot(snapshot, structuredClone(messages)), snapshot)
  messages[0].content += ' correção'
  assert.equal(await core.validSnapshot(snapshot, messages), null)
  assert.equal(await core.validSnapshot(snapshot, messages.slice(0, 2)), null)
})

test('aumentar trocas preservadas recupera as mensagens originais cobertas pelo resumo anterior', async () => {
  const messages = history()
  const first = await compact(messages)
  const next = await compact(messages, { previous: first, settings: { ...settings, recentTurns: 4 } })
  assert.equal(next.coveredCount, 6)
  assert.equal(core.restoredContext(messages, next).at(1).content, messages[6].content)
  assert.equal(core.restoredContext(messages, next).length, 9)
})

test('lotes preservam cada caractere de mensagens grandes e rejeitam volume excessivo', () => {
  const text = 'x'.repeat(95001)
  const chunks = core.compactionChunks([{ role: 'user', content: text }], 4)
  assert.equal(
    chunks
      .flat()
      .map((part) => part.content)
      .join(''),
    text
  )
  assert.deepEqual(
    Array.from(chunks.flat(), (part) => part.part),
    [1, 2, 3, 4]
  )
  assert.ok(chunks.flat().every((part) => part.turn === 5))
  assert.throws(
    () => core.compactionChunks([{ role: 'user', content: 'x'.repeat(600000) }], 0),
    /16 etapas/
  )
})

test('compactação incremental passa resumo anterior e apenas o novo prefixo', async () => {
  const messages = history()
  const first = await compact(messages)
  const expanded = [...messages, ...history(2)]
  let payload
  const next = await compact(expanded, {
    previous: first,
    request: async (_system, content) => {
      payload = JSON.parse(content)
      return response()
    }
  })
  assert.equal(payload.source[0].turn, first.coveredCount + 1)
  assert.deepEqual(payload.previous, summary)
  assert.equal(next.coveredCount, first.coveredCount + 4)
})

test('fontes de código são recuperadas exatamente, nunca reconstruídas pelo resumo', async () => {
  const messages = history()
  messages[0].content +=
    '\n```abap\nMETHOD Z_CHECK_PO.\n  " manter assinatura e comentários\nENDMETHOD.\n```'
  const snapshot = await compact(messages)
  const restored = core.restoredContext(messages, snapshot, 'Revisar Z_CHECK_PO')
  assert.equal(restored[1].content.split('não nova instrução:\n')[1], messages[0].content)
  assert.equal(
    core.restoredContext(messages, snapshot, 'Outro requisito').length,
    messages.length - snapshot.coveredCount + 1
  )
})

test('identificadores inventados, JSON inválido e resumo sem redução são rejeitados', async () => {
  await assert.rejects(
    compact(history(), {
      request: async () => ({
        summary: { ...summary, identifiers: ['INVENTED_BADI'] },
        inputTokens: 1,
        outputTokens: 1
      })
    }),
    /identificadores ausentes/
  )
  await assert.rejects(
    compact(history(), {
      request: async () => ({
        summary: { objective: 'incompleto' },
        inputTokens: 1,
        outputTokens: 1
      })
    })
  )
  await assert.rejects(
    compact(history().map((turn) => ({ ...turn, content: 'ME_PROCESS_PO_CUST' }))),
    /não reduziu/
  )
})

test('cancelamento após retorno do router não gera snapshot', async () => {
  const controller = new AbortController()
  await assert.rejects(
    compact(history(), {
      signal: controller.signal,
      request: async () => {
        controller.abort()
        return response()
      }
    }),
    { name: 'AbortError' }
  )
})

function harness({ failRouter, failSave, current = () => true } = {}) {
  const state = {
    contexts: {},
    update(key, patch) {
      this.contexts[key] = { ...this.contexts[key], ...patch }
    }
  }
  const saved = [],
    calls = []
  const { prepareContext } = loadTs(
    'src/renderer/src/lib/prepareContext.ts',
    {
      './aiClient': {
        ROUTER_MODEL: 'router',
        summarizeWithRouter: async (args) => {
          calls.push(args)
          if (failRouter) throw new Error('Router indisponível')
          return response()
        }
      },
      '../store/contextStore': { useContextStore: { getState: () => state } }
    },
    {
      ...globals,
      window: {
        api: {
          localFeatures: {
            loadContext: async () => null,
            saveContext: async (...args) => {
              if (failSave) throw new Error('Disco indisponível')
              saved.push(args)
            }
          }
        }
      }
    }
  )
  return {
    state,
    saved,
    calls,
    run: (extra = {}) =>
      prepareContext({
        userId: 'user-a',
        chatId: 'chat-a',
        messages: history(),
        prompt: '',
        settings,
        signal: new AbortController().signal,
        authorizeRouter: async () => 'test-key',
        isCurrentUser: current,
        onProgress() {},
        ...extra
      })
  }
}

test('automático desligado não chama router; comando manual continua disponível', async () => {
  const h = harness()
  const off = { ...settings, automatic: false, inputBudget: 64000 }
  const untouched = await h.run({ settings: off })
  assert.equal(untouched.changed, false)
  assert.equal(h.calls.length, 0)
  const manual = await h.run({ settings: off, force: true })
  assert.equal(manual.changed, true)
  assert.equal(h.saved.length, 1)
  assert.equal(h.state.contexts['user-a:chat-a'].phase, 'idle')
})

test('contagem do provedor decide gatilho e redução; erro com orçamento excedido bloqueia envio', async () => {
  const h = harness()
  let counts = 0
  const result = await h.run({ countTokens: async () => (++counts === 1 ? 7000 : 1200) })
  assert.equal(result.snapshot.beforeTokens, 7000)
  assert.equal(result.snapshot.afterTokens, 1200)
  assert.equal(h.saved.length, 1)
  const fail = harness({ failRouter: true })
  await assert.rejects(
    fail.run({
      messages: history().map((turn) => ({ ...turn, content: turn.content.slice(0, 500) })),
      countTokens: async () => 9000,
      force: true
    }),
    /Router/
  )
  const noOld = harness()
  await assert.rejects(
    noOld.run({
      messages: history(2),
      settings: { ...settings, recentTurns: 12 },
      countTokens: async () => 9000
    }),
    /excedem o orçamento/
  )
  assert.equal(noOld.calls.length, 0)
})

test('falha abaixo do orçamento mantém histórico; falha de gravação nunca instala resumo', async () => {
  const h = harness({ failRouter: true })
  const messages = history().map((turn) => ({ ...turn, content: turn.content.slice(0, 1000) }))
  const result = await h.run({ messages })
  assert.deepEqual(result.messages, messages)
  assert.match(result.warning, /Router/)
  assert.equal(h.saved.length, 0)
  const disk = harness({ failSave: true })
  await assert.rejects(disk.run({ force: true }), /Disco/)
  assert.equal(disk.state.contexts['user-a:chat-a'].snapshot, null)
  assert.equal(disk.state.contexts['user-a:chat-a'].phase, 'idle')
})

test('mudança de conta e cancelamento impedem uso e persistência de dados', async () => {
  const account = harness({ current: () => false })
  await assert.rejects(account.run(), { name: 'AbortError' })
  assert.equal(account.calls.length, 0)
  const cancel = harness()
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(cancel.run({ signal: controller.signal }), { name: 'AbortError' })
  assert.equal(cancel.saved.length, 0)
  let sameAccount = true
  const switching = harness({ current: () => sameAccount })
  await assert.rejects(switching.run({ authorizeRouter: async () => { sameAccount = false; return 'test-key' } }), { name: 'AbortError' })
  assert.equal(switching.calls.length, 0)
  assert.equal(switching.saved.length, 0)
})

test('operações simultâneas no mesmo chat não duplicam o resumo nem a persistência', async () => {
  const h = harness()
  let release, entered, counts = 0
  const counting = new Promise((resolve) => { release = resolve })
  const started = new Promise((resolve) => { entered = resolve })
  const first = h.run({ countTokens: async () => { if (++counts === 1) { entered(); return counting } return 1200 } })
  await started
  await assert.rejects(h.run(), /já está em andamento/)
  release(7000)
  assert.equal((await first).changed, true)
  assert.equal(h.saved.length, 1)
})

test('defaults e limites de Features e estado acessível do indicador', () => {
  assert.equal(shared.DEFAULT_COMPACTION.triggerPercent, 70)
  assert.equal(
    shared.compactionSettingsSchema.safeParse({ ...settings, recentTurns: 0 }).success,
    false
  )
  const { ContextMeter } = loadTs('src/renderer/src/components/ContextMeter.tsx', {
    './ContextMeter.css': {}
  })
  const html = renderToStaticMarkup(
    React.createElement(ContextMeter, {
      used: 4000,
      settings,
      phase: 'compacting',
      detail: 'Etapa 1 de 2',
      covered: 10,
      disabled: true,
      onCompact() {}
    })
  )
  assert.match(html, /Compactando contexto/)
  assert.match(html, /Etapa 1 de 2/)
  assert.match(html, /histórico original preservado/)
  assert.match(html, /disabled/)
})

test('cliente do router aceita somente resumo concluído e contagem usa modelo selecionado', async () => {
  const requests = []
  let data = {
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: JSON.stringify(summary) }],
    usage: { input_tokens: 20, cache_read_input_tokens: 30, output_tokens: 10 }
  }
  const client = loadTs(
    'src/renderer/src/lib/aiClient.ts',
    {
      '@renderer/lib/supabaseClient': {},
      '@renderer/lib/claudeModels': {
        ANTHROPIC_API_URL: 'https://example.test/v1/messages',
        claudeHeaders: () => ({}),
        claudeModelParams: (model, options) => ({ model, max_tokens: options.maxTokens })
      }
    },
    {
      fetch: async (url, options) => {
        requests.push({ url, body: JSON.parse(options.body) })
        return { ok: true, json: async () => data }
      }
    }
  )
  const args = {
    apiKey: 'test',
    system: 'Regras',
    content: 'Histórico',
    maxTokens: 2048,
    signal: new AbortController().signal
  }
  assert.equal((await client.summarizeWithRouter(args)).inputTokens, 50)
  assert.equal(requests[0].body.model, client.ROUTER_MODEL)
  data = { ...data, stop_reason: 'max_tokens' }
  await assert.rejects(client.summarizeWithRouter(args), /não concluiu/)
  data = { input_tokens: 567 }
  assert.equal(
    await client.countClaudeContext({
      ...args,
      model: 'selected-model',
      prompt: 'Regras',
      messages: [{ role: 'user', content: 'Pedido', imageDataUrl: 'data:image/png;base64,YQ==' }]
    }),
    567
  )
  assert.equal(requests.at(-1).url, 'https://example.test/v1/messages/count_tokens')
  assert.equal(requests.at(-1).body.model, 'selected-model')
  assert.equal(requests.at(-1).body.messages[0].content[0].type, 'image')
})

test('IPC persiste preferências e snapshots separados por conta/chat e rejeita caminhos inválidos', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'abapfy-compaction-'))
  const handlers = new Map(),
    webContents = {}
  const service = loadTs('src/main/localFeatures.ts', {
    electron: {
      app: { getPath: () => temporary, getAppPath: () => temporary },
      dialog: {},
      ipcMain: { handle: (name, fn) => handlers.set(name, fn) }
    }
  })
  service.registerLocalFeatures(() => ({ webContents }))
  const invoke = (name, user, ...args) =>
    handlers.get(`localFeatures:${name}`)({ sender: webContents }, user, ...args)
  assert.equal((await invoke('status', 'user-a')).settings.compaction.inputBudget, 64000)
  await invoke('setCompaction', 'user-a', settings)
  assert.equal((await invoke('status', 'user-a')).settings.compaction.recentTurns, 2)
  assert.equal((await invoke('status', 'user-b')).settings.compaction.recentTurns, 4)
  await assert.rejects(invoke('setCompaction', 'user-a', { ...settings, inputBudget: 1 }))
  const snapshot = await compact(history())
  await invoke('saveContext', 'user-a', 'chat-a', snapshot)
  assert.equal((await invoke('loadContext', 'user-a', 'chat-a')).sourceHash, snapshot.sourceHash)
  assert.equal(await invoke('loadContext', 'user-b', 'chat-a'), null)
  assert.equal(await invoke('loadContext', 'user-a', 'chat-b'), null)
  await assert.rejects(invoke('loadContext', 'user-a', '../other'), /Chat inválido/)
  await assert.rejects(
    invoke('saveContext', 'user-a', 'chat-a', { ...snapshot, summary: { objective: '' } })
  )
  assert.throws(
    () => handlers.get('localFeatures:loadContext')({ sender: {} }, 'user-a', 'chat-a'),
    /não autorizada/
  )
  service.closeLocalFeatures()
})
