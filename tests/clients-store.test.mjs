import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-typescript.mjs'

function setup({ role = 'MASTER', user = { id: 'user-1' }, counts = {}, deleteResult = { data: { id: 'client-1' }, error: null }, insertError = null } = {}) {
  const calls = []
  const supabase = {
    from(table) {
      const query = {
        select(columns, options) {
          calls.push(['select', table, columns, options])
          return query
        },
        eq(column, value) {
          calls.push(['eq', table, column, value])
          return query
        },
        insert(row) {
          calls.push(['insert', table, row])
          return Promise.resolve({ error: insertError })
        },
        delete() {
          calls.push(['delete', table])
          return query
        },
        single() { return Promise.resolve(deleteResult) },
        then(resolve, reject) {
          return Promise.resolve({ count: counts[table] ?? 0, error: null }).then(resolve, reject)
        }
      }
      return query
    }
  }
  const { useClientsStore } = loadTs('src/renderer/src/store/clientsStore.ts', {
    '@renderer/lib/supabaseClient': { supabase },
    './authStore': { useAuthStore: { getState: () => ({ user, role }) } }
  })
  useClientsStore.setState({
    clients: [{ id: 'client-1' }, { id: 'client-2' }],
    modules: [{ id: 'module-1', clientId: 'client-1' }, { id: 'module-2', clientId: 'client-2' }],
    load: async () => calls.push(['load'])
  })
  return { store: useClientsStore, calls }
}

test('creating a client trims input, supplies the authenticated author and reloads', async () => {
  const { store, calls } = setup()
  await store.getState().createClient('  Cliente  ', '  Descrição  ')
  const row = calls.find(([action]) => action === 'insert')[2]
  assert.equal(row.name, 'Cliente')
  assert.equal(row.description, 'Descrição')
  assert.equal(row.created_by, 'user-1')
  assert.equal(row.updated_by, 'user-1')
  assert.equal(calls.at(-1)[0], 'load')
})

test('creating a client surfaces missing sessions and database failures', async () => {
  const missingSession = setup({ user: null })
  await assert.rejects(missingSession.store.getState().createClient('Cliente', ''), /sessão expirou/)
  assert.equal(missingSession.calls.length, 0)
  const rejected = setup({ insertError: new Error('RLS denied') })
  await assert.rejects(rejected.store.getState().createClient('Cliente', ''), /RLS denied/)
  assert.equal(rejected.calls.some(([action]) => action === 'load'), false)
})

for (const role of ['MASTER', 'ADMIN']) {
  test(`${role} deletes an empty client and removes only its local modules`, async () => {
    const { store, calls } = setup({ role })
    await store.getState().deleteClient('client-1')
    assert.equal(calls.filter(([action]) => action === 'delete').length, 1)
    assert.deepEqual(store.getState().clients.map(({ id }) => id), ['client-2'])
    assert.deepEqual(store.getState().modules.map(({ id }) => id), ['module-2'])
  })
}

test('users without management permission cannot issue a delete', async () => {
  const { store, calls } = setup({ role: null })
  await assert.rejects(store.getState().deleteClient('client-1'), /MASTER ou ADMIN/)
  assert.equal(calls.length, 0)
})

for (const table of ['client_files', 'chats', 'projects']) {
  test(`linked ${table} block deletion, preserving local state`, async () => {
    const { store, calls } = setup({ counts: { [table]: 1 } })
    await assert.rejects(store.getState().deleteClient('client-1'), /conteúdo/)
    assert.equal(calls.some(([action]) => action === 'delete'), false)
    assert.equal(store.getState().clients.length, 2)
  })
}

test('a database denial preserves the client instead of reporting success', async () => {
  const { store } = setup({ deleteResult: { data: null, error: new Error('RLS denied') } })
  await assert.rejects(store.getState().deleteClient('client-1'), /RLS denied/)
  assert.equal(store.getState().clients.length, 2)
})

test('concurrent content detected by a foreign key produces an actionable error', async () => {
  const { store } = setup({ deleteResult: { data: null, error: { code: '23503' } } })
  await assert.rejects(store.getState().deleteClient('client-1'), /conteúdo vinculado/)
  assert.equal(store.getState().clients.length, 2)
})
