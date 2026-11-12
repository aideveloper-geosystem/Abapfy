import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-typescript.mjs'

const access = loadTs('src/renderer/src/lib/workspaceAccess.ts')
const themes = loadTs('src/renderer/src/lib/themes.ts')
const catalog = loadTs('src/renderer/src/lib/clientCatalog.ts')
// Objects built inside the vm context have another realm's prototypes; compare plain copies.
const plain = (value) => JSON.parse(JSON.stringify(value))

test('role matrix: owner everything, admin edits but never deletes, member reads and uploads', () => {
  const owner = access.clientPermissions('OWNER')
  const admin = access.clientPermissions('ADMIN')
  const member = access.clientPermissions('MEMBER')
  assert.deepEqual(plain([owner.canEdit, owner.canDelete, owner.canUpload, owner.canManageMembers]), [true, true, true, true])
  assert.deepEqual(plain([admin.canEdit, admin.canDelete, admin.canUpload, admin.canManageMembers]), [true, false, true, false])
  assert.deepEqual(plain([member.canEdit, member.canDelete, member.canUpload, member.canManageMembers]), [false, false, true, false])
  const outsider = access.clientPermissions(null)
  assert.deepEqual(plain([outsider.canEdit, outsider.canDelete, outsider.canUpload]), [false, false, false])
})

test('legacy platform roles map to owner, admin and member', () => {
  assert.equal(access.effectiveRole(null, 'MASTER', true), 'OWNER')
  assert.equal(access.effectiveRole(null, 'ADMIN', true), 'ADMIN')
  assert.equal(access.effectiveRole(null, null, true), 'MEMBER')
  assert.equal(access.effectiveRole('MEMBER', 'MASTER', false), 'MEMBER', 'workspace role wins once 041 is applied')
})

test('only the owner removes other people, everyone can leave', () => {
  assert.equal(access.canRemoveMember('ADMIN', 'MEMBER', false), false)
  assert.equal(access.canRemoveMember('OWNER', 'MEMBER', false), true)
  assert.equal(access.canRemoveMember('OWNER', 'ADMIN', false), true)
  assert.equal(access.canRemoveMember('OWNER', 'OWNER', false), false)
  assert.equal(access.canRemoveMember('MEMBER', 'MEMBER', true), true)
})

const clients = [
  { id: 'a', name: 'Álamo', description: 'ERP', createdBy: 'u1', archivedAt: null },
  { id: 'b', name: 'Beta', description: null, createdBy: 'u2', archivedAt: null },
  { id: 'c', name: 'Cacau', description: 'Chocolate', createdBy: 'u1', archivedAt: '2026-01-01' }
]
const stats = { a: { projects: 1, chats: 9, files: 2, lastActivity: '2026-05-01' }, b: { projects: 5, chats: 1, files: 0, lastActivity: '2026-06-01' } }
const names = { u1: 'Paulo', u2: 'Ana' }
const authorName = (id) => names[id] ?? '—'
const base = { filter: 'all', query: '', creator: null, userId: 'u1', favorites: [], authorName }

test('catalog filters: chips, creator and accent-insensitive search; archived are separate', () => {
  const ids = (options) => plain(catalog.filterClients(clients, { ...base, ...options }).map((c) => c.id))
  assert.deepEqual(ids({}), ['a', 'b'])
  assert.deepEqual(ids({ filter: 'mine' }), ['a'])
  assert.deepEqual(ids({ filter: 'favorites', favorites: ['b', 'c'] }), ['b'])
  assert.deepEqual(ids({ filter: 'archived' }), ['c'])
  assert.deepEqual(ids({ creator: 'u2' }), ['b'])
  assert.deepEqual(ids({ query: 'alamo' }), ['a'])
  assert.deepEqual(ids({ query: 'ana' }), ['b'], 'search includes the creator name')
  assert.deepEqual(ids({ query: 'zzz' }), [])
})

test('catalog sorting by column, direction toggle and favorites pinned on top', () => {
  const order = (key, dir) => plain(catalog.sortClients(clients, { key, dir }, stats, authorName).map((c) => c.id))
  assert.deepEqual(order('name', 'asc'), ['a', 'b', 'c'])
  assert.deepEqual(order('chats', 'desc'), ['a', 'b', 'c'])
  assert.deepEqual(order('projects', 'desc'), ['b', 'a', 'c'])
  assert.deepEqual(order('lastActivity', 'desc'), ['b', 'a', 'c'])
  assert.deepEqual(order('creator', 'asc'), ['b', 'a', 'c'])
  assert.deepEqual(plain(catalog.pinFavorites(clients, ['c']).map((c) => c.id)), ['c', 'a', 'b'])
  assert.deepEqual(plain(catalog.nextSort({ key: 'name', dir: 'asc' }, 'name')), { key: 'name', dir: 'desc' })
  assert.deepEqual(plain(catalog.nextSort({ key: 'name', dir: 'asc' }, 'files')), { key: 'files', dir: 'desc' })
  assert.equal(catalog.relativeActivity(null), 'Sem atividade')
  assert.equal(catalog.relativeActivity('2026-06-10T10:00:00Z', new Date('2026-06-11T12:00:00Z')), 'Ontem')
})

test('workspace admins manage clients; legacy schema falls back to platform roles', () => {
  assert.equal(access.canManageClients('OWNER', null, false), true)
  assert.equal(access.canManageClients('ADMIN', null, false), true)
  assert.equal(access.canManageClients('MEMBER', 'MASTER', false), false, 'platform role no longer grants workspace power')
  assert.equal(access.canManageClients(null, null, false), false)
  assert.equal(access.canManageClients(null, 'MASTER', true), true)
  assert.equal(access.canManageClients(null, 'ADMIN', true), true)
  assert.equal(access.canManageClients(null, null, true), false)
})

test('assignable roles and member removal mirror the database rules', () => {
  assert.deepEqual(plain(access.assignableRoles('OWNER')), ['OWNER', 'ADMIN', 'MEMBER'])
  assert.deepEqual(plain(access.assignableRoles('ADMIN')), ['MEMBER'])
  assert.deepEqual(plain(access.assignableRoles('MEMBER')), [])
  assert.equal(access.canRemoveMember('ADMIN', 'MEMBER', false), false)
  assert.equal(access.canRemoveMember('ADMIN', 'ADMIN', false), false)
  assert.equal(access.canRemoveMember('OWNER', 'ADMIN', false), true)
  assert.equal(access.canRemoveMember('OWNER', 'OWNER', false), false)
  assert.equal(access.canRemoveMember('MEMBER', 'MEMBER', false), false)
  assert.equal(access.canRemoveMember('MEMBER', 'MEMBER', true), true, 'anyone can leave')
})

test('join codes are normalized and validated', () => {
  assert.equal(access.normalizeJoinCode(' ab12-cd34 ef '), 'AB12CD34EF')
  assert.equal(access.isValidJoinCode('ab12cd34ef'), true)
  assert.equal(access.isValidJoinCode('short'), false)
  assert.equal(access.isValidJoinCode('AB12CD34EF9'), false)
})

test('database errors become Portuguese messages', () => {
  assert.match(access.workspaceErrorMessage('Invalid workspace code'), /inválido/)
  assert.match(access.workspaceErrorMessage('Workspace admin required'), /administradores/)
  assert.match(access.workspaceErrorMessage('Workspace needs at least one owner'), /proprietário/)
  assert.equal(access.workspaceErrorMessage('something else'), 'something else')
  assert.match(access.workspaceErrorMessage(null), /Não foi possível/)
})

test('only dark (default) and light themes exist, and legacy ids map by mode', () => {
  assert.deepEqual(plain(themes.THEMES.map((theme) => theme.id)), ['abapfy-dark', 'abapfy-light'])
  assert.equal(themes.DEFAULT_THEME_ID, 'abapfy-dark')
  assert.equal(themes.getTheme('sap-horizon-dark').id, 'abapfy-dark')
  assert.equal(themes.getTheme('sap-quartz-light').id, 'abapfy-light')
  assert.equal(themes.getTheme('sap-horizon-hcw').id, 'abapfy-light')
  assert.equal(themes.getTheme('unknown').id, 'abapfy-dark')
  assert.equal(themes.getTheme(null).id, 'abapfy-dark')
})

test('both themes define exactly the same tokens', () => {
  const [dark, light] = themes.THEMES
  assert.deepEqual(plain(Object.keys(dark.vars).sort()), plain(Object.keys(light.vars).sort()))
  for (const token of ['--color-sidebar', '--color-panel', '--color-hover', '--color-selected', '--color-accent-soft']) {
    assert.ok(dark.vars[token], `${token} in dark`)
    assert.ok(light.vars[token], `${token} in light`)
  }
})

function storeSetup({ rpc = {}, role = null } = {}) {
  const calls = []
  const supabase = {
    rpc(name, args) {
      calls.push([name, args])
      const result = typeof rpc[name] === 'function' ? rpc[name](args) : rpc[name]
      return Promise.resolve(result ?? { data: null, error: null })
    },
    from: (table) => ({
      update: (row) => ({ eq: (key, value) => { calls.push(['update', table, row, key, value]); return Promise.resolve({ error: null }) } })
    })
  }
  const { useWorkspaceStore, currentCanManageClients } = loadTs('src/renderer/src/store/workspaceStore.ts', {
    '@renderer/lib/supabaseClient': { supabase },
    '@renderer/lib/workspaceAccess': access,
    './authStore': { useAuthStore: Object.assign((selector) => selector({ role }), { getState: () => ({ role, user: { id: 'me' } }) }) }
  })
  return { store: useWorkspaceStore, calls, currentCanManageClients }
}

test('before migration 041 the store enters legacy mode instead of blocking the app', async () => {
  const { store, currentCanManageClients } = storeSetup({
    rpc: { my_workspace: { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.my_workspace' } } },
    role: 'ADMIN'
  })
  await store.getState().load()
  assert.equal(store.getState().status, 'ready')
  assert.equal(store.getState().legacy, true)
  assert.equal(store.getState().workspace, null)
  assert.equal(currentCanManageClients(), true, 'platform ADMIN still manages clients in legacy mode')
})

test('a user without workspace loads their own join requests', async () => {
  const { store, calls } = storeSetup({
    rpc: {
      my_workspace: { data: [], error: null },
      my_workspace_join_requests: { data: [{ id: 'r1', workspace_name: 'Geral', status: 'PENDING', created_at: '2026-01-01' }], error: null }
    }
  })
  await store.getState().load()
  assert.equal(store.getState().workspace, null)
  assert.equal(store.getState().legacy, false)
  assert.deepEqual(plain(store.getState().myRequests.map((item) => [item.workspaceName, item.status])), [['Geral', 'PENDING']])
  assert.ok(calls.some(([name]) => name === 'my_workspace_join_requests'))
})

test('an admin loads members and pending requests; code is visible to admins', async () => {
  const { store } = storeSetup({
    rpc: {
      my_workspace: { data: [{ id: 'w1', name: 'Geral', role: 'ADMIN', join_code: 'ABCDE12345' }], error: null },
      list_workspace_members: { data: [{ user_id: 'me', nome: 'Eu', cargo: null, email: 'me@x.com', role: 'ADMIN', created_at: 'x' }, { user_id: 'u2', nome: 'Ana', cargo: 'ABAP', email: 'a@x.com', role: 'MEMBER', created_at: 'x' }], error: null },
      list_workspace_join_requests: { data: [{ id: 'r9', user_id: 'u9', nome: 'Novo', email: 'n@x.com', message: 'oi', created_at: 'x' }], error: null }
    }
  })
  await store.getState().load()
  const state = store.getState()
  assert.equal(state.workspace.joinCode, 'ABCDE12345')
  assert.equal(state.members.length, 2)
  assert.equal(state.requests[0].email, 'n@x.com')
  assert.equal(store.getState().workspace.role, 'ADMIN')
})

test('creating, joining and deciding call the matching RPCs and surface errors in Portuguese', async () => {
  const { store, calls } = storeSetup({
    rpc: {
      my_workspace: { data: [], error: null },
      request_workspace_join: (args) =>
        args.p_code === 'BADCODE0000' ? { data: null, error: { message: 'Invalid workspace code' } } : { data: [{ request_id: 'r', workspace_name: 'Geral' }], error: null }
    }
  })
  assert.equal(await store.getState().requestJoin('bad-code-0000', ''), false)
  assert.match(store.getState().error, /inválido/)
  assert.equal(await store.getState().requestJoin('ab12cd34ef', ' quero entrar '), true)
  const join = calls.filter(([name]) => name === 'request_workspace_join').at(-1)
  assert.deepEqual(plain(join[1]), { p_code: 'AB12CD34EF', p_message: 'quero entrar' })
  await store.getState().createWorkspace('  Minha Consultoria ')
  assert.deepEqual(plain(calls.find(([name]) => name === 'create_workspace')[1]), { p_name: 'Minha Consultoria' })
})
