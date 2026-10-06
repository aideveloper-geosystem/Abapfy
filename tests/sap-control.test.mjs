import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { EventEmitter } from 'node:events'
import { PassThrough, Writable } from 'node:stream'
import { loadTs } from './load-typescript.mjs'
const policy = loadTs('src/shared/sapControl.ts')
const settings = { version: 1, enabled: true, sessionId: 'window:123:0', sessionIdentity: '42', controlMode: 'basic' }
const userId = '00000000-0000-4000-8000-000000000001'
const windowRow = { id: settings.sessionId, title: 'SAP Test', processId: 42, processName: 'sapgui' }
const initialCapture = { captureId: 'capture-0', window: windowRow, imageDataUrl: 'data:image/png;base64,b2xk', width: 1000, height: 700, changeRatio: null }
const tab = { kind: 'press_key', key: 'TAB' }
const click = { kind: 'click', x: 80, y: 70 }
const action = (input, previous_result = 'initial') => ({ name: 'sap_gui_action', input: { action: input, expected_result: 'Campo correto visível', previous_result, observation: 'Observei a tela atual' } })
const finish = (previous_result = 'progress', status = 'completed') => ({ name: 'sap_gui_finish', input: { previous_result, status, observation: 'Estado final observado' } })

test('approval rules and legacy modes preserve conservative automatic policy', () => {
  for (const a of [click, { kind: 'type_text', text: '/h' }, ...policy.SAP_CONTROL_KEYS.map(key => ({ kind: 'press_key', key }))]) {
    assert.equal(policy.sapActionNeedsApproval('basic', a), true)
    assert.equal(policy.sapActionNeedsApproval('full', a), false)
    assert.equal(policy.sapActionNeedsApproval('automatic', a), a.kind !== 'press_key' || a.key !== 'TAB')
  }
  assert.equal(policy.normalizeSapControlMode('ask'), 'basic')
  assert.equal(policy.normalizeSapControlMode('always'), 'automatic')
  assert.equal(policy.normalizeSapControlMode('unexpected'), 'off')
})
test('pixel mapping handles scaled captures and negative monitor origins', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(policy.mapSapCapturePoint(100, 50, 1000, 700, { left: -2000, top: 100, width: 2000, height: 1400 }))), { x: -1800, y: 200 })
  assert.throws(() => policy.mapSapCapturePoint(1000, 50, 1000, 700, { left: 0, top: 0, width: 1000, height: 700 }))
  assert.throws(() => policy.mapSapCapturePoint(1.5, 50, 1000, 700, { left: 0, top: 0, width: 1000, height: 700 }))
})
test('invalid actions and model-supplied commands cannot reach native helper', () => {
  for (const a of [null, [], { kind: 'shell' }, { kind: 'click', x: NaN, y: 50 }, { kind: 'click', x: .5, y: 2 }, { kind: 'type_text', text: 'x', key: 'injection' }, { kind: 'press_key', key: 'CTRL+S' }, { kind: 'type_text', text: String.fromCharCode(0) }, { kind: 'type_text', text: 'a'.repeat(4001) }, { ...click, effect: 'read' }]) assert.throws(() => policy.validateSapControlAction(a))
  const literal = "'; $(Get-Process); café 😀"
  assert.equal(policy.validateSapControlAction({ kind: 'type_text', text: literal }).text, literal)
})
function mainFixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'abapfy-sap-test-'))
  t.after(() => { assert.ok(path.resolve(base).startsWith(path.resolve(os.tmpdir()) + path.sep + 'abapfy-sap-test-')); fs.rmSync(base, { recursive: true, force: true }) })
  const inputs = []
  let scanWindow = { ...windowRow }
  const module = loadTs('src/main/sapWindowContext.ts', {
    electron: { app: { getPath: () => base, on() {} } },
    './sapNativeWorker': { SapNativeWorker: class {
      close() {}
      async run(request) {
        if (request.operation === 'scan') return JSON.stringify({ windows: [scanWindow], processCount: 1 })
        if (request.operation === 'capture') return { pngBase64: 'b2xk', width: 1000, height: 700, left: -2000, top: 100, windowWidth: 2000, windowHeight: 1400, changeRatio: null }
        inputs.push(request); return 'Entrada enviada.'
      }
    } }
  })
  const save = (value, confirm = async () => true) => module.saveSapWindowSettingsWithApproval(userId, value, confirm)
  const control = async (a, confirm = async () => true, cap) => module.performSapControl(userId, a, confirm, undefined, (cap ?? await module.captureSapWindow(userId)).captureId)
  return { module, inputs, save, control, base, setWindow: value => { scanWindow = value } }
}
test('Full activation requires warning, cancellation preserves prior mode, legacy executor is discarded', async t => {
  const f = mainFixture(t); await f.save(settings)
  let warnings = 0
  const cancel = async () => { warnings++; return false }
  assert.equal((await f.save({ ...settings, controlMode: 'full' }, cancel)).controlMode, 'basic')
  await f.save({ ...settings, controlMode: 'full' }, async () => { warnings++; return true })
  await f.save({ ...settings, controlMode: 'full', delegateToRouter: true }, cancel)
  assert.equal(warnings, 2)
  await f.save({ ...settings, controlMode: 'full', sessionId: 'window:456:0' }, cancel)
  assert.equal(warnings, 3)
  assert.equal((await f.module.readSapWindowSettings(userId)).sessionId, settings.sessionId)
  assert.equal(Object.hasOwn(await f.module.readSapWindowSettings(userId), 'delegateToRouter'), false)
})
test('legacy local settings migrate without keeping subagent field', async t => {
  const f = mainFixture(t)
  fs.mkdirSync(path.join(f.base, 'sap-gui'))
  fs.writeFileSync(path.join(f.base, 'sap-gui', userId + '.json'), JSON.stringify({ ...settings, controlMode: 'always', delegateToRouter: true }))
  const read = await f.module.readSapWindowSettings(userId)
  assert.equal(read.controlMode, 'automatic'); assert.equal(Object.hasOwn(read, 'delegateToRouter'), false)
})
test('Basic rejection sends nothing; Full maps pixels and consumes capture token once', async t => {
  const f = mainFixture(t); await f.save(settings)
  await assert.rejects(f.control(tab, async () => false), /cancelada/)
  assert.equal(f.inputs.length, 0)
  await f.save({ ...settings, controlMode: 'full' })
  const cap = await f.module.captureSapWindow(userId)
  await f.control(click, async () => { throw Error('Unexpected approval') }, cap)
  assert.equal(f.inputs[0].screenPoint.x, -1840); assert.equal(f.inputs[0].screenPoint.y, 240)
  assert.equal(f.inputs[0].expectedBounds.width, 2000)
  await assert.rejects(f.control(click, async () => true, cap), /desatualizada/)
  assert.equal(f.inputs.length, 1)
})
test('settings, window or capture changes during approval prevent native input', async t => {
  const f = mainFixture(t); await f.save(settings)
  await assert.rejects(f.control(tab, async () => { await f.save({ ...settings, controlMode: 'off' }); return true }), /configuração SAP mudou/)
  await f.save(settings)
  await assert.rejects(f.control(click, async () => { f.setWindow({ ...windowRow, title: 'Other window' }); return true }), /janela SAP mudou/)
  f.setWindow(windowRow)
  await assert.rejects(f.control(click, async () => { await f.module.captureSapWindow(userId); return true }), /captura SAP mudou/)
  await assert.rejects(f.control({ ...click, x: 1000 }), /fora/)
  assert.equal(f.inputs.length, 0)
})
function runtimeFixture(replies, options = {}) {
  const calls = [], inputs = [], events = [], captures = []
  let currentSettings = { ...settings }, sequence = 0
  const controller = new AbortController()
  const provider = options.provider ?? 'claude'
  const module = loadTs('src/renderer/src/lib/sapControlRuntime.ts', {}, {
    fetch: async (_url, init) => {
      const body = JSON.parse(init.body); calls.push(body)
      const reply = replies.shift()
      if (reply instanceof Error) throw reply
      if (!reply) throw Error('Unexpected call')
      const id = 'tool-' + calls.length
      if (provider === 'claude') return { ok: true, json: async () => ({ content: reply.input ? [{ type: 'thinking', thinking: 'opaque', signature: 'signed' }, { type: 'tool_use', id, name: reply.name, input: reply.input }] : [{ type: 'text', text: reply.text ?? 'Sem ação' }] }) }
      if (provider === 'openai') return { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: reply.name, arguments: JSON.stringify(reply.input) } }] } }] }) }
      return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ thoughtSignature: 'signed', functionCall: { id, name: reply.name, args: reply.input } }] } }] }) }
    },
    window: { api: { sapGui: {
      readSettings: async () => currentSettings,
      control: async (_user, a, _call, token) => { assert.equal(token, 'capture-' + sequence); inputs.push(a); if (options.control) return options.control(controller); return 'Entrada enviada' },
      snapshot: async () => { sequence++; captures.push(sequence); return { ...initialCapture, captureId: 'capture-' + sequence, imageDataUrl: options.unchanged ? initialCapture.imageDataUrl : 'data:image/png;base64,bmV3' + sequence, changeRatio: options.unchanged ? 0 : .01 } },
      cancelControl: id => events.push(['cancel', id])
    }, mcp: { onConfirmationPending: () => () => {} } } }
  })
  const run = () => module.runSapControlLoop({ userId, provider, model: 'principal-model', apiKey: 'test', messages: [{ role: 'user', content: 'Abra a transação SAP' }], capture: initialCapture, systemPrompt: '', signal: controller.signal, onStep: (...a) => events.push(a), ...options.args })
  return { run, calls, inputs, events, captures, controller, setSettings: value => { currentSettings = value } }
}
test('principal keeps signed tool history and exactly one latest screenshot for each provider', async () => {
  for (const provider of ['claude', 'openai', 'gemini']) {
    const f = runtimeFixture([action(click), action({ kind: 'type_text', text: '/h' }, 'progress'), finish()], { provider })
    const result = await f.run()
    assert.equal(f.inputs.length, 2); assert.ok(f.calls.every(c => c.model === 'principal-model' || provider === 'gemini'))
    assert.match(result.evidence, /Entrada enviada/)
    const second = f.calls[1], third = f.calls[2]
    const history = provider === 'gemini' ? third.contents : third.messages
    const flat = history.flatMap(m => Array.isArray(m.content) ? m.content : m.parts ?? [])
    assert.equal(flat.filter(p => p.type === 'image' || p.type === 'image_url' || p.inlineData).length, 1)
    if (provider === 'claude') {
      assert.ok(second.messages.some(m => m.content?.some?.(p => p.signature === 'signed')))
      assert.ok(third.messages.some(m => m.content?.some?.(p => p.type === 'tool_result' && p.tool_use_id === 'tool-1')))
    } else if (provider === 'openai') {
      assert.ok(third.messages.some(m => m.role === 'tool' && m.tool_call_id === 'tool-1'))
      assert.equal(second.parallel_tool_calls, false)
    } else {
      assert.ok(flat.some(p => p.thoughtSignature === 'signed'))
      assert.ok(flat.some(p => p.functionResponse?.id === 'tool-1'))
    }
  }
})
test('no-change focus click can proceed to typing; completed uncertain outcome is rejected', async () => {
  const f = runtimeFixture([action(click), action({ kind: 'type_text', text: '/h' }, 'progress'), finish('uncertain')], { unchanged: true })
  await assert.rejects(f.run(), /sem confirmar/); assert.equal(f.inputs.length, 2)
})
test('nearby no-progress clicks and identical uncertain writes stop without replay', async () => {
  const f = runtimeFixture([action(click), action({ ...click, x: 85 }, 'no_progress'), action({ ...click, x: 90 }, 'no_progress')], { unchanged: true })
  await assert.rejects(f.run(), /Cliques próximos/); assert.equal(f.inputs.length, 2)
  const write = { kind: 'type_text', text: '/h' }
  const w = runtimeFixture([action(write), action(write, 'uncertain')], { unchanged: true })
  await assert.rejects(w.run(), /não será repetida/); assert.equal(w.inputs.length, 1)
})
test('repeated debugger steps are allowed when results progress', async () => {
  const f = runtimeFixture([action({ kind: 'press_key', key: 'F6' }), action({ kind: 'press_key', key: 'F6' }, 'progress'), finish()])
  await f.run(); assert.equal(f.inputs.length, 2)
})
test('observe is read-only; blocked finish is evidence rather than success', async () => {
  const f = runtimeFixture([{ name: 'sap_gui_observe', input: { previous_result: 'initial', observation: 'Carregando', reason: 'Esperar atualização' } }, finish('no_progress', 'blocked')])
  const result = await f.run(); assert.equal(f.inputs.length, 0); assert.equal(f.captures.length, 1); assert.match(result.evidence, /blocked/)
})
test('invalid coordinates, revoked model and missing prior assessment stop inputs', async () => {
  const outside = runtimeFixture([action({ ...click, x: 1000 })]); await assert.rejects(outside.run(), /fora/); assert.equal(outside.inputs.length, 0)
  const revoked = runtimeFixture([action(tab)], { args: { canUseModel: () => false } }); await assert.rejects(revoked.run(), /não está mais autorizado/); assert.equal(revoked.calls.length, 0)
  const skipped = runtimeFixture([action(tab), action(tab)]); await assert.rejects(skipped.run(), /não avaliou/); assert.equal(skipped.inputs.length, 1)
})
test('network failure preserves partial evidence and does not resend input', async () => {
  const f = runtimeFixture([action(tab), Error('network failed')])
  await assert.rejects(f.run(), e => { assert.equal(e.name, 'SapControlLoopError'); assert.match(e.evidence, /Entrada enviada/); assert.match(e.imageDataUrl, /bmV3/); return true }); assert.equal(f.inputs.length, 1)
})
test('cancel aborts IPC without next screenshot; config changes stop next action', async () => {
  const f = runtimeFixture([action(tab)], { control: async c => { c.abort(); throw Error('cancelled') } })
  await assert.rejects(f.run(), e => e.name === 'AbortError'); assert.equal(f.captures.length, 0); assert.equal(f.events.filter(e => e[0] === 'cancel').length, 1)
  const changed = runtimeFixture([action(tab)], { control: async () => { changed.setSettings({ ...settings, controlMode: 'off' }); return 'Entrada enviada' } })
  await assert.rejects(changed.run(), /configuração SAP mudou/); assert.equal(changed.inputs.length, 1)
})
test('24 inputs cap does not claim completion', async () => {
  const f = runtimeFixture(Array.from({ length: 25 }, (_, i) => action(tab, i ? 'progress' : 'initial')))
  await assert.rejects(f.run(), /24 entradas/); assert.equal(f.inputs.length, 24)
})
function workerFixture() {
  const writes = [], children = [], boot = []
  const spawn = (_file, args) => {
    assert.ok(args.at(-1).length < 1000)
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough()
    child.stdin = new Writable({ write(chunk, _encoding, callback) { const text = String(chunk); if (text.startsWith('{')) writes.push(JSON.parse(text)); else boot.push(Buffer.from(text.trim(), 'base64').toString('utf8')); callback() } })
    child.kill = () => { child.emit('close', 0); return true }; children.push(child); return child
  }
  const { SapNativeWorker } = loadTs('src/main/sapNativeWorker.ts', { 'node:child_process': { spawn } })
  return { worker: new SapNativeWorker('fixed script'), writes, children, boot }
}
test('native helper boot is fixed, serialized, persistent and failed input is never replayed', async () => {
  const f = workerFixture()
  const first = f.worker.run({ operation: 'scan' }), second = f.worker.run({ operation: 'input' })
  await new Promise(setImmediate); assert.equal(f.writes.length, 1); assert.deepEqual(f.boot, ['fixed script'])
  f.children[0].stdout.write(JSON.stringify({ id: f.writes[0].id, ok: true, result: 'scan' }) + '\n'); await first
  await new Promise(setImmediate); assert.equal(f.children.length, 1); assert.equal(f.writes.length, 2)
  f.children[0].stdout.write(JSON.stringify({ id: f.writes[1].id, ok: false, error: 'input uncertain' }) + '\n')
  await assert.rejects(second, /input uncertain/); assert.equal(f.writes.length, 2); f.worker.close()
})
test('cancellation kills native helper and queued cancelled input never starts', async () => {
  const f = workerFixture(), c = new AbortController()
  const first = assert.rejects(f.worker.run({ operation: 'input' }, c.signal), /interrompido/)
  const second = assert.rejects(f.worker.run({ operation: 'input' }, c.signal), /interrompida/)
  await new Promise(setImmediate); c.abort(); await Promise.all([first, second]); assert.equal(f.writes.length, 1)
})

test('uncertain changed screenshot still cannot repeat a write or claim completion', async () => {
  const write = { kind: 'type_text', text: '/h' }
  const f = runtimeFixture([action(write), action(write, 'uncertain')])
  await assert.rejects(f.run(), /não será repetida/); assert.equal(f.inputs.length, 1)
  const g = runtimeFixture([action(tab), finish('no_progress')])
  await assert.rejects(g.run(), /sem confirmar/)
})
