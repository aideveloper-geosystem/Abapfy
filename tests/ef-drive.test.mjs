import test from 'node:test'
import assert from 'node:assert/strict'
import PizZip from 'pizzip'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { loadTs } from './load-typescript.mjs'

const templates = loadTs('src/renderer/src/lib/efTemplate.ts')
function templateBuffer() {
  const zip = new PizZip()
  zip.file(
    'word/document.xml',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Projeto: </w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>INSIRA NOME</w:t></w:r></w:p><w:tbl><w:tblPr><w:tblW w:w="9000"/></w:tblPr><w:tr><w:tc><w:p/></w:tc><w:tc><w:p><w:r><w:t>Descrição fixa</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:drawing/></w:r><w:r><w:t>Logo protegido</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>'
  )
  zip.file('word/header1.xml', '<w:hdr><w:p><w:r><w:t>Cliente</w:t></w:r></w:p></w:hdr>')
  zip.file('word/media/logo.png', new Uint8Array([1, 2, 3, 4]))
  zip.file('word/styles.xml', '<styles>estilos do cliente</styles>')
  zip.file('word/_rels/document.xml.rels', '<relationships>logo</relationships>')
  return zip.generate({ type: 'arraybuffer' })
}

test('client template edits preserve table structure, logo, headers, styles and unchanged run formatting', async () => {
  const snapshot = await templates.readEfTemplate(templateBuffer())
  const data = [
    { paragraph_id: '0:p0', text: 'Projeto: Pedido & aprovação' },
    { paragraph_id: '0:p1', text: 'Etapa 1\nEtapa 2' }
  ]
  const blob = templates.applyEfTemplateEdits(snapshot, snapshot.revision, data)
  const zip = new PizZip(await blob.arrayBuffer())
  const xml = zip.file('word/document.xml').asText()
  assert.match(xml, /<w:rPr><w:b\/><\/w:rPr><w:t>Projeto: <\/w:t>/)
  assert.match(xml, /<w:rPr><w:i\/><\/w:rPr><w:t xml:space="preserve">Pedido &amp; aprovação/)
  assert.match(xml, /<w:br\/>/)
  assert.match(xml, /<w:tblW w:w="9000"\/>/)
  assert.match(xml, /Descrição fixa/)
  assert.equal(
    zip.file('word/header1.xml').asText(),
    new PizZip(snapshot.buffer).file('word/header1.xml').asText()
  )
  assert.equal(zip.file('word/styles.xml').asText(), '<styles>estilos do cliente</styles>')
  assert.deepEqual(Array.from(zip.file('word/media/logo.png').asUint8Array()), [1, 2, 3, 4])
  assert.match(templates.efDocxText(await blob.arrayBuffer()), /Etapa 1\nEtapa 2/)
})

test('template edits reject stale versions, protected paragraphs, duplicate IDs and unchanged output', async () => {
  const s = await templates.readEfTemplate(templateBuffer())
  assert.throws(
    () => templates.applyEfTemplateEdits(s, 'old', [{ paragraph_id: '0:p0', text: 'Novo' }]),
    /versão/
  )
  assert.throws(
    () => templates.applyEfTemplateEdits(s, s.revision, [{ paragraph_id: '0:p3', text: 'Novo' }]),
    /protegido/
  )
  assert.throws(
    () =>
      templates.applyEfTemplateEdits(s, s.revision, [
        { paragraph_id: '0:p0', text: 'Novo' },
        { paragraph_id: '0:p0', text: 'Duplicado' }
      ]),
    /duplicado/
  )
  assert.throws(
    () =>
      templates.applyEfTemplateEdits(s, s.revision, [
        { paragraph_id: '0:p0', text: s.paragraphs[0].text }
      ]),
    /sem alterações/
  )
})

test('generation requires a drive template and never fetches a bundled fallback', async () => {
  const ef = loadTs('src/renderer/src/lib/efDocx.ts')
  await assert.rejects(ef.generateEfDocx({ project_name: 'Teste', functional_spec: 'Processo' }), /carregado do drive/)
  const snapshot = await templates.readEfTemplate(templateBuffer())
  const blob = await ef.generateEfDocx({ template_revision: snapshot.revision, template_edits: [{ paragraph_id: '0:p0', text: 'Projeto: Teste' }] }, snapshot)
  assert.match(templates.efDocxText(await blob.arrayBuffer()), /Projeto: Teste/)
})

const job = () => ({
  fileId: 'file-output',
  clientId: 'client-a',
  moduleId: 'working-module',
  folderId: 'working-folder',
  userId: 'user-a',
  destinationLabel: 'Cliente / Programa / Trabalho',
  templateFileId: null,
  templateLabel: 'Modelo base',
  fileName: 'EF_Teste.docx',
  state: 'pending'
})
function fixture() {
  const state = {
    modules: [{ id: 'ef-module', client_id: 'client-a', name: 'EF' }],
    files: [],
    folders: [{ id: 'working-folder', client_id: 'client-a', module_id: 'working-module' }],
    binaries: new Map(),
    uploads: 0,
    inserts: 0,
    failInsert: false,
    commitInsertError: false,
    allow: true
  }
  const fake = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-a' } }, error: null }) },
    rpc: async () => ({ data: state.allow, error: null }),
    from(table) {
      let conditions = [],
        single = false,
        limit = Infinity
      const query = {
        select() {
          return query
        },
        eq(key, value) {
          conditions.push((r) => r[key] === value)
          return query
        },
        is(key, value) {
          conditions.push((r) => (r[key] ?? null) === value)
          return query
        },
        ilike(key, value) {
          conditions.push((r) => r[key]?.toLowerCase() === value.toLowerCase())
          return query
        },
        limit(value) {
          limit = value
          return query
        },
        maybeSingle() {
          single = true
          return query
        },
        async insert(row) {
          state.inserts++
          if (state.failInsert) return { error: { message: 'offline' } }
          state.files.push(row)
          return { error: state.commitInsertError ? { message: 'response lost' } : null }
        },
        then(resolve, reject) {
          const rows = (
            table === 'client_modules'
              ? state.modules
              : table === 'client_folders'
                ? state.folders
                : state.files
          )
            .filter((r) => conditions.every((match) => match(r)))
            .slice(0, limit)
          return Promise.resolve({ data: single ? (rows[0] ?? null) : rows, error: null }).then(
            resolve,
            reject
          )
        }
      }
      return query
    },
    storage: {
      from: () => ({
        download: async (key) => ({
          data: state.binaries.get(key) ?? null,
          error: state.binaries.has(key) ? null : { message: 'missing' }
        }),
        upload: async (key, blob) => {
          state.uploads++
          if (state.binaries.has(key)) return { error: { message: 'exists' } }
          state.binaries.set(key, blob)
          return { error: null }
        }
      })
    }
  }
  const ef = loadTs(
    'src/renderer/src/lib/efDocx.ts',
    { '../docs/MODELO BASE EF.docx?url': 'base' },
    { fetch: async () => ({ ok: true, arrayBuffer: async () => templateBuffer() }) }
  )
  const service = loadTs('src/renderer/src/lib/efDrive.ts', {
    './supabaseClient': { supabase: fake },
    './efDocx': ef,
    './efTemplate': templates
  })
  return { state, service }
}

test('template lookup uses only the client EF module root and falls back only when absent', async () => {
  const { state, service } = fixture()
  state.files.push({
    id: 'other',
    client_id: 'client-a',
    module_id: 'working-module',
    folder_id: null,
    name: 'default.docx',
    storage_path: 'other-path'
  })
  await assert.rejects(service.prepareClientEfTemplate('client-a'), /Envie default.docx ou base.docx/)
  state.files.push({
    id: 'template-a',
    client_id: 'client-a',
    module_id: 'ef-module',
    folder_id: null,
    name: 'default.docx',
    storage_path: 'template-path'
  })
  state.binaries.set('template-path', new Blob([templateBuffer()]))
  assert.equal((await service.prepareClientEfTemplate('client-a')).fileId, 'template-a')
  state.binaries.delete('template-path')
  await assert.rejects(service.prepareClientEfTemplate('client-a'), /ler o modelo EF/)
})

test('EFs module loads base.docx from the drive and prioritizes default.docx', async () => {
  const { state, service } = fixture()
  state.modules[0].name = 'EFs'
  const base = { id: 'base-a', client_id: 'client-a', module_id: 'ef-module', folder_id: null, name: 'base.docx', storage_path: 'base-path' }
  state.files.push(base)
  state.binaries.set('base-path', new Blob([templateBuffer()]))
  const prepared = await service.prepareClientEfTemplate('client-a')
  assert.equal(prepared.fileId, 'base-a')
  assert.match(prepared.label, /EFs \/ base.docx/)
  assert.ok(prepared.snapshot)
  state.files.push({ ...base, id: 'default-a', name: 'default.docx', storage_path: 'default-path' })
  state.binaries.set('default-path', new Blob([templateBuffer()]))
  assert.equal((await service.prepareClientEfTemplate('client-a')).fileId, 'default-a')
  state.binaries.delete('default-path')
  await assert.rejects(service.prepareClientEfTemplate('client-a'), /ler o modelo EF/)
})

test('missing and ambiguous EF modules prevent generation', async () => {
  const { state, service } = fixture()
  state.modules = []
  await assert.rejects(service.prepareClientEfTemplate('client-a'), /Crie o módulo/)
  state.modules = [{ id: 'one', name: 'EF', client_id: 'client-a' }, { id: 'two', name: 'EFs', client_id: 'client-a' }]
  await assert.rejects(service.prepareClientEfTemplate('client-a'), /mais de um módulo/)
})

test('generated EF is saved to the working folder and a repeated job never duplicates it', async () => {
  const { state, service } = fixture()
  const blob = new Blob([templateBuffer()])
  await service.saveEfToDrive(job(), blob, 'Conteúdo da EF')
  await service.saveEfToDrive(job(), blob, 'Conteúdo da EF')
  assert.equal(state.uploads, 1)
  assert.equal(state.inserts, 1)
  assert.equal(state.files[0].folder_id, 'working-folder')
  assert.equal(state.files[0].module_id, 'working-module')
  assert.equal(state.files[0].name, 'EF_Teste.docx')
  assert.equal(state.files[0].storage_path, 'client-a/working-module/file-output/original.docx')
})

test('unauthorized or moved destination cannot upload into another client/module', async () => {
  const { state, service } = fixture()
  state.folders[0].module_id = 'other-module'
  await assert.rejects(
    service.saveEfToDrive(job(), new Blob([templateBuffer()]), 'EF'),
    /pasta de destino/
  )
  assert.equal(state.uploads, 0)
  state.folders[0].module_id = 'working-module'
  state.allow = false
  await assert.rejects(
    service.saveEfToDrive(job(), new Blob([templateBuffer()]), 'EF'),
    /autorizar/
  )
  assert.equal(state.uploads, 0)
})

test('ambiguous insert success is recovered without deleting or duplicating the shared binary', async () => {
  const { state, service } = fixture()
  state.commitInsertError = true
  await service.saveEfToDrive(job(), new Blob([templateBuffer()]), 'EF')
  assert.equal(state.files.length, 1)
  assert.equal(state.binaries.size, 1)
})

test('failed registration can retry using the identical uploaded binary even if the template disappears', async () => {
  const { state, service } = fixture()
  const snapshot = await templates.readEfTemplate(templateBuffer())
  const data = {
    project_name: 'Teste',
    functional_spec: 'EF completa',
    template_revision: snapshot.revision,
    template_edits: [{ paragraph_id: '0:p0', text: 'Projeto: Teste' }]
  }
  state.failInsert = true
  const first = await service.completeEfDocument(
    data,
    { ...job(), templateFileId: 'removed-template', templateRevision: snapshot.revision },
    { fileId: 'removed-template', label: 'default.docx', snapshot }
  )
  assert.equal(first.state, 'error')
  assert.ok(first.outputDigest)
  state.failInsert = false
  const retry = await service.completeEfDocument(data, first)
  assert.equal(retry.state, 'saved')
  assert.equal(state.files.length, 1)
  assert.equal(state.binaries.size, 1)
  assert.match(state.files[0].content, /Projeto: Teste/)
})

test('cancellation before generation produces no shared output', async () => {
  const { state, service } = fixture()
  const controller = new AbortController()
  controller.abort()
  const result = await service.completeEfDocument(
    { project_name: 'Teste', functional_spec: 'EF' },
    job(),
    undefined,
    controller.signal
  )
  assert.equal(result.state, 'error')
  assert.equal(state.uploads, 0)
})

test('Word opening writes only a sanitized DOCX into an isolated temporary directory', async () => {
  const { openGeneratedDocx } = loadTs('src/main/documentFiles.ts', {}, { Uint8Array })
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'abapfy-document-test-'))
  try {
    let opened
    await openGeneratedDocx(
      new Uint8Array(templateBuffer()),
      'EF_Teste.docx',
      root,
      async (file) => {
        opened = file
        return ''
      }
    )
    assert.equal(path.dirname(path.dirname(opened)), root)
    assert.equal(path.basename(opened), 'EF_Teste.docx')
    assert.ok((await fs.readFile(opened)).length)
    await assert.rejects(
      openGeneratedDocx(new Uint8Array(templateBuffer()), '../bad.docx', root, async () => ''),
      /Nome/
    )
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
