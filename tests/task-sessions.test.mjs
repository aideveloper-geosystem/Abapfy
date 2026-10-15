import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-typescript.mjs'

function setup({ role = null, failed = false } = {}) {
  const calls = []
  let currentUser = 'user-a'
  const auth = { getState: () => ({ user: { id: currentUser }, role }) }
  const supabase = { from(table) {
    const q = {
      update(row) { calls.push(['update', table, row]); return q },
      upsert(row) { calls.push(['upsert', table, row]); return q },
      delete() { calls.push(['delete', table]); return q },
      select() { return q },
      eq(k, v) { calls.push(['eq', table, k, v]); return q },
      single: async () => ({ data: failed ? null : { id: 'saved' }, error: failed ? new Error('denied') : null })
    }
    return q
  } }
  const mocks = { '@renderer/lib/supabaseClient': { supabase }, '@renderer/store/authStore': { useAuthStore: auth } }
  const { useTasksStore } = loadTs('src/renderer/src/store/tasksStore.ts', mocks)
  const { useEstimativaParametrosStore } = loadTs('src/renderer/src/store/estimativaParametrosStore.ts', mocks)
  useTasksStore.setState({ tasks: [{ id: 'task-a', chatId: null, subtasks: [{ id: 'sub-a', chatId: null, completed: false }] }] })
  return { tasks: useTasksStore, params: useEstimativaParametrosStore, calls, switchUser: () => { currentUser = 'user-b' } }
}
test('subtask session is scoped to user and parent, without completing the checklist', async () => {
  const { tasks, calls } = setup()
  assert.equal(await tasks.getState().linkSession('task-a', 'sub-a', 'chat-a'), true)
  const subtask = tasks.getState().tasks[0].subtasks[0]
  assert.equal(subtask.chatId, 'chat-a')
  assert.equal(subtask.completed, false)
  assert.ok(calls.some((c) => c[1] === 'task_subtasks' && c[2] === 'user_id' && c[3] === 'user-a'))
  assert.ok(calls.some((c) => c[2] === 'task_id' && c[3] === 'task-a'))
  assert.equal(tasks.getState().tasks[0].chatId, null)
})
test('failed session links preserve local state; unknown task makes no database call', async () => {
  const { tasks, calls } = setup({ failed: true })
  assert.equal(await tasks.getState().linkSession('task-a', null, 'chat-a'), false)
  assert.equal(tasks.getState().tasks[0].chatId, null)
  calls.length = 0
  assert.equal(await tasks.getState().linkSession('unknown', null, 'chat-a'), false)
  assert.equal(calls.length, 0)
})
test('normal users cannot mutate client parameters even through the store', async () => {
  const { params, calls } = setup()
  await params.getState().upsertCliente({ empresa: 'Client' })
  await params.getState().deleteCliente('client-a')
  assert.equal(calls.length, 0)
  assert.match(params.getState().error, /administradores/)
})
for (const role of ['ADMIN', 'MASTER']) {
  test(`${role} writes shared parameters without per-user ownership`, async () => {
    const { params, calls } = setup({ role })
    await params.getState().upsertCliente({ empresa: 'Client', codific: 2 })
    const call = calls.find(([kind]) => kind === 'upsert')
    assert.equal(call[1], 'cliente_parametros_compartilhados')
    assert.equal(call[2].codific, 2)
    assert.equal(Object.hasOwn(call[2], 'user_id'), false)
  })
}

test('task launch prompt retains client context and limits execution to the selected subtask', () => {
  const { buildTaskExecutionPrompt } = loadTs('src/renderer/src/lib/taskAssistant.ts', { '@renderer/lib/aiClient': {} })
  const task = { title: 'Pedidos', description: 'Integrar pedidos', sapModule: 'SD', labels: ['Entrega'], dueDate: '2026-10-30', subtasks: [{ id: 'a', title: 'Validar dados', completed: true }, { id: 'b', title: 'Gerar programa', completed: false }] }
  const prompt = buildTaskExecutionPrompt(task, 'Cliente A', task.subtasks[1])
  assert.match(prompt, /Cliente: Cliente A/)
  assert.match(prompt, /Execute somente esta subtarefa: Gerar programa/)
  assert.match(prompt, /\[x\] Validar dados/)
  assert.match(prompt, /não marque|Não marque/)
})
