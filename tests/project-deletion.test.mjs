import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { loadTs } from './load-typescript.mjs'
function fixture(result = { data: { id: 'p1' }, error: null }) {
  let user = { id: 'me' },
    gate
  const calls = []
  const query = {
    delete() {
      calls.push(['delete'])
      return query
    },
    eq(k, v) {
      calls.push(['eq', k, v])
      return query
    },
    select(c) {
      calls.push(['select', c])
      return query
    },
    async single() {
      if (gate) await gate
      return result
    }
  }
  const { useChatStore: store } = loadTs('src/renderer/src/store/chatStore.ts', {
    '@renderer/lib/supabaseClient': {
      supabase: {
        from(t) {
          calls.push(['from', t])
          return query
        }
      }
    },
    '@renderer/store/authStore': { useAuthStore: { getState: () => ({ user }) } }
  })
  const chat = (id, projectId) => ({
    id,
    projectId,
    title: id,
    userId: 'me',
    clientId: 'c1',
    moduleId: 'm1',
    updatedAt: '2026-10-21T12:00:00Z'
  })
  store.setState({
    projects: [{ id: 'p1' }, { id: 'p2' }],
    recentChats: [chat('c2', null)],
    projectChats: { p1: [chat('c1', 'p1')], p2: [chat('c3', 'p2')] },
    load: async () => calls.push(['refresh'])
  })
  return { store, calls, setUser: (v) => (user = v), defer: (p) => (gate = p) }
}
test('project deletion asks the server only to delete the project; detached chats stay available and unrelated projects remain', async () => {
  const f = fixture()
  await f.store.getState().deleteProject('p1')
  assert.deepEqual(f.calls, [
    ['from', 'projects'],
    ['delete'],
    ['eq', 'id', 'p1'],
    ['select', 'id'],
    ['refresh']
  ])
  const state = f.store.getState()
  assert.deepEqual(
    state.projects.map((x) => x.id),
    ['p2']
  )
  assert.equal(state.projectChats.p1, undefined)
  assert.equal(state.projectChats.p2[0].id, 'c3')
  assert.equal(state.recentChats.find((x) => x.id === 'c1').projectId, null)
  assert.equal(state.recentChats.find((x) => x.id === 'c2').id, 'c2')
})
for (const [name, result] of [
  ['denied', { data: null, error: { code: '42501', message: 'RLS denied' } }],
  ['not visible', { data: null, error: { code: 'PGRST116', message: 'not found' } }],
  ['unconfirmed', { data: null, error: null }]
])
  test(`${name} project deletion preserves local state and never refreshes as success`, async () => {
    const f = fixture(result)
    await assert.rejects(f.store.getState().deleteProject('p1'))
    assert.equal(f.store.getState().projects.length, 2)
    assert.equal(f.store.getState().projectChats.p1.length, 1)
    assert.equal(
      f.calls.some((x) => x[0] === 'refresh'),
      false
    )
  })
test('missing authentication cannot delete and an account switch cannot alter the new account state', async () => {
  const f = fixture()
  f.setUser(null)
  await assert.rejects(f.store.getState().deleteProject('p1'), /sessão expirou/)
  assert.equal(f.calls.length, 0)
  f.setUser({ id: 'me' })
  let release
  f.defer(new Promise((r) => (release = r)))
  const deleting = f.store.getState().deleteProject('p1')
  f.setUser({ id: 'other' })
  release()
  await deleting
  assert.equal(f.store.getState().projects.length, 2)
  assert.equal(
    f.calls.some((x) => x[0] === 'refresh'),
    false
  )
})
test('refresh failure after a verified deletion does not replay deletion or restore the project', async () => {
  const f = fixture()
  f.store.setState({
    load: async () => {
      throw new Error('offline')
    }
  })
  await f.store.getState().deleteProject('p1')
  assert.equal(f.store.getState().projects.length, 1)
  assert.match(f.store.getState().error, /Projeto excluído/)
  assert.equal(f.calls.filter((x) => x[0] === 'delete').length, 1)
})
test('declared foreign keys preserve chats and tasks, while project knowledge is removed with its project', () => {
  assert.match(
    fs.readFileSync('supabase/sql/005_projects_and_chats.sql', 'utf8'),
    /project_id uuid references public\.projects \(id\) on delete set null/
  )
  assert.match(
    fs.readFileSync('supabase/sql/019_advanced_kanban.sql', 'utf8'),
    /project_id uuid references public\.projects \(id\) on delete set null/
  )
  assert.match(
    fs.readFileSync('supabase/sql/017_project_knowledge.sql', 'utf8'),
    /project_id uuid not null references public\.projects \(id\) on delete cascade/
  )
})
