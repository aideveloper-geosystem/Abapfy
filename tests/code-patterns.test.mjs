import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-typescript.mjs'

function setup({ insertError = null, saveFails = false } = {}) {
  const calls = []
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-a' } } }) },
    from(table) {
      const q = {
        insert(row) { calls.push(['insert', table, row]); q.row = row; return q },
        update(row) { calls.push(['update', table, row]); return q },
        select() { return q },
        eq() { return q },
        is() { return q },
        limit() { return q },
        maybeSingle: async () => ({ data: table === 'client_folders' ? { id: 'folder-1' } : null, error: null }),
        single: async () => insertError
          ? { data: null, error: insertError }
          : { data: { id: 'p1', client_id: 'c1', module_id: 'm1', title: q.row?.title ?? 't', kind: q.row?.kind ?? 'snippet', tags: q.row?.tags ?? [], content: q.row?.content ?? '', approved_by: 'user-a', approved_at: '2026-01-01' }, error: null },
        then(resolve) { resolve({ error: null }) }
      }
      return q
    }
  }
  const mod = loadTs('src/renderer/src/lib/codePatterns.ts', {
    './supabaseClient': { supabase },
    './abapDrive': { saveAbapArtifacts: async (scope, artifacts) => { calls.push(['save', scope, artifacts]); if (saveFails) throw new Error('drive indisponível'); return ['file-1'] } }
  })
  return { mod, calls }
}

const pattern = (over) => ({ id: 'x', clientId: 'c', moduleId: 'm', fileId: null, sourceChatId: null, title: 't', description: null, kind: 'snippet', tags: [], content: 'x', approvedBy: 'u', approvedAt: '2026-01-01', revokedAt: null, ...over })
const json = (value) => JSON.stringify(value)

test('kind and title come from the declaration, then from the first comment', () => {
  const { mod } = setup()
  assert.equal(mod.detectPatternKind('REPORT zfi_saldo.\nWRITE 1.'), 'report')
  assert.equal(mod.detectPatternKind('CLASS zcl_log DEFINITION.'), 'class')
  assert.equal(mod.detectPatternKind('FUNCTION z_x.'), 'function')
  assert.equal(mod.detectPatternKind('SELECT * FROM mara.'), 'snippet')
  assert.equal(mod.suggestPatternTitle('CLASS zcl_log DEFINITION.'), 'zcl_log')
  assert.equal(mod.suggestPatternTitle('*&----*\n* Tratamento de erro BAPI\nCALL FUNCTION.'), 'Tratamento de erro BAPI')
  assert.equal(mod.suggestPatternTitle('WRITE 1.'), 'Trecho aprovado')
})

test('tags are normalised, deduplicated and capped', () => {
  const { mod } = setup()
  assert.equal(json(mod.parseTags(' BAPI, Erro ; bapi,\nlog de erro ')), json(['bapi', 'erro', 'log-de-erro']))
  assert.equal(mod.parseTags(Array.from({ length: 12 }, (_, i) => 't' + i).join(',')).length, 8)
})

test('relevant patterns rank by request overlap, skip revoked and respect limit and budget', () => {
  const { mod } = setup()
  const list = [
    pattern({ id: 'a', title: 'Log de erros', tags: ['erro'], approvedAt: '2026-01-01' }),
    pattern({ id: 'b', title: 'Leitura de pedido BAPI', tags: ['bapi'], approvedAt: '2026-01-02' }),
    pattern({ id: 'c', title: 'Revogado de pedido', tags: ['bapi'], revokedAt: '2026-02-01' }),
    pattern({ id: 'd', title: 'Outro', approvedAt: '2026-03-01' })
  ]
  const ids = (items) => items.map((item) => item.id).join(',')
  assert.equal(ids(mod.selectRelevantPatterns(list, 'criar pedido com BAPI')), 'b,d,a')
  assert.equal(ids(mod.selectRelevantPatterns(list, 'criar pedido com BAPI', { limit: 1 })), 'b')
  const big = pattern({ id: 'big', title: 'Pedido BAPI gigante', tags: ['bapi'], content: 'x'.repeat(9000) })
  assert.equal(ids(mod.selectRelevantPatterns([big, ...list], 'pedido bapi')), 'b,d,a')
})

test('context block lists the approved code and tells the agent to adapt, not copy', () => {
  const { mod } = setup()
  assert.equal(mod.formatPatternsContext([]), '')
  const text = mod.formatPatternsContext([pattern({ title: 'Log', kind: 'class', tags: ['erro'], content: 'CLASS zcl_log.' })])
  assert.match(text, /<padroes-aprovados>/)
  assert.match(text, /### 1\. Log \(Classe, erro\)/)
  assert.match(text, /CLASS zcl_log\./)
  assert.match(text, /Não copie trechos que não se aplicam/)
})

test('approval records the pattern first, then keeps a drive copy in the patterns folder', async () => {
  const { mod, calls } = setup()
  const result = await mod.approveCodePattern({ userId: 'user-a', clientId: 'c1', moduleId: 'm1', chatId: 'chat-1', code: 'CLASS zcl_log DEFINITION.\r\n', title: 'Log', description: '', tags: ['erro'] })
  assert.equal(result.driveError, null)
  assert.equal(result.pattern.fileId, 'file-1')
  const insert = calls.find((c) => c[0] === 'insert' && c[1] === 'client_code_patterns')[2]
  assert.equal(insert.content, 'CLASS zcl_log DEFINITION.')
  assert.equal(insert.kind, 'class')
  assert.equal('approved_by' in insert, false)
  assert.ok(calls.findIndex((c) => c[0] === 'insert') < calls.findIndex((c) => c[0] === 'save'))
  const save = calls.find((c) => c[0] === 'save')
  assert.equal(save[1].folderId, 'folder-1')
  assert.equal(save[2][0].name, 'Log.abap')
})

test('a duplicate approval fails before anything is written to the drive', async () => {
  const { mod, calls } = setup({ insertError: { code: '23505', message: 'duplicate' } })
  await assert.rejects(mod.approveCodePattern({ userId: 'user-a', clientId: 'c1', moduleId: 'm1', chatId: null, code: 'WRITE 1.', title: 'x', description: '', tags: [] }), /já está aprovado/)
  assert.equal(calls.some((c) => c[0] === 'save'), false)
})

test('the approval stands when the drive copy fails, and the failure is reported', async () => {
  const { mod } = setup({ saveFails: true })
  const result = await mod.approveCodePattern({ userId: 'user-a', clientId: 'c1', moduleId: 'm1', chatId: null, code: 'WRITE 1.', title: 'x', description: '', tags: [] })
  assert.equal(result.pattern.fileId, null)
  assert.match(result.driveError, /drive indisponível/)
})

test('empty code, missing title and oversized code are refused before any call', async () => {
  const { mod, calls } = setup()
  const base = { userId: 'user-a', clientId: 'c1', moduleId: 'm1', chatId: null, description: '', tags: [] }
  await assert.rejects(mod.approveCodePattern({ ...base, code: '  ', title: 'x' }), /Não há código/)
  await assert.rejects(mod.approveCodePattern({ ...base, code: 'WRITE 1.', title: '  ' }), /título/)
  await assert.rejects(mod.approveCodePattern({ ...base, code: 'x'.repeat(60001), title: 'x' }), /60 mil/)
  assert.equal(calls.length, 0)
})
