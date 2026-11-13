import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-typescript.mjs'

function setup({ claim = true } = {}) {
  const calls = []
  const rpcs = []
  const supabase = {
    rpc: async (name, args) => {
      rpcs.push([name, args])
      return { data: name === 'claim_task' ? claim : true, error: null }
    },
    from(table) {
      const q = {
        insert(row) { calls.push(['insert', table, row]); return q },
        update(row) { calls.push(['update', table, row]); return q },
        delete() { calls.push(['delete', table]); return q },
        select() { return q },
        eq(k, v) { calls.push(['eq', table, k, v]); return q },
        single: async () => ({ data: { id: 'new', title: 't', status: 'todo', priority: 'medium', position: 1000 }, error: null }),
        then(resolve) { resolve({ data: [], error: null }) }
      }
      return q
    }
  }
  const auth = { getState: () => ({ user: { id: 'user-a' } }) }
  const { useTasksStore } = loadTs('src/renderer/src/store/tasksStore.ts', {
    '@renderer/lib/supabaseClient': { supabase },
    '@renderer/store/authStore': { useAuthStore: auth }
  })
  const input = (over = {}) => ({
    assigneeId: 'user-b', clientId: '', moduleId: '', folderId: '', title: 'Tarefa', description: '', status: 'todo',
    priority: 'medium', dueDate: '', labels: [], sapModule: '', assignee: 'texto livre', projectId: '', chatId: '',
    estimatedHours: '', actualHours: '', dependencyIds: [], recurrence: 'none', reminderAt: '', ...over
  })
  const base = { id: 'task-a', boardId: null, assigneeId: null, assignedAt: null, status: 'todo', position: 1000, subtasks: [{ id: 'sub-a', completed: false }], recurrence: 'none' }
  return { store: useTasksStore, calls, rpcs, input, base }
}

test('shared board creates tasks on the board with a person as assignee', async () => {
  const { store, calls, input } = setup()
  store.setState({ activeBoardId: 'board-1', tasks: [], columns: [] })
  await store.getState().createTask(input())
  const insert = calls.find((c) => c[0] === 'insert' && c[1] === 'tasks')[2]
  assert.equal(insert.board_id, 'board-1')
  assert.equal(insert.assignee_id, 'user-b')
  assert.equal('assignee' in insert, false)
})

test('personal board keeps the free-text assignee and never sends board fields', async () => {
  const { store, calls, input } = setup()
  store.setState({ activeBoardId: null, tasks: [], columns: [] })
  await store.getState().createTask(input())
  const insert = calls.find((c) => c[0] === 'insert' && c[1] === 'tasks')[2]
  assert.equal(insert.assignee, 'texto livre')
  assert.equal('assignee_id' in insert, false)
  assert.equal('board_id' in insert, false)
})

test('shared mutations rely on board membership; personal ones stay scoped to the owner', async () => {
  const { store, calls, base } = setup()
  store.setState({ activeBoardId: 'board-1', tasks: [{ ...base, boardId: 'board-1' }], columns: [] })
  await store.getState().toggleSubtask('sub-a', true)
  await store.getState().deleteTask('task-a')
  assert.equal(calls.some((c) => c[0] === 'eq' && c[2] === 'user_id'), false)
  calls.length = 0
  store.setState({ activeBoardId: null, tasks: [{ ...base }], columns: [] })
  await store.getState().toggleSubtask('sub-a', true)
  assert.ok(calls.some((c) => c[0] === 'eq' && c[2] === 'user_id' && c[3] === 'user-a'))
})

test('claiming is atomic: the loser keeps the task unassigned and sees why', async () => {
  const won = setup({ claim: true })
  won.store.setState({ activeBoardId: 'board-1', tasks: [{ ...won.base, boardId: 'board-1' }], error: null })
  assert.equal(await won.store.getState().claimTask('task-a'), true)
  assert.equal(won.store.getState().tasks[0].assigneeId, 'user-a')
  assert.equal(JSON.stringify(won.rpcs[0]), JSON.stringify(['claim_task', { p_task: 'task-a' }]))

  const lost = setup({ claim: false })
  lost.store.setState({ activeBoardId: 'board-1', tasks: [{ ...lost.base, boardId: 'board-1' }], error: null })
  assert.equal(await lost.store.getState().claimTask('task-a'), false)
  assert.equal(lost.store.getState().tasks[0].assigneeId, null)
  assert.match(lost.store.getState().error, /Outra pessoa assumiu/)
})

test('claiming and releasing do nothing on the personal board', async () => {
  const { store, rpcs, base } = setup()
  store.setState({ activeBoardId: null, tasks: [{ ...base }] })
  assert.equal(await store.getState().claimTask('task-a'), false)
  assert.equal(await store.getState().releaseTask('task-a'), false)
  assert.equal(rpcs.length, 0)
})

test('removing a member unassigns their tasks locally; leaving drops the board', async () => {
  const { store, base } = setup()
  store.setState({
    activeBoardId: 'board-1',
    boards: [{ id: 'board-1', memberIds: ['user-a', 'user-b'] }],
    tasks: [{ ...base, boardId: 'board-1', assigneeId: 'user-b' }]
  })
  assert.equal(await store.getState().removeBoardMember('board-1', 'user-b'), true)
  assert.equal(JSON.stringify(store.getState().boards[0].memberIds), JSON.stringify(['user-a']))
  assert.equal(store.getState().tasks[0].assigneeId, null)
})

test('moving a personal task to a board calls the RPC, drops it locally and clears dependencies on it', async () => {
  const { store, rpcs, base } = setup()
  store.setState({
    activeBoardId: null,
    tasks: [{ ...base }, { ...base, id: 'task-b', dependencyIds: ['task-a', 'task-z'] }],
    error: null
  })
  assert.equal(await store.getState().moveTaskToBoard('task-a', 'board-1'), true)
  assert.equal(JSON.stringify(rpcs[0]), JSON.stringify(['move_task_to_board', { p_task: 'task-a', p_board: 'board-1' }]))
  assert.equal(store.getState().tasks.length, 1)
  assert.equal(JSON.stringify(store.getState().tasks[0].dependencyIds), JSON.stringify(['task-z']))
})

test('moving is refused from a shared board or for a task already shared', async () => {
  const { store, rpcs, base } = setup()
  store.setState({ activeBoardId: 'board-1', tasks: [{ ...base, boardId: 'board-1' }] })
  assert.equal(await store.getState().moveTaskToBoard('task-a', 'board-2'), false)
  store.setState({ activeBoardId: null, tasks: [{ ...base, boardId: 'board-1' }] })
  assert.equal(await store.getState().moveTaskToBoard('task-a', 'board-2'), false)
  assert.equal(rpcs.length, 0)
})
