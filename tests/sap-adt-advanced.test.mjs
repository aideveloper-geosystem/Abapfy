import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-typescript.mjs'
const clientClass = class {
  static classIncludes(structure) {
    return new Map(structure.includes.map((include) => [include.name, include.path]))
  }
  static mainInclude() {
    return '/sap/bc/adt/oo/classes/zcl_test/source/main'
  }
}
const mocks = {
  'abap-adt-api': {
    ADTClient: clientClass,
    session_types: { stateful: 'stateful' },
    objectPath: (o) => '/sap/bc/adt/oo/classes/' + o.name.toLowerCase()
  }
}
const advanced = loadTs('src/main/sapAdtAdvanced.ts', mocks)
const policy = loadTs('src/shared/sapAdtAdvanced.ts')
const path = '/sap/bc/adt/oo/classes/zcl_test'
const connection = {
  enabled: true,
  username: 'TEST',
  allowSource: true,
  allowWrite: true,
  allowCreate: true,
  allowActivate: true,
  allowQuality: true,
  allowTransports: true,
  allowTransportRelease: true,
  allowDebug: true
}
function fixture() {
  let active = 'CLASS old. ENDCLASS.',
    inactive = 'CLASS old. ENDCLASS.',
    permit = true,
    changed = false,
    failSave = false,
    unlockFails = false
  const calls = []
  const client = {
    loggedin: true,
    objectStructure: async () => ({ metaData: { 'adtcore:name': 'ZCL_TEST' } }),
    getObjectSource: async (_p, options) => (options.version === 'inactive' ? inactive : active),
    lock: async () => {
      calls.push('lock')
      if (changed) active = 'changed'
      return { LOCK_HANDLE: 'handle', CORRNR: 'DEVK900001', IS_LOCAL: 'X' }
    },
    unLock: async () => {
      calls.push('unlock')
      if (unlockFails) throw Error('failure')
    },
    setObjectSource: async (_p, source) => {
      calls.push('save')
      inactive = source
      if (failSave) throw Error('network failure after save')
    },
    syntaxCheck: async () => [],
    transportInfo: async () => ({ DEVCLASS: '$TMP' }),
    transportDetails: async () => ({ 'tm:status': 'D', tasks: [] }),
    activate: async () => {
      calls.push('activate')
      active = inactive
      return { success: true }
    },
    transportRelease: async (_r, ignoreLocks, ignoreAtc) => {
      calls.push(['release', ignoreLocks, ignoreAtc])
      return []
    },
    unitTestRun: async (_p, flags) => {
      calls.push(['tests', flags])
      return []
    }
  }
  const ctx = {
    client,
    connection,
    signal: new AbortController().signal,
    approve: async (detail) => {
      calls.push(['approve', detail])
      if (!permit) throw new advanced.SapAdtActionError('denied')
    },
    known: () => {},
    hasSnapshot: (_p, _v, hash) => hash === advanced.sourceHash('CLASS old. ENDCLASS.'),
    invalidate: () => calls.push('invalidate'),
    registerObject: () => {},
    atcRuns: new Set()
  }
  const args = {
    objectPath: path,
    expectedHash: advanced.sourceHash(active),
    oldText: 'old',
    newText: 'new',
    transport: 'DEVK900001'
  }
  return {
    calls,
    ctx,
    args,
    deny: () => {
      permit = false
    },
    change: () => {
      changed = true
    },
    failSave: () => {
      failSave = true
    },
    failUnlock: () => {
      unlockFails = true
    }
  }
}
test('advanced tools require individual capabilities and default to unavailable', () => {
  assert.equal(policy.advancedToolSchemas({}).length, 0)
  assert.equal(policy.advancedAllowed({ allowTransportRelease: true }, 'release_transport'), false)
  const tools = policy.advancedToolSchemas(connection)
  assert.ok(tools.some((tool) => tool.name === 'edit_source'))
  assert.equal(
    tools.find((tool) => tool.name === 'edit_source').inputSchema.additionalProperties,
    false
  )
  assert.throws(() =>
    policy.advancedDefinition('edit_source').schema.parse({ ...fixture().args, sql: 'DELETE' })
  )
})
test('edit approval precedes lock, saves exactly once, verifies inactive source and unlocks without activation', async () => {
  const f = fixture()
  const result = await advanced.runSapAdtAdvanced('edit_source', f.args, f.ctx)
  assert.equal(result.status, 'saved_inactive')
  assert.equal(result.verified, true)
  assert.equal(result.activated, false)
  assert.equal(f.calls[0][0], 'approve')
  assert.ok(f.calls[0][1].includes('old'))
  assert.ok(f.calls[0][1].includes('new'))
  assert.equal(f.calls.filter((x) => x === 'save').length, 1)
  assert.ok(f.calls.includes('unlock'))
  assert.equal(f.calls.includes('activate'), false)
})
test('denied approval, wrong hash, duplicate replacements and stale content under lock never save', async () => {
  const denied = fixture()
  denied.deny()
  await assert.rejects(advanced.runSapAdtAdvanced('edit_source', denied.args, denied.ctx))
  assert.equal(denied.calls.includes('lock'), false)
  const hash = fixture()
  await assert.rejects(
    advanced.runSapAdtAdvanced(
      'edit_source',
      { ...hash.args, expectedHash: 'a'.repeat(64) },
      hash.ctx
    )
  )
  assert.equal(hash.calls.includes('save'), false)
  const stale = fixture()
  stale.change()
  await assert.rejects(advanced.runSapAdtAdvanced('edit_source', stale.args, stale.ctx))
  assert.equal(stale.calls.includes('save'), false)
  assert.ok(stale.calls.includes('unlock'))
})
test('ambiguous save is never replayed; unlock failures preserve verified save with a warning', async () => {
  const f = fixture()
  f.failSave()
  const result = await advanced.runSapAdtAdvanced('edit_source', f.args, f.ctx)
  assert.equal(result.status, 'uncertain')
  assert.equal(result.operationAttempted, true)
  assert.equal(f.calls.filter((x) => x === 'save').length, 1)
  assert.ok(f.calls.includes('unlock'))
  const unlock = fixture()
  unlock.failUnlock()
  const saved = await advanced.runSapAdtAdvanced('edit_source', unlock.args, unlock.ctx)
  assert.equal(saved.status, 'saved_inactive')
  assert.match(saved.cleanupWarning, /lock/)
})
test('activation verifies the exact inactive hash and request release never bypasses ATC or locks', async () => {
  const f = fixture()
  const result = await advanced.runSapAdtAdvanced(
    'activate_object',
    { objectPath: path, expectedHash: f.args.expectedHash },
    f.ctx
  )
  assert.equal(result.status, 'activated')
  assert.equal(result.verified, true)
  const requests = fixture()
  await advanced.runSapAdtAdvanced('release_transport', { request: 'DEVK900001' }, requests.ctx)
  assert.deepEqual(
    requests.calls.find((x) => Array.isArray(x) && x[0] === 'release'),
    ['release', false, false]
  )
})
test('ABAP Unit explicitly excludes dangerous/critical categories', async () => {
  const f = fixture()
  await advanced.runSapAdtAdvanced('unit_tests', { objectPath: path }, f.ctx)
  const flags = f.calls.find((x) => Array.isArray(x) && x[0] === 'tests')[1]
  assert.equal(flags.harmless, true)
  assert.equal(flags.dangerous, false)
  assert.equal(flags.critical, false)
  assert.equal(flags.long, false)
})
test('debug sessions preserve the client between calls and clean up only their own resources', async (t) => {
  const debug = loadTs('src/main/sapAdtDebug.ts', mocks)
  t.after(() => debug.closeSapAdtDebug())
  const calls = []
  let opens = 0
  const client = {
    login: async () => {},
    objectStructure: async () => ({}),
    debuggerSetBreakpoints: async (...args) => {
      calls.push(['breakpoints', args])
      return [{ id: 'own-breakpoint', clientId: 'own' }]
    },
    debuggerListen: async () => ({ DEBUGGEE_ID: 'dbg', DEBUGGEE_USER: 'TEST', CLIENT: 100 }),
    debuggerAttach: async () => {
      calls.push('attach')
      return {}
    },
    debuggerStackTrace: async () => ({ stack: [] }),
    debuggerChildVariables: async () => [],
    debuggerStep: async (kind) => {
      calls.push(kind)
      return {}
    },
    debuggerDeleteBreakpoints: async (bp) => {
      calls.push(['deleteBreakpoint', bp.id])
    },
    debuggerDeleteListener: async (...args) => {
      calls.push(['deleteListener', args])
    }
  }
  const open = () => {
    opens++
    return { client, setSignal() {}, close: async () => calls.push('close') }
  }
  const c = { ...connection, client: '100' },
    signal = new AbortController().signal
  const approve = async () => {},
    known = () => {}
  await debug.runSapAdtDebug('user:conn', c, { action: 'start' }, signal, open, approve, known)
  await debug.runSapAdtDebug(
    'user:conn',
    c,
    { action: 'breakpoints', objectPath: path, lines: [12] },
    signal,
    open,
    approve,
    known
  )
  assert.equal(
    (await debug.runSapAdtDebug('user:conn', c, { action: 'wait' }, signal, open, approve, known))
      .status,
    'attached'
  )
  await debug.runSapAdtDebug(
    'user:conn',
    c,
    { action: 'step', step: 'stepOver' },
    signal,
    open,
    approve,
    known
  )
  const stopped = await debug.runSapAdtDebug(
    'user:conn',
    c,
    { action: 'stop' },
    signal,
    open,
    approve,
    known
  )
  assert.equal(opens, 1)
  assert.equal(stopped.stopped, true)
  assert.ok(calls.includes('detachDebugger'))
  assert.ok(calls.some((call) => call[0] === 'deleteBreakpoint' && call[1] === 'own-breakpoint'))
  assert.ok(calls.includes('close'))
})

test('multi-edit proposals do not write; independent replacements save once, overlapping or ambiguous changes never lock', async () => {
  const f = fixture()
  const { oldText, newText, ...base } = f.args
  const args = {
    ...base,
    edits: [
      { oldText: 'old', newText: 'new' },
      { oldText: 'ENDCLASS.', newText: 'ENDCLASS. " revised' }
    ]
  }
  const preview = await advanced.runSapAdtAdvanced('preview_edits', args, f.ctx)
  assert.equal(preview.status, 'proposed')
  assert.equal(preview.changes.length, 2)
  assert.equal(f.calls.length, 0)
  const saved = await advanced.runSapAdtAdvanced('edit_source', args, f.ctx)
  assert.equal(saved.status, 'saved_inactive')
  assert.equal(saved.changes, 2)
  assert.equal(saved.validation.status, 'syntax_valid')
  assert.equal(f.calls.filter((call) => call === 'save').length, 1)
  assert.match(f.calls[0][1], /@@ linha 1 @@/)
  const overlap = fixture()
  await assert.rejects(
    advanced.runSapAdtAdvanced(
      'edit_source',
      {
        ...base,
        edits: [
          { oldText: 'CLASS old.', newText: 'A' },
          { oldText: 'old', newText: 'B' }
        ]
      },
      overlap.ctx
    ),
    /sobrepõem/
  )
  assert.equal(overlap.calls.includes('lock'), false)
  await assert.rejects(
    advanced.runSapAdtAdvanced('edit_source', { ...f.args, edits: args.edits }, fixture().ctx),
    /sem combinar/
  )
})

test('selected class includes have their own source, hash and validation; arbitrary paths cannot be read or saved', async () => {
  const f = fixture(),
    definitions = path + '/includes/definitions',
    main = path + '/source/main'
  let active = 'TYPES old TYPE string.',
    inactive = active
  f.ctx.client.objectStructure = async () => ({
    metaData: { 'adtcore:name': 'ZCL_TEST' },
    includes: [
      { name: 'main', path: main },
      { name: 'definitions', path: definitions }
    ]
  })
  f.ctx.client.getObjectSource = async (source, options) => {
    assert.equal(source, definitions)
    return options.version === 'inactive' ? inactive : active
  }
  f.ctx.client.setObjectSource = async (source, text) => {
    assert.equal(source, definitions)
    inactive = text
    f.calls.push('save')
  }
  f.ctx.client.syntaxCheck = async (source, _object, text) => {
    assert.equal(source, definitions)
    assert.equal(text, inactive)
    return []
  }
  f.ctx.hasSnapshot = (_path, _version, hash, source) =>
    hash === advanced.sourceHash(active) && source === definitions
  const args = { ...f.args, expectedHash: advanced.sourceHash(active), sourcePath: definitions }
  const result = await advanced.runSapAdtAdvanced('edit_source', args, f.ctx)
  assert.equal(result.sourcePath, definitions)
  assert.equal(inactive, 'TYPES new TYPE string.')
  await assert.rejects(
    advanced.runSapAdtAdvanced(
      'edit_source',
      { ...args, sourcePath: '/sap/bc/adt/oo/classes/foreign/source/main' },
      f.ctx
    ),
    /não pertence/
  )
})

test('syntax errors remain a verified inactive save, while activation rejects unreviewed inactive includes', async () => {
  const f = fixture()
  f.ctx.client.syntaxCheck = async () => [{ severity: 'E', line: 1, text: 'Syntax error' }]
  const result = await advanced.runSapAdtAdvanced('edit_source', f.args, f.ctx)
  assert.equal(result.status, 'saved_inactive')
  assert.equal(result.validation.status, 'syntax_errors')
  assert.equal(result.activated, false)
  const a = fixture(),
    extra = path + '/includes/definitions'
  a.ctx.client.objectStructure = async () => ({
    metaData: { 'adtcore:name': 'ZCL_TEST' },
    includes: [
      { name: 'main', path: path + '/source/main' },
      { name: 'definitions', path: extra }
    ]
  })
  const originalRead = a.ctx.client.getObjectSource
  a.ctx.client.getObjectSource = async (source, options) =>
    source === extra
      ? options.version === 'inactive'
        ? 'new pending definition'
        : 'active definition'
      : originalRead(source, options)
  await assert.rejects(
    advanced.runSapAdtAdvanced(
      'activate_object',
      { objectPath: path, expectedHash: a.args.expectedHash },
      a.ctx
    ),
    /ainda não revisadas/
  )
  assert.equal(a.calls.includes('activate'), false)
})
