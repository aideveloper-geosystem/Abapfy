import { create } from 'zustand'
import { supabase } from '@renderer/lib/supabaseClient'
import { useAuthStore } from '@renderer/store/authStore'

export type TaskStatus = string
export type TaskPriority = 'low' | 'medium' | 'high'
export type TaskRecurrence = 'none' | 'daily' | 'weekly' | 'monthly'

export interface TaskColumn {
  id: string
  key: string
  name: string
  description: string | null
  color: string
  position: number
  isDone: boolean
  isBlocked: boolean
}

export interface TaskSubtask {
  id: string
  chatId: string | null
  taskId: string
  title: string
  completed: boolean
  position: number
}

export interface TaskItem {
  clientId: string | null
  moduleId: string | null
  folderId: string | null
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  dueDate: string | null
  position: number
  labels: string[]
  sapModule: string | null
  assignee: string | null
  projectId: string | null
  chatId: string | null
  estimatedHours: number | null
  actualHours: number | null
  dependencyIds: string[]
  recurrence: TaskRecurrence
  reminderAt: string | null
  subtasks: TaskSubtask[]
}

export interface TaskInput {
  clientId: string
  moduleId: string
  folderId: string
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  dueDate: string
  labels: string[]
  sapModule: string
  assignee: string
  projectId: string
  chatId: string
  estimatedHours: string
  actualHours: string
  dependencyIds: string[]
  recurrence: TaskRecurrence
  reminderAt: string
}

const DEFAULT_COLUMNS = [
  {
    key: 'todo',
    name: 'A fazer',
    description: 'Trabalhos planejados',
    color: '#5b738b',
    position: 1000,
    is_done: false,
    is_blocked: false
  },
  {
    key: 'in_progress',
    name: 'Em andamento',
    description: 'Execução atual',
    color: '#0070f2',
    position: 2000,
    is_done: false,
    is_blocked: false
  },
  {
    key: 'blocked',
    name: 'Bloqueado',
    description: 'Aguardando resolução',
    color: '#e76500',
    position: 3000,
    is_done: false,
    is_blocked: true
  },
  {
    key: 'done',
    name: 'Concluído',
    description: 'Trabalhos finalizados',
    color: '#188918',
    position: 4000,
    is_done: true,
    is_blocked: false
  }
]

interface TasksState {
  loaded: boolean
  loading: boolean
  tasks: TaskItem[]
  columns: TaskColumn[]
  error: string | null
  load: () => Promise<void>
  createTask: (input: TaskInput) => Promise<TaskItem | null>
  updateTask: (id: string, input: TaskInput) => Promise<boolean>
  deleteTask: (id: string) => Promise<boolean>
  moveTask: (id: string, status: TaskStatus, beforeTaskId?: string) => Promise<void>
  addSubtask: (taskId: string, title: string) => Promise<void>
  addSubtasks: (taskId: string, titles: string[]) => Promise<void>
  toggleSubtask: (id: string, completed: boolean) => Promise<void>
  deleteSubtask: (id: string) => Promise<void>
  createColumn: (name: string, description: string, color: string) => Promise<boolean>
  updateColumn: (id: string, name: string, description: string, color: string) => Promise<boolean>
  moveColumn: (id: string, direction: -1 | 1) => Promise<void>
  deleteColumn: (id: string) => Promise<boolean>
  linkSession: (taskId: string, subtaskId: string | null, chatId: string) => Promise<boolean>
  reset: () => void
}

function currentUserId(): string | null {
  return useAuthStore.getState().user?.id ?? null
}

function mapSubtask(row: Record<string, unknown>): TaskSubtask {
  return {
    id: row.id as string,
    taskId: row.task_id as string,
    chatId: (row.chat_id as string | null) ?? null,
    title: row.title as string,
    completed: row.completed as boolean,
    position: Number(row.position)
  }
}

function mapColumn(row: Record<string, unknown>): TaskColumn {
  return {
    id: row.id as string,
    key: row.key as string,
    name: row.name as string,
    description: row.description as string | null,
    color: row.color as string,
    position: Number(row.position),
    isDone: row.is_done as boolean,
    isBlocked: row.is_blocked as boolean
  }
}

function mapTask(row: Record<string, unknown>): TaskItem {
  return {
    clientId: (row.client_id as string | null) ?? null,
    moduleId: (row.module_id as string | null) ?? null,
    folderId: (row.folder_id as string | null) ?? null,
    id: row.id as string,
    title: row.title as string,
    description: row.description as string | null,
    status: row.status as string,
    priority: row.priority as TaskPriority,
    dueDate: row.due_date as string | null,
    position: Number(row.position),
    labels: (row.labels as string[] | null) ?? [],
    sapModule: row.sap_module as string | null,
    assignee: row.assignee as string | null,
    projectId: row.project_id as string | null,
    chatId: row.chat_id as string | null,
    estimatedHours: row.estimated_hours == null ? null : Number(row.estimated_hours),
    actualHours: row.actual_hours == null ? null : Number(row.actual_hours),
    dependencyIds: (row.dependency_ids as string[] | null) ?? [],
    recurrence: (row.recurrence as TaskRecurrence | null) ?? 'none',
    reminderAt: row.reminder_at as string | null,
    subtasks: ((row.task_subtasks as Record<string, unknown>[] | null) ?? [])
      .map(mapSubtask)
      .sort((a, b) => a.position - b.position)
  }
}

function numericOrNull(value: string): number | null {
  const parsed = Number(value.replace(',', '.'))
  return value.trim() && Number.isFinite(parsed) ? Math.max(0, parsed) : null
}

function taskPatch(input: TaskInput): Record<string, unknown> {
  return {
    client_id: input.clientId || null,
    module_id: input.moduleId || null,
    folder_id: input.folderId || null,
    title: input.title.trim(),
    description: input.description.trim() || null,
    status: input.status,
    priority: input.priority,
    due_date: input.dueDate || null,
    labels: input.labels,
    sap_module: input.sapModule.trim().toUpperCase() || null,
    assignee: input.assignee.trim() || null,
    project_id: input.projectId || null,
    chat_id: input.chatId || null,
    estimated_hours: numericOrNull(input.estimatedHours),
    actual_hours: numericOrNull(input.actualHours),
    dependency_ids: input.dependencyIds,
    recurrence: input.recurrence,
    reminder_at: input.reminderAt ? new Date(input.reminderAt).toISOString() : null
  }
}

function nextRecurringDate(date: string | null, recurrence: TaskRecurrence): string | null {
  if (!date || recurrence === 'none') return date
  const next = new Date(`${date}T12:00:00Z`)
  if (recurrence === 'daily') next.setUTCDate(next.getUTCDate() + 1)
  if (recurrence === 'weekly') next.setUTCDate(next.getUTCDate() + 7)
  if (recurrence === 'monthly') next.setUTCMonth(next.getUTCMonth() + 1)
  return next.toISOString().slice(0, 10)
}

export const useTasksStore = create<TasksState>((set, get) => ({
  loaded: false,
  loading: false,
  tasks: [],
  columns: [],
  error: null,

  load: async () => {
    const userId = currentUserId()
    if (!userId) return
    set({ loading: true, error: null })
    const columnsResult = await supabase
      .from('task_columns')
      .select('*')
      .eq('user_id', userId)
      .order('position')
    if (currentUserId() !== userId) return
    let columnRows = columnsResult.data
    if (columnsResult.error) {
      set({
        loaded: true,
        loading: false,
        error: 'O Kanban avançado ainda não está disponível. Aplique a migration 019.'
      })
      return
    }
    if (!columnRows?.length) {
      await supabase.from('task_columns').upsert(
        DEFAULT_COLUMNS.map((column) => ({ ...column, user_id: userId })),
        { onConflict: 'user_id,key' }
      )
      const result = await supabase
        .from('task_columns')
        .select('*')
        .eq('user_id', userId)
        .order('position')
      columnRows = result.data
    }
    const { data, error } = await supabase
      .from('tasks')
      .select('*, task_subtasks(*)')
      .eq('user_id', userId)
      .order('position')
    if (currentUserId() !== userId) return
    if (error) {
      set({
        loaded: true,
        loading: false,
        error: 'Não foi possível carregar as tarefas. Aplique a migration 019.'
      })
      return
    }
    set({
      loaded: true,
      loading: false,
      columns: (columnRows ?? []).map(mapColumn),
      tasks: (data ?? []).map((row) => mapTask(row as Record<string, unknown>))
    })
  },

  createTask: async (input) => {
    const userId = currentUserId()
    if (!userId) return null
    const maxPosition = Math.max(
      0,
      ...get()
        .tasks.filter((task) => task.status === input.status)
        .map((task) => task.position)
    )
    const { data, error } = await supabase
      .from('tasks')
      .insert({ user_id: userId, ...taskPatch(input), position: maxPosition + 1000 })
      .select('*')
      .single()
    if (currentUserId() !== userId || error || !data) return null
    const task = mapTask({ ...data, task_subtasks: [] })
    set((state) => ({ tasks: [...state.tasks, task] }))
    return task
  },

  updateTask: async (id, input) => {
    const userId = currentUserId()
    if (!userId) return false
    const current = get().tasks.find((task) => task.id === id)
    if (!current) return false
    const moved = current.status !== input.status
    const position = moved
      ? Math.max(
          0,
          ...get()
            .tasks.filter((task) => task.status === input.status && task.id !== id)
            .map((task) => task.position)
        ) + 1000
      : current.position
    const patch = { ...taskPatch(input), position }
    const { error } = await supabase.from('tasks').update(patch).eq('id', id).eq('user_id', userId)
    if (currentUserId() !== userId || error) return false
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === id
          ? {
              ...task,
              clientId: input.clientId || null,
              moduleId: input.moduleId || null,
              folderId: input.folderId || null,
              title: input.title.trim(),
              description: input.description.trim() || null,
              status: input.status,
              priority: input.priority,
              dueDate: input.dueDate || null,
              position,
              labels: input.labels,
              sapModule: input.sapModule.trim().toUpperCase() || null,
              assignee: input.assignee.trim() || null,
              projectId: input.projectId || null,
              chatId: input.chatId || null,
              estimatedHours: numericOrNull(input.estimatedHours),
              actualHours: numericOrNull(input.actualHours),
              dependencyIds: input.dependencyIds,
              recurrence: input.recurrence,
              reminderAt: input.reminderAt ? new Date(input.reminderAt).toISOString() : null
            }
          : task
      )
    }))
    const target = get().columns.find((column) => column.key === input.status)
    const previous = get().columns.find((column) => column.key === current.status)
    if (target?.isDone && !previous?.isDone && input.recurrence !== 'none') {
      const todo =
        get().columns.find((column) => !column.isDone && !column.isBlocked) ?? get().columns[0]
      const next = await get().createTask({
        ...input,
        status: todo.key,
        chatId: '',
        dueDate: nextRecurringDate(input.dueDate || null, input.recurrence) ?? '',
        actualHours: '0',
        reminderAt: ''
      })
      if (next && current.subtasks.length)
        await get().addSubtasks(
          next.id,
          current.subtasks.map((item) => item.title)
        )
    }
    return true
  },

  deleteTask: async (id) => {
    const userId = currentUserId()
    if (!userId) return false
    const { error } = await supabase.from('tasks').delete().eq('id', id).eq('user_id', userId)
    if (error) return false
    set((state) => ({ tasks: state.tasks.filter((task) => task.id !== id) }))
    return true
  },

  moveTask: async (id, status, beforeTaskId) => {
    const userId = currentUserId()
    if (!userId) return
    const moving = get().tasks.find((task) => task.id === id)
    if (!moving) return
    const target = get()
      .tasks.filter((task) => task.status === status && task.id !== id)
      .sort((a, b) => a.position - b.position)
    const index = beforeTaskId ? target.findIndex((task) => task.id === beforeTaskId) : -1
    target.splice(index >= 0 ? index : target.length, 0, { ...moving, status })
    const positions = target.map((task, position) => ({
      id: task.id,
      position: (position + 1) * 1000
    }))
    set((state) => ({
      tasks: state.tasks.map((task) => {
        const next = positions.find((item) => item.id === task.id)
        return next
          ? { ...task, status: task.id === id ? status : task.status, position: next.position }
          : task
      })
    }))
    await Promise.all(
      positions.map((item) =>
        supabase
          .from('tasks')
          .update({ position: item.position, ...(item.id === id ? { status } : {}) })
          .eq('id', item.id)
          .eq('user_id', userId)
      )
    )
    const targetColumn = get().columns.find((column) => column.key === status)
    const previousColumn = get().columns.find((column) => column.key === moving.status)
    if (targetColumn?.isDone && !previousColumn?.isDone && moving.recurrence !== 'none') {
      const todo =
        get().columns.find((column) => !column.isDone && !column.isBlocked) ?? get().columns[0]
      const next = await get().createTask({
        clientId: moving.clientId ?? '',
        moduleId: moving.moduleId ?? '',
        folderId: moving.folderId ?? '',
        title: moving.title,
        description: moving.description ?? '',
        status: todo.key,
        priority: moving.priority,
        dueDate: nextRecurringDate(moving.dueDate, moving.recurrence) ?? '',
        labels: moving.labels,
        sapModule: moving.sapModule ?? '',
        assignee: moving.assignee ?? '',
        projectId: moving.projectId ?? '',
        chatId: '',
        estimatedHours: moving.estimatedHours?.toString() ?? '',
        actualHours: '0',
        dependencyIds: moving.dependencyIds,
        recurrence: moving.recurrence,
        reminderAt: ''
      })
      if (next && moving.subtasks.length)
        await get().addSubtasks(
          next.id,
          moving.subtasks.map((item) => item.title)
        )
    }
  },

  addSubtask: async (taskId, title) => get().addSubtasks(taskId, [title]),
  addSubtasks: async (taskId, titles) => {
    const userId = currentUserId()
    if (!userId || !titles.length) return
    const task = get().tasks.find((item) => item.id === taskId)
    if (!task) return
    const start = Math.max(0, ...task.subtasks.map((item) => item.position))
    const { data } = await supabase
      .from('task_subtasks')
      .insert(
        titles.map((title, index) => ({
          task_id: taskId,
          user_id: userId,
          title: title.trim(),
          position: start + (index + 1) * 1000
        }))
      )
      .select('*')
    if (currentUserId() !== userId || !data) return
    set((state) => ({
      tasks: state.tasks.map((item) =>
        item.id === taskId
          ? { ...item, subtasks: [...item.subtasks, ...data.map((row) => mapSubtask(row))] }
          : item
      )
    }))
  },
  toggleSubtask: async (id, completed) => {
    const userId = currentUserId()
    if (!userId) return
    const { error } = await supabase
      .from('task_subtasks')
      .update({ completed })
      .eq('id', id)
      .eq('user_id', userId)
    if (currentUserId() === userId && !error)
      set((state) => ({
        tasks: state.tasks.map((task) => ({
          ...task,
          subtasks: task.subtasks.map((item) => (item.id === id ? { ...item, completed } : item))
        }))
      }))
  },
  deleteSubtask: async (id) => {
    const userId = currentUserId()
    if (!userId) return
    const { error } = await supabase
      .from('task_subtasks')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    if (!error)
      set((state) => ({
        tasks: state.tasks.map((task) => ({
          ...task,
          subtasks: task.subtasks.filter((item) => item.id !== id)
        }))
      }))
  },

  createColumn: async (name, description, color) => {
    const userId = currentUserId()
    if (!userId) return false
    const key = `custom_${Date.now().toString(36)}`
    const position = Math.max(0, ...get().columns.map((column) => column.position)) + 1000
    const { data, error } = await supabase
      .from('task_columns')
      .insert({
        user_id: userId,
        key,
        name: name.trim(),
        description: description.trim() || null,
        color,
        position
      })
      .select('*')
      .single()
    if (currentUserId() !== userId || error || !data) return false
    set((state) => ({ columns: [...state.columns, mapColumn(data)] }))
    return true
  },
  updateColumn: async (id, name, description, color) => {
    const userId = currentUserId()
    if (!userId) return false
    const { error } = await supabase
      .from('task_columns')
      .update({ name: name.trim(), description: description.trim() || null, color })
      .eq('id', id)
      .eq('user_id', userId)
    if (error) return false
    set((state) => ({
      columns: state.columns.map((column) =>
        column.id === id
          ? { ...column, name: name.trim(), description: description.trim() || null, color }
          : column
      )
    }))
    return true
  },
  moveColumn: async (id, direction) => {
    const userId = currentUserId()
    if (!userId) return
    const ordered = [...get().columns].sort((a, b) => a.position - b.position)
    const currentIndex = ordered.findIndex((column) => column.id === id)
    const targetIndex = currentIndex + direction
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length) return
    const [moving] = ordered.splice(currentIndex, 1)
    ordered.splice(targetIndex, 0, moving)
    const positions = ordered.map((column, index) => ({
      id: column.id,
      position: (index + 1) * 1000
    }))
    set((state) => ({
      columns: state.columns
        .map((column) => ({
          ...column,
          position: positions.find((item) => item.id === column.id)?.position ?? column.position
        }))
        .sort((a, b) => a.position - b.position)
    }))
    await Promise.all(
      positions.map((item) =>
        supabase
          .from('task_columns')
          .update({ position: item.position })
          .eq('id', item.id)
          .eq('user_id', userId)
      )
    )
  },
  deleteColumn: async (id) => {
    const userId = currentUserId()
    if (!userId) return false
    const column = get().columns.find((item) => item.id === id)
    if (
      !column ||
      get().tasks.some((task) => task.status === column.key) ||
      get().columns.length <= 1
    )
      return false
    const { error } = await supabase
      .from('task_columns')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    if (error) return false
    set((state) => ({ columns: state.columns.filter((item) => item.id !== id) }))
    return true
  },
  linkSession: async (taskId, subtaskId, chatId) => {
    const userId = currentUserId()
    if (!userId || !get().tasks.some((task) => task.id === taskId)) return false
    const result = subtaskId
      ? await supabase.from('task_subtasks').update({ chat_id: chatId }).eq('id', subtaskId).eq('task_id', taskId).eq('user_id', userId).select('id').single()
      : await supabase.from('tasks').update({ chat_id: chatId }).eq('id', taskId).eq('user_id', userId).select('id').single()
    if (result.error || !result.data) { set({ error: 'Não foi possível vincular a sessão à tarefa.' }); return false }
    if (currentUserId() !== userId) return false
    set((state) => ({ tasks: state.tasks.map((task) => task.id !== taskId ? task : subtaskId
      ? { ...task, subtasks: task.subtasks.map((subtask) => subtask.id === subtaskId ? { ...subtask, chatId } : subtask) }
      : { ...task, chatId }) }))
    return true
  },
  reset: () => set({ loaded: false, loading: false, tasks: [], columns: [], error: null })
}))
