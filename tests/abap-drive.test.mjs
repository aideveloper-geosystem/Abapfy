import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-typescript.mjs'

function setup({ user = 'user-a', folder = true, allowed = true, insertFailure = false } = {}) {
  const rows = new Map(), blobs = new Map(), calls = []
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: user } } }) },
    rpc: async () => ({ data: allowed }),
    storage: { from: () => ({
      upload: async (path, blob, options) => {
        calls.push(['upload', path, options])
        if (blobs.has(path)) return { error: new Error('exists') }
        blobs.set(path, blob); return {}
      },
      download: async (path) => ({ data: blobs.get(path) })
    }) },
    from(table) {
      let id, inserted
      const q = {
        select() { return q },
        eq(k, value) { if (k === 'id') id = value; calls.push(['eq', table, k, value]); return q },
        maybeSingle: async () => ({ data: table === 'client_folders' ? (folder ? { id } : null) : rows.get(id) }),
        insert(row) { inserted = row; return q },
        then(resolve) {
          if (!insertFailure) rows.set(inserted.id, inserted)
          resolve({ error: insertFailure ? new Error('offline') : null })
        }
      }
      return q
    }
  }
  const api = loadTs('src/renderer/src/lib/abapDrive.ts', { './supabaseClient': { supabase } }, { Blob, TextEncoder })
  return { ...api, rows, blobs, calls }
}
const scope = { userId: 'user-a', clientId: 'client-a', moduleId: 'module-a', folderId: 'folder-a', chatId: 'chat-a', messageId: 'response-a' }
const code = '```abap\nREPORT z_orders.\nWRITE: / \'Olá\'.\n```'

test('extracts complete ABAP blocks with Unicode, safe names and deduplicates identical code', () => {
  const api = setup()
  const result = api.extractAbapArtifacts(code + '\n' + code + '\n```sql\nselect 1\n```\n```abap\nREPORT unfinished.')
  assert.equal(result.length, 1)
  assert.equal(result[0].name, 'z_orders.abap')
  assert.match(result[0].content, /Olá/)
  assert.equal(api.extractAbapArtifacts('~~~abap filename="z_test.abap"\nWRITE 1.\n~~~')[0].name, 'z_test.abap')
})
test('saves original .abap and searchable metadata in the exact client/module/folder; retry is idempotent', async () => {
  const api = setup(), artifacts = api.extractAbapArtifacts(code)
  await api.saveAbapArtifacts(scope, artifacts)
  await api.saveAbapArtifacts(scope, artifacts)
  assert.equal(api.rows.size, 1)
  assert.equal(api.calls.filter(([kind]) => kind === 'upload').length, 1)
  const row = [...api.rows.values()][0]
  assert.equal(row.folder_id, scope.folderId)
  assert.equal(row.client_id, scope.clientId)
  assert.equal(row.module_id, scope.moduleId)
  assert.match(row.storage_path, /^client-a\/module-a\/[^/]+\/original.abap$/)
  assert.equal(await api.blobs.get(row.storage_path).text(), row.content)
  await api.saveAbapArtifacts({ ...scope, folderId: 'folder-b' }, artifacts)
  assert.equal(api.rows.size, 2)
})
test('wrong user, missing folder, denied upload and cancellation never write', async () => {
  for (const options of [{ user: 'other-user' }, { folder: false }, { allowed: false }]) {
    const api = setup(options)
    await assert.rejects(api.saveAbapArtifacts(scope, api.extractAbapArtifacts(code)))
    assert.equal(api.blobs.size, 0)
  }
  const api = setup(), controller = new AbortController()
  controller.abort()
  await assert.rejects(api.saveAbapArtifacts(scope, api.extractAbapArtifacts(code), controller.signal))
  assert.equal(api.blobs.size, 0)
})
test('failed metadata insert is surfaced and preserves uploaded binary for recovery', async () => {
  const api = setup({ insertFailure: true })
  await assert.rejects(api.saveAbapArtifacts(scope, api.extractAbapArtifacts(code)), /offline/)
  assert.equal(api.rows.size, 0)
  assert.equal(api.blobs.size, 1)
})
