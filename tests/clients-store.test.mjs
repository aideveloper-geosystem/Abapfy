import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-typescript.mjs'

function setup({ role = 'MASTER', user = { id: 'user-1' }, counts = {}, deleteResult = { data: { id: 'client-1' }, error: null }, insertError = null, workspaceId = null } = {}) {
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
          const result = { error: insertError }
          return Object.assign(Promise.resolve(result), {
            select: () => ({ single: () => Promise.resolve({ data: { id: 'new-client' }, error: insertError }) })
          })
        },
        update(row) {
          calls.push(['update', table, row])
          return query
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
    './authStore': { useAuthStore: { getState: () => ({ user, role }) } },
    './workspaceStore': {
      // MASTER stands for OWNER, ADMIN for ADMIN; anything else is a member (migration 043 matrix).
      currentClientPermissions: () => ({ canEdit: role === 'MASTER' || role === 'ADMIN', canDelete: role === 'MASTER' }),
      currentWorkspaceId: () => workspaceId
    }
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

test('creating a client sends the current workspace, and omits it before migration 041', async () => {
  const withWorkspace = setup({ workspaceId: 'ws-1' })
  await withWorkspace.store.getState().createClient('Cliente', '')
  assert.equal(withWorkspace.calls.find(([action]) => action === 'insert')[2].workspace_id, 'ws-1')
  const legacy = setup()
  await legacy.store.getState().createClient('Cliente', '')
  assert.equal('workspace_id' in legacy.calls.find(([action]) => action === 'insert')[2], false)
})

test('creating a client surfaces missing sessions and database failures', async () => {
  const missingSession = setup({ user: null })
  await assert.rejects(missingSession.store.getState().createClient('Cliente', ''), /sessão expirou/)
  assert.equal(missingSession.calls.length, 0)
  const rejected = setup({ insertError: new Error('RLS denied') })
  await assert.rejects(rejected.store.getState().createClient('Cliente', ''), /RLS denied/)
  assert.equal(rejected.calls.some(([action]) => action === 'load'), false)
})

test('the owner deletes an empty client and removes only its local modules', async () => {
  const { store, calls } = setup({ role: 'MASTER' })
  await store.getState().deleteClient('client-1')
  assert.equal(calls.filter(([action]) => action === 'delete').length, 1)
  assert.deepEqual(store.getState().clients.map(({ id }) => id), ['client-2'])
  assert.deepEqual(store.getState().modules.map(({ id }) => id), ['module-2'])
})

test('admins cannot delete clients, they archive instead', async () => {
  const { store, calls } = setup({ role: 'ADMIN' })
  await assert.rejects(store.getState().deleteClient('client-1'), /Somente o proprietário/)
  assert.equal(calls.some(([action]) => action === 'delete'), false)
  await store.getState().archiveClient({ id: 'client-1' }, true)
  const update = calls.find(([action]) => action === 'update')
  assert.equal(update[1], 'clients')
  assert.ok(update[2].archived_at)
  assert.equal(update[2].updated_by, 'user-1')
  await store.getState().archiveClient({ id: 'client-1' }, false)
  assert.equal(calls.filter(([action]) => action === 'update').at(-1)[2].archived_at, null)
})

test('members cannot create or archive clients', async () => {
  const { store, calls } = setup({ role: null })
  await assert.rejects(store.getState().createClient('Cliente', ''), /proprietários e administradores/)
  await assert.rejects(store.getState().archiveClient({ id: 'client-1' }, true), /proprietários e administradores/)
  assert.equal(calls.length, 0)
})

test('a new client can get extra modules and copy another client workbook', async () => {
  const { store, calls } = setup({ role: 'ADMIN' })
  store.setState({ clients: [{ id: 'client-1', workbookMd: '# regras' }] })
  const id = await store.getState().createClient('Novo', '', { extraModules: ['MM', ' Programas ', 'mm', ''], workbookFrom: 'client-1' })
  assert.equal(id, 'new-client')
  const inserts = calls.filter(([action]) => action === 'insert')
  assert.equal(inserts[0][2].workbook_md, '# regras')
  // default modules (Programas, EFs, DTECs) come from the database seed; only MM is extra and added once
  assert.deepEqual(inserts.slice(1).map(([, table, row]) => [table, row.name]), [['client_modules', 'MM']])
})

test('users without management permission cannot issue a delete', async () => {
  const { store, calls } = setup({ role: null })
  await assert.rejects(store.getState().deleteClient('client-1'), /Somente o proprietário/)
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
