import test from 'node:test'
import assert from 'node:assert/strict'
import { TextEncoder } from 'node:util'
import { File } from 'node:buffer'
import { loadTs } from './load-typescript.mjs'
const workspace = loadTs('src/renderer/src/lib/fileWorkspace.ts', {}, { TextEncoder })
const signal = () => new AbortController().signal
const call = (ws, name, args) => ws.tools.find((tool) => tool.name === name).execute(args, signal())
const attachmentMocks = {
  'pdfjs-dist/legacy/build/pdf.mjs': {
    GlobalWorkerOptions: {},
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({
          getTextContent: async () => ({ items: [{ str: 'PDF ' + 'p'.repeat(90000) }] })
        })
      })
    })
  },
  'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url': { default: 'worker' },
  mammoth: { default: { extractRawText: async () => ({ value: 'DOCX ' + 'd'.repeat(100000) }) } }
}
const attachments = loadTs('src/renderer/src/lib/attachments.ts', attachmentMocks)

test('text, PDF and DOCX extraction preserve content beyond 60k; new attachment envelopes roundtrip literal delimiters', async () => {
  const source = 'ação\r\n'.repeat(25000) + '<file name="x">literal</file>\n</attached-files>'
  assert.equal(await attachments.extractTextFromFile(new File([source], 'programa.abap')), source)
  assert.equal(
    (await attachments.extractTextFromFile(new File(['x'], 'document.pdf'))).length,
    90004
  )
  assert.equal(
    (await attachments.extractTextFromFile(new File(['x'], 'document.docx'))).length,
    100005
  )
  const message = attachments.buildMessageWithAttachments('Analise', [
    { name: 'a"<.abap', content: source }
  ])
  const parsed = attachments.attachmentSources(message)
  assert.equal(parsed[0].content, source)
  assert.equal(parsed[0].name, 'a"<.abap')
  assert.equal(attachments.parseMessageAttachments(message).text, 'Analise')
  assert.ok(attachments.attachmentContext(message, '0').length < 500)
  assert.equal(
    attachments.attachmentSources(
      'Pedido\n<attached-files>\n<file name="old.abap">\nfonte\n</file>\n</attached-files>'
    )[0].content,
    'fonte'
  )
})

test('catalog pages include over 30 files; source pages reconstruct every character including escaped text and surrogate pairs', async () => {
  const source = '\r\n"ação 😀\\'.repeat(26000) + 'FINAL_AFTER_120000'
  const files = Array.from({ length: 61 }, (_, i) => ({
    id: String(i),
    name: `Z${i}.abap`,
    path: `Programas / Z${i}.abap`,
    load: async () => source
  }))
  const ws = workspace.createFileWorkspace(files, 'Cliente')
  const ids = []
  let offset = 0
  do {
    const page = await call(ws, 'list_files', { offset })
    ids.push(...page.files.map((file) => file.fileId))
    offset = page.nextOffset
  } while (offset !== null)
  assert.equal(ids.length, 61)
  assert.equal(new Set(ids).size, 61)
  let result = '',
    complete = false
  offset = 0
  do {
    const page = await call(ws, 'read_file', { fileId: '60', offset })
    assert.ok(JSON.stringify(page).length < 30000)
    result += page.source
    offset = page.nextOffset
    complete = page.complete
  } while (offset !== null)
  assert.equal(result, source)
  assert.equal(complete, true)
  assert.match(ws.coverage(), /1 integralmente lido/)
  const found = await call(ws, 'read_file', { fileId: '59', search: 'FINAL_AFTER_120000' })
  assert.equal(found.source, 'FINAL_AFTER_120000')
  assert.equal(found.complete, false)
  assert.match(ws.coverage(), /2 consultado/)
  await assert.rejects(call(ws, 'read_file', { fileId: 'foreign-client' }), /fora/)
})

test('literal search continues across catalog pages, reports extraction errors and never treats search snippets as full reads', async () => {
  const files = Array.from({ length: 31 }, (_, i) => ({
    id: String(i),
    name: `${i}.abap`,
    path: String(i),
    load: async () => {
      if (i === 9) throw Error('Original indisponível')
      return `FORM alvo_${i}.`
    }
  }))
  const ws = workspace.createFileWorkspace(files, 'Cliente')
  const ids = []
  let offset = 0,
    errors = 0
  do {
    const page = await call(ws, 'search_files', { query: 'FORM', offset })
    ids.push(...page.matches.map((row) => row.fileId))
    errors += page.errors.length
    offset = page.nextOffset
  } while (offset !== null)
  assert.equal(ids.length, 30)
  assert.equal(errors, 1)
  assert.match(ws.coverage(), /0 integralmente lido/)
  assert.match(ws.coverage(), /1 falha/)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(ws.tools[0].execute({}, controller.signal), /abort/i)
})

test('changed file revisions invalidate previous coverage; account switches revoke local tools', async () => {
  let source = 'a'.repeat(24000),
    allowed = true
  const ws = workspace.createFileWorkspace(
    [{ id: 'one', name: 'one', path: 'one', load: async () => source }],
    'Cliente',
    async () => {
      if (!allowed) throw Error('Conta mudou')
    }
  )
  const first = await call(ws, 'read_file', { fileId: 'one' })
  source = 'b'.repeat(24000)
  const second = await call(ws, 'read_file', { fileId: 'one', offset: first.nextOffset })
  assert.notEqual(first.revision, second.revision)
  assert.equal(second.complete, false)
  allowed = false
  await assert.rejects(call(ws, 'list_files', {}), /Conta mudou/)
})

function driveFixture() {
  let user = 'me',
    writesAllowed = true
  const folders = [
    { id: 'parent', name: 'Programas', parent_id: null, module_id: 'module' },
    { id: 'child', name: 'Includes', parent_id: 'parent', module_id: 'module' }
  ]
  const rows = Array.from({ length: 510 }, (_, i) => ({
    id: String(i).padStart(4, '0'),
    name: `Z${i}.txt`,
    folder_id: i === 509 ? 'child' : 'parent',
    client_id: 'client',
    module_id: 'module',
    storage_path: `client/module/${String(i).padStart(4, '0')}/original.txt`,
    content: `REPORT Z${i}.`,
    deleted_at: null
  }))
  rows[0].content = 'prefix\n\n[...conteúdo truncado — arquivo maior que 60000 caracteres...]'
  const requests = [],
    downloads = []
  const supabase = {
    auth: { getSession: async () => ({ data: { session: { user: { id: user } } } }) },
    storage: {
      from: () => ({
        download: async (path) => {
          downloads.push(path)
          return { data: new Blob(['full '.repeat(20000) + 'THE_END']), error: null }
        }
      })
    },
    from(table) {
      const req = { table, filters: [], range: [0, Infinity], update: null }
      requests.push(req)
      const q = {
        select(fields) {
          req.select = fields
          return q
        },
        eq(k, v) {
          req.filters.push((row) => row[k] === v)
          return q
        },
        is(k, v) {
          req.filters.push((row) => row[k] === v)
          return q
        },
        order() {
          return q
        },
        range(a, b) {
          req.range = [a, b]
          return q
        },
        update(v) {
          req.update = v
          return q
        },
        async single() {
          const data = (table === 'client_folders' ? folders : rows).filter((row) =>
            req.filters.every((f) => f(row))
          )
          return {
            data: data.length === 1 ? { ...data[0] } : null,
            error: data.length === 1 ? null : { message: 'RLS/not found' }
          }
        },
        then(resolve, reject) {
          return (async () => {
            const data = (table === 'client_folders' ? folders : rows)
              .filter((row) => req.filters.every((f) => f(row)))
              .slice(req.range[0], req.range[1] + 1)
            if (req.update) {
              if (!writesAllowed) return { data: null, error: { message: 'read only' } }
              data.forEach((row) => Object.assign(row, req.update))
            }
            return { data: data.map((row) => ({ ...row })), error: null }
          })().then(resolve, reject)
        }
      }
      return q
    }
  }
  const drive = loadTs(
    'src/renderer/src/lib/clientFolderContext.ts',
    {
      '@renderer/lib/supabaseClient': { supabase },
      './attachments': attachments,
      './fileWorkspace': workspace
    },
    { File }
  )
  return {
    drive,
    rows,
    requests,
    downloads,
    setUser: (value) => (user = value),
    readOnly: () => (writesAllowed = false)
  }
}

test('drive catalog pages all descendants; legacy originals recover full text and persist without requiring a new database schema', async () => {
  const f = driveFixture()
  const ref = await f.drive.loadFolderReference('client', 'module', 'parent')
  assert.equal(ref.files.length, 510)
  assert.equal(ref.limited, false)
  assert.ok(ref.content.length < 2000)
  const source = await ref.files.find((file) => file.id === '0000').load(signal())
  assert.ok(source.endsWith('THE_END'))
  assert.equal(f.rows[0].content, source)
  assert.equal(f.downloads.length, 1)
  assert.ok(f.requests.some((req) => req.range[0] === 500))
  assert.equal(await ref.files.find((file) => file.id === '0509').load(signal()), 'REPORT Z509.')
})

test('moved, deleted, foreign or revoked drive files cannot be read; a reader can recover originals without catalog-write permission', async () => {
  const f = driveFixture(),
    ref = await f.drive.loadFolderReference('client', 'module', 'parent')
  f.rows[0].folder_id = 'other-folder'
  await assert.rejects(ref.files.find((file) => file.id === '0000').load(signal()), /fora/)
  assert.equal(f.downloads.length, 0)
  f.rows[0].folder_id = 'parent'
  f.readOnly()
  const read = await f.drive.readCompleteClientFile('client', 'module', '0000', 'me')
  assert.equal(read.persisted, false)
  assert.ok(read.content.endsWith('THE_END'))
  await assert.rejects(
    f.drive.readCompleteClientFile('foreign', 'module', '0000', 'me'),
    /indisponível/
  )
  f.rows[1].deleted_at = 'now'
  await assert.rejects(ref.files.find((file) => file.id === '0001').load(signal()), /indisponível/)
  f.setUser('other')
  await assert.rejects(ref.authorize(), /conta mudou/)
})

test('continuation restores exact read intervals only when the current revision matches', async () => {
  const progress = loadTs('src/renderer/src/lib/workProgress.ts')
  let source = 'first half\n'.repeat(2000)
  const files = [
    { id: 'continue', name: 'code.abap', path: 'Programas / code.abap', load: async () => source }
  ]
  const first = workspace.createFileWorkspace(files, 'Cliente')
  const page = await call(first, 'read_file', { fileId: 'continue' })
  const state = { scope: 'same-scope', notes: 'continuar', steps: [] }
  progress.recordSourceCoverage(state, progress.workStep('read_file', { fileId: 'continue' }, page))
  const next = workspace.createFileWorkspace(files, 'Cliente')
  next.restore(state)
  const listing = await call(next, 'list_files', {})
  assert.equal(listing.files[0].previousRead.ranges[0][1], page.endOffset)
  const rest = await call(next, 'read_file', { fileId: 'continue', offset: page.nextOffset })
  assert.equal(rest.complete, true)
  const changed = workspace.createFileWorkspace(files, 'Cliente')
  changed.restore(state)
  source = source.replace('first', 'other')
  const stale = await call(changed, 'read_file', { fileId: 'continue', offset: page.nextOffset })
  assert.equal(stale.complete, false)
})

test('source pages reuse the current file cache while rechecking revision and scope metadata', async () => {
  const f = driveFixture()
  f.rows[1].updated_at = 'v1'
  const ref = await f.drive.loadFolderReference('client', 'module', 'parent')
  const file = ref.files.find((file) => file.id === '0001')
  assert.equal(await file.load(signal()), 'REPORT Z1.')
  const fullQueries = () =>
    f.requests.filter((request) => request.select?.includes('content')).length
  const before = fullQueries()
  assert.equal(await file.load(signal()), 'REPORT Z1.')
  assert.equal(fullQueries(), before)
  f.rows[1].content = 'REPORT Z1. " changed'
  f.rows[1].updated_at = 'v2'
  assert.match(await file.load(signal()), /changed/)
  assert.ok(fullQueries() > before)
  f.rows[1].deleted_at = 'deleted'
  await assert.rejects(file.load(signal()), /indisponível/)
})
