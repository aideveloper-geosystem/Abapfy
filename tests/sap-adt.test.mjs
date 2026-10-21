import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { ADTClient } from 'abap-adt-api'
import { loadTs } from './load-typescript.mjs'
const policy = loadTs('src/shared/sapAdt.ts', {}, { URL })
const userId = '00000000-0000-4000-8000-000000000001'
const otherId = '00000000-0000-4000-8000-000000000002'
const connection = {
  id: '00000000-0000-4000-8000-000000000003',
  name: 'Sandbox',
  baseUrl: 'https://sap.example.test',
  username: 'DEVELOPER',
  client: '100',
  language: 'PT',
  environment: 'development',
  enabled: true,
  allowHttp: false,
  allowSource: true,
  allowTables: true,
  maxRows: 10,
  tables: ['MARA'],
  agents: [{ source: 'default', id: 'abap' }],
  caCertificate: ''
}
const objectPath = '/sap/bc/adt/oo/classes/zcl_example'
const sourcePath = objectPath + '/source/main'

test('connection policy rejects embedded secrets, invalid identities and implicit insecure HTTP', () => {
  for (const baseUrl of [
    'ftp://sap.test',
    'https://user:secret@sap.test',
    'https://sap.test?a=secret',
    'https://sap.test/#secret',
    'https://sap.test/other',
    'http://sap.test'
  ])
    assert.equal(policy.sapAdtConnectionSchema.safeParse({ ...connection, baseUrl }).success, false)
  assert.equal(
    policy.sapAdtConnectionSchema.parse({
      ...connection,
      baseUrl: 'https://sap.test/sap/bc/adt',
      language: 'pt'
    }).baseUrl,
    'https://sap.test'
  )
  assert.equal(
    policy.sapAdtConnectionSchema.safeParse({ ...connection, allowTables: true, tables: [] })
      .success,
    true
  )
  assert.equal(
    policy.sapAdtConnectionSchema.safeParse({ ...connection, password: 'not-allowed' }).success,
    false
  )
})
test('table queries allow exact configured tables, explicit columns and literal equality filters only', () => {
  const query = policy.sapAdtTableQuery(connection, {
    table: 'mara',
    columns: ['matnr'],
    filters: [{ column: 'matnr', value: "a'; DELETE FROM MARA; --" }],
    limit: 200
  })
  assert.equal(query.limit, 10)
  assert.equal(query.sql, "SELECT MATNR FROM MARA WHERE MATNR = 'a''; DELETE FROM MARA; --'")
  for (const args of [
    { table: 'USR02', columns: ['BNAME'] },
    { table: 'MARA', columns: ['*'] },
    { table: 'MARA', columns: ['MATNR; DELETE'] },
    { table: 'MARA', columns: ['MATNR'], sql: 'DELETE FROM MARA' },
    { table: 'MARA', columns: ['MATNR'], limit: 0 }
  ])
    assert.throws(() => policy.sapAdtTableQuery(connection, args))
  assert.throws(() =>
    policy.sapAdtTableQuery(
      { ...connection, allowTables: false },
      { table: 'MARA', columns: ['MATNR'] }
    )
  )
})
test('source paths cannot escape ADT, traverse or select arbitrary URLs', () => {
  assert.equal(policy.sapAdtPath(objectPath), objectPath)
  for (const value of [
    'https://other.test/sap/bc/adt/a',
    '//other.test/sap/bc/adt/a',
    '/sap/bc/adt/../a',
    '/sap/bc/adt/%2e%2e/a',
    '/sap/bc/adt/a?x=1',
    '/sap/bc/adt/%5cother',
    '/sap/bc/adt/%252e%252e/a',
    '/sap/bc/adt/%00'
  ])
    assert.throws(() => policy.sapAdtPath(value))
})
function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'abapfy-adt-'))
  const handlers = new Map(),
    listeners = new Map(),
    sender = {},
    calls = []
  let admin = true,
    currentUser = userId,
    encryptAvailable = true
  let sourceText = 'CLASS zcl_example DEFINITION. ENDCLASS.'
  let tableHook = async () => ({
    columns: [{ name: 'MATNR' }],
    values: [{ MATNR: '000000000000000001' }, { MATNR: '0002' }]
  })
  class Client {
    loggedin = true
    constructor(_transport, username, password, client, language) {
      calls.push({ kind: 'connect', username, password, client, language })
    }
    static mainInclude() {
      return sourcePath
    }
    async logout() {
      calls.push({ kind: 'logout' })
    }
    async searchObject(pattern, type, limit) {
      calls.push({ kind: 'search', pattern, type, limit })
      return [
        { 'adtcore:name': 'ZCL_EXAMPLE', 'adtcore:type': 'CLAS/OC', 'adtcore:uri': objectPath }
      ]
    }
    async objectStructure(p, version) {
      calls.push({ kind: 'structure', path: p, version })
      return {}
    }
    async getObjectSource(p, options) {
      calls.push({ kind: 'source', path: p, options })
      return sourceText
    }
    async tableContents(table, limit, decode, sql) {
      calls.push({ kind: 'table', table, limit, decode, sql })
      return tableHook()
    }
    async adtDiscovery() {
      return [{ title: 'Repository' }]
    }
  }
  const module = loadTs(
    'src/main/sapAdt.ts',
    {
      electron: {
        app: { getPath: () => base },
        ipcMain: {
          handle: (key, fn) => handlers.set(key, fn),
          on: (key, fn) => listeners.set(key, fn)
        },
        safeStorage: {
          isEncryptionAvailable: () => encryptAvailable,
          getSelectedStorageBackend: () => 'test',
          encryptString: (value) => Buffer.from('protected:' + value),
          decryptString: (value) => value.toString().replace(/^protected:/, '')
        }
      },
      'abap-adt-api': { ADTClient: Client },
      './sapAdtTransport': { sapAdtTransport: () => ({ client: {}, close() {} }) }
    },
    {
      URL,
      process: {
        ...process,
        env: {
          ...process.env,
          ABAPFY_SUPABASE_URL: 'https://auth.example.test',
          ABAPFY_SUPABASE_ANON_KEY: 'test-public'
        }
      },
      fetch: async (url) => ({
        ok: true,
        json: async () =>
          url.includes('/auth/') ? { id: currentUser } : admin ? [{ role: 'ADMIN' }] : []
      })
    }
  )
  let approve = async () => true
  module.registerSapAdtIpc(
    () => ({ webContents: sender }),
    (request) => approve(request)
  )
  const invoke = (name, ...args) => handlers.get('sapAdt:' + name)({ sender }, ...args)
  const save = (config = connection, password = 'test-secret') =>
    invoke('save', 'token', config, password)
  const begin = (agent = { source: 'default', id: 'abap' }) =>
    invoke('beginTurn', 'token', agent, userId, connection.id)
  const execute = (turn, name, args, callId = crypto.randomUUID()) =>
    invoke(
      'callTool',
      turn.id,
      turn.tools.find((tool) => tool.name === name)?.qualifiedName ?? 'missing',
      args,
      callId
    )
  t.after(() => {
    module.closeSapAdt()
    assert.ok(path.resolve(base).startsWith(path.resolve(os.tmpdir()) + path.sep + 'abapfy-adt-'))
    fs.rmSync(base, { recursive: true, force: true })
  })
  return {
    module,
    invoke,
    save,
    begin,
    execute,
    calls,
    base,
    listeners,
    sender,
    setAdmin: (v) => {
      admin = v
    },
    setUser: (v) => {
      currentUser = v
    },
    setEncryption: (v) => {
      encryptAvailable = v
    },
    setApproval: (fn) => {
      approve = fn
    },
    setSource: (value) => {
      sourceText = value
    },
    setTableHook: (fn) => {
      tableHook = fn
    }
  }
}
test('any authenticated user manages their own connections, preserving sender/account isolation and encrypted secrets', async (t) => {
  const f = fixture(t)
  const rows = await f.save()
  assert.equal(rows[0].hasPassword, true)
  assert.equal(JSON.stringify(rows).includes('test-secret'), false)
  const file = path.join(f.base, 'sap-adt', userId + '.json')
  assert.equal(fs.readFileSync(file, 'utf8').includes('test-secret'), false)
  f.setAdmin(false)
  await f.save()
  await f.invoke('remove', 'token', connection.id)
  await f.save()
  await f.invoke('setPassword', 'token', connection.id, 'new-secret')
  f.setUser(otherId)
  await assert.rejects(f.begin(), /conta mudou/)
  assert.equal((await f.invoke('list', 'token')).length, 0)
  await assert.rejects(f.invoke('setPassword', 'token', connection.id, 'wrong'), /não encontrada/)
  f.setUser(userId)
  f.setAdmin(true)
  await f.save({ ...connection, baseUrl: 'https://new.test' }, undefined)
  // explicit direct call omits password, so an endpoint edit discards inherited credentials
  const changed = await f.invoke('save', 'token', { ...connection, baseUrl: 'https://other.test' })
  assert.equal(changed[0].hasPassword, false)
})
test('secret writes fail closed when OS encryption is unavailable', async (t) => {
  const f = fixture(t)
  f.setEncryption(false)
  await assert.rejects(f.save(), /cofre/)
  assert.equal((await f.invoke('list', 'token')).length, 0)
})
test('agent permissions and enabled state determine the actual main-process tool catalog', async (t) => {
  const f = fixture(t)
  await f.save()
  const denied = await f.begin({ source: 'custom', id: 'abap' })
  assert.equal(denied.tools.length, 0)
  assert.equal(f.calls.length, 0)
  const turn = await f.begin()
  assert.deepEqual(
    [...turn.tools.map((tool) => tool.name)],
    ['search_objects', 'read_source', 'read_table']
  )
  assert.equal(
    turn.tools.some((tool) => /write|activate|delete|execute|sql/.test(tool.name)),
    false
  )
  await assert.rejects(f.execute(turn, 'read_source', { objectPath }), /Pesquise/)
  assert.equal(f.calls.length, 0)
  const found = await f.execute(turn, 'search_objects', { pattern: 'ZCL*' })
  assert.equal(found.result.objects[0].objectPath, objectPath)
  const source = await f.execute(turn, 'read_source', { objectPath })
  assert.match(source.result.source, /CLASS/)
  assert.equal(f.calls.find((call) => call.kind === 'source').options.version, 'active')
  const readCount = f.calls.length
  await f.save({ ...connection, enabled: false })
  await assert.rejects(f.execute(turn, 'search_objects', { pattern: '*' }), /mudou|revogada/)
  assert.equal(f.calls.length, readCount)
})
test('table refusal sends no SAP traffic; approval shows exact scope and enforces the row cap', async (t) => {
  const f = fixture(t)
  await f.save()
  const turn = await f.begin()
  f.setApproval(async (request) => {
    assert.match(request.detail, /SELECT MATNR FROM MARA/)
    assert.match(request.detail, /Mandante: 100/)
    assert.match(request.detail, /Limite: 10/)
    return false
  })
  await assert.rejects(
    f.execute(turn, 'read_table', { table: 'MARA', columns: ['MATNR'], limit: 200 }),
    /recusada/
  )
  assert.equal(f.calls.length, 0)
  f.setApproval(async () => true)
  const result = await f.execute(turn, 'read_table', {
    table: 'MARA',
    columns: ['MATNR'],
    limit: 200
  })
  assert.equal(result.client, '100')
  assert.equal(result.result.rows[0].MATNR, '000000000000000001')
  assert.equal(f.calls.find((call) => call.kind === 'table').limit, 10)
  assert.equal(f.calls.find((call) => call.kind === 'table').decode, false)
  const audit = fs.readFileSync(path.join(f.base, 'sap-adt', userId + '.audit.jsonl'), 'utf8')
  assert.equal(audit.includes('000000000000000001'), false)
  assert.equal(audit.includes('test-secret'), false)
})
test('configuration or logout changes while approval is open prevent SAP calls', async (t) => {
  const f = fixture(t)
  await f.save()
  let turn = await f.begin()
  f.setApproval(async () => {
    await f.save({ ...connection, client: '200' })
    return true
  })
  await assert.rejects(
    f.execute(turn, 'read_table', { table: 'MARA', columns: ['MATNR'] }),
    /mudou/
  )
  assert.equal(f.calls.length, 0)
  await f.save()
  turn = await f.begin()
  f.setApproval(async () => {
    f.module.closeSapAdt()
    return true
  })
  await assert.rejects(f.execute(turn, 'read_table', { table: 'MARA', columns: ['MATNR'] }))
  assert.equal(f.calls.length, 0)
  await assert.rejects(f.execute(turn, 'search_objects', { pattern: '*' }), /expirou/)
})
test('cancellation and errors never leak SAP secrets or successful evidence', async (t) => {
  const f = fixture(t)
  await f.save()
  const turn = await f.begin()
  f.setTableHook(async () => {
    f.module.closeSapAdt()
    return { columns: [], values: [] }
  })
  await assert.rejects(f.execute(turn, 'read_table', { table: 'MARA', columns: ['MATNR'] }))
  const next = await f.begin()
  f.setTableHook(async () => {
    throw new Error('test-secret SAP internal payload')
  })
  await assert.rejects(
    f.execute(next, 'read_table', { table: 'MARA', columns: ['MATNR'] }),
    (error) => !error.message.includes('test-secret') && /comunicação ADT/.test(error.message)
  )
})
test('native HTTP transport works with the real ADT client, preserves cookies and mandante, blocks redirects and external URLs', async (t) => {
  const requests = []
  const server = http.createServer((req, res) => {
    requests.push({ url: req.url, cookie: req.headers.cookie, auth: req.headers.authorization })
    if (req.url.startsWith('/sap/bc/adt/compatibility/graph')) {
      res.setHeader('x-csrf-token', 'csrf-test')
      res.setHeader('set-cookie', ['SAP_SESSION=test; Path=/'])
      res.end('<graph/>')
    } else if (req.url.startsWith('/sap/bc/adt/discovery'))
      res.end(
        '<app:service><app:workspace><atom:title>Repository</atom:title><app:collection href="/sap/bc/adt/oo/classes"><atom:title>Classes</atom:title></app:collection></app:workspace></app:service>'
      )
    else if (req.url.startsWith('/sap/bc/adt/redirect')) {
      res.writeHead(302, { location: 'http://other.test/' })
      res.end()
    } else if (req.url.startsWith('/sap/bc/adt/slow')) {
      /* waits for client cancellation */
    } else res.end('ok')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => {
    server.closeAllConnections()
    server.close()
  })
  const config = {
    ...connection,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    allowHttp: true
  }
  const { sapAdtTransport } = loadTs('src/main/sapAdtTransport.ts', {}, { URL })
  const controller = new AbortController(),
    transport = sapAdtTransport(config, controller.signal)
  t.after(() => transport.close())
  const client = new ADTClient(transport.client, 'TEST', 'test-secret', '100', 'PT')
  const services = await client.adtDiscovery()
  assert.equal(services[0].title, 'Repository')
  assert.ok(
    requests.every(
      (req) => req.url.includes('sap-client=100') && req.url.includes('sap-language=PT')
    )
  )
  assert.match(requests[1].cookie, /SAP_SESSION=test/)
  assert.equal(requests[0].auth, 'Basic ' + Buffer.from('TEST:test-secret').toString('base64'))
  await assert.rejects(transport.client.request({ url: '/sap/bc/adt/redirect' }), /302/)
  await assert.rejects(
    transport.client.request({ url: 'http://other.test/sap/bc/adt/a' }),
    /não autorizado/
  )
  const beforeWrites = requests.length
  for (const [method, url] of [
    ['PUT', '/sap/bc/adt/oo/classes/z/source/main'],
    ['DELETE', '/sap/bc/adt/oo/classes/z'],
    ['POST', '/sap/bc/adt/activation']
  ]) {
    await assert.rejects(transport.client.request({ method, url }), /somente leitura/)
  }
  assert.equal(requests.length, beforeWrites)
  const pending = transport.client.request({ url: '/sap/bc/adt/slow' })
  controller.abort()
  await assert.rejects(pending)
})

test('large source pages reconstruct all content without breaking the serialized tool budget', () => {
  const source = 'CLASS zcl_example.\n\t" comentário 😀 \\ literal\n'
    .replace(/\\n/g, '\n')
    .repeat(2500)
  let offset = 0,
    rebuilt = '',
    pages = 0
  do {
    const page = policy.sapAdtSourcePage(source, { objectPath, offset })
    assert.equal(page.offset, offset)
    assert.ok(page.endOffset > offset)
    assert.ok(JSON.stringify(page).length < 24000)
    rebuilt += page.source
    offset = page.nextOffset
    pages++
  } while (offset !== null)
  assert.ok(pages > 2)
  assert.equal(rebuilt, source)
  const emoji = policy.sapAdtSourcePage('😀x', { objectPath, length: 1 })
  assert.equal(emoji.source, '😀')
  assert.equal(emoji.nextOffset, 2)
})
test('source search reaches a method beyond the old cut and reports absence without inventing text', () => {
  const source = 'a'.repeat(30000) + 'METHOD z_get_table_hkont. WRITE hello. ENDMETHOD.'
  const page = policy.sapAdtSourcePage(source, { objectPath, search: 'method Z_GET_TABLE_HKONT' })
  assert.equal(page.offset, 30000)
  assert.match(page.source, /^METHOD z_get_table_hkont/)
  assert.equal(page.searchFound, true)
  const missing = policy.sapAdtSourcePage(source, { objectPath, search: 'not_present' })
  assert.equal(missing.searchFound, false)
  assert.equal(missing.complete, false)
  assert.equal(missing.source, '')
  assert.throws(() => policy.sapAdtSourcePage(source, { objectPath, offset: -1 }))
})
test('source continuation uses the same per-message snapshot and hash without re-reading SAP', async (t) => {
  const f = fixture(t)
  await f.save()
  const turn = await f.begin()
  f.setSource('a'.repeat(30000) + 'METHOD tail. ENDMETHOD.')
  await f.execute(turn, 'search_objects', { pattern: 'ZCL*' })
  const first = await f.execute(turn, 'read_source', { objectPath })
  assert.equal(first.result.hasMore, true)
  assert.equal(first.result.nextOffset, 12000)
  f.setSource('changed in SAP')
  const next = await f.execute(turn, 'read_source', { objectPath, offset: first.result.nextOffset })
  assert.equal(next.result.sourceHash, first.result.sourceHash)
  const tail = await f.execute(turn, 'read_source', { objectPath, search: 'METHOD tail' })
  assert.match(tail.result.source, /^METHOD tail/)
  assert.equal(f.calls.filter((call) => call.kind === 'source').length, 1)
  f.module.endSapAdtTurn(turn.id)
  await assert.rejects(f.execute(turn, 'read_source', { objectPath }), /expirou/)
})

test('empty table restriction permits named reads while preserving validation, approvals and SAP limits', async (t) => {
  const open = { ...connection, tables: [] }
  const query = policy.sapAdtTableQuery(open, { table: 't001', columns: ['BUKRS'], limit: 200 })
  assert.equal(query.sql, 'SELECT BUKRS FROM T001')
  assert.equal(query.limit, 10)
  for (const table of [
    'MARA; DELETE FROM MARA',
    'MARA WHERE 1=1',
    '*',
    'MARA--',
    'MARA\nUNION SELECT'
  ])
    assert.throws(() => policy.sapAdtTableQuery(open, { table, columns: ['MATNR'] }))
  assert.throws(() =>
    policy.sapAdtTableQuery({ ...open, allowTables: false }, { table: 'T001', columns: ['BUKRS'] })
  )
  const f = fixture(t)
  await f.save(open)
  const turn = await f.begin()
  const tool = turn.tools.find((item) => item.name === 'read_table')
  assert.equal(tool.inputSchema.properties.table.enum, undefined)
  assert.equal(tool.requiresConfirmation, true)
  f.setApproval(async () => false)
  await assert.rejects(
    f.execute(turn, 'read_table', { table: 'T001', columns: ['BUKRS'] }),
    /recusada/
  )
  assert.equal(f.calls.length, 0)
  f.setApproval(async () => true)
  await f.execute(turn, 'read_table', { table: 'T001', columns: ['BUKRS'] })
  assert.equal(f.calls.find((item) => item.kind === 'table').table, 'T001')
})

test('access diagnostics distinguish disabled connection, missing agent binding and disabled table permission', () => {
  const agent = { source: 'default', id: 'abap' }
  assert.match(
    policy.sapAdtAccessDiagnostics([{ ...connection, enabled: false }], agent)[0],
    /conexão ADT desativada/
  )
  assert.match(
    policy.sapAdtAccessDiagnostics(connection ? [connection] : [], {
      source: 'custom',
      id: 'abap'
    })[0],
    /agente não está autorizado/
  )
  assert.match(
    policy.sapAdtAccessDiagnostics([{ ...connection, allowTables: false }], agent)[0],
    /consulta de tabelas desativada/
  )
  assert.match(
    policy.sapAdtAccessDiagnostics([connection], agent)[0],
    /consulta de tabelas habilitada/
  )
})

test('each message grants exactly its selected connection, rejecting absent, foreign and removed selections without fallback', async (t) => {
  const f = fixture(t)
  f.setAdmin(false)
  await f.save()
  const second = {
    ...connection,
    id: '00000000-0000-4000-8000-000000000004',
    name: 'QA',
    environment: 'quality'
  }
  await f.save(second)
  const agent = { source: 'default', id: 'abap' }
  const firstTurn = await f.begin()
  assert.ok(firstTurn.tools.length > 0)
  assert.ok(firstTurn.tools.every((tool) => tool.serverId === connection.id))
  const secondTurn = await f.invoke('beginTurn', 'token', agent, userId, second.id)
  assert.ok(secondTurn.tools.length > 0)
  assert.ok(secondTurn.tools.every((tool) => tool.serverId === second.id))
  await assert.rejects(
    f.invoke(
      'callTool',
      firstTurn.id,
      secondTurn.tools[0].qualifiedName,
      { pattern: 'Z*' },
      'cross-connection'
    ),
    /não autorizada/
  )
  await assert.rejects(f.invoke('beginTurn', 'token', agent, userId), /UUID|uuid|string|inválid/i)
  f.setUser(otherId)
  await assert.rejects(
    f.invoke('beginTurn', 'token', agent, otherId, connection.id),
    /não encontrada/
  )
  await assert.rejects(f.invoke('test', 'token', connection.id), /não encontrada/)
  await f.save({ ...connection, name: 'Other account connection' })
  await f.invoke('remove', 'token', connection.id)
  assert.equal((await f.invoke('list', 'token')).length, 0)
  f.setUser(userId)
  assert.equal((await f.invoke('list', 'token')).length, 2)
  await f.invoke('remove', 'token', second.id)
  await assert.rejects(f.invoke('beginTurn', 'token', agent, userId, second.id), /não encontrada/)
  await f.save({ ...connection, enabled: false })
  assert.equal((await f.begin()).tools.length, 0)
  assert.equal(f.calls.length, 0)
})
