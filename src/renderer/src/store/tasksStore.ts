import { create } from 'zustand'
import type { RealtimeChannel } from '@supabase/supabase-js'
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

/** A shared board (migration 044). The personal board is represented by `activeBoardId === null`. */
export interface TaskBoard {
  id: string
  workspaceId: string
  clientId: string | null
  projectId: string | null
  name: string
  description: string | null
  createdBy: string
  memberIds: string[]
}

export type TaskEventType = 'created' | 'moved' | 'assigned' | 'updated' | 'subtask' | 'deleted'

export interface TaskEvent {
  id: string
  boardId: string
  taskId: string | null
  taskTitle: string
  actorId: string | null
  type: TaskEventType
  data: Record<string, unknown>
  createdAt: string
}

export interface TaskComment {
  id: string
  taskId: string
  authorId: string
  body: string
  createdAt: string
}

export interface TaskPresence {
  userId: string
  name: string
  taskId: string | null
}

export interface TaskItem {
  boardId: string | null
  assigneeId: string | null
  assignedAt: string | null
  createdBy: string | null
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
  assigneeId: string
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

const ACTIVE_BOARD_KEY = 'abapfy-active-task-board'

interface TasksState {
  loaded: boolean
  loading: boolean
  tasks: TaskItem[]
  columns: TaskColumn[]
  boards: TaskBoard[]
  /** null = personal board. */
  activeBoardId: string | null
  boardEvents: TaskEvent[]
  taskActivity: { taskId: string; comments: TaskComment[]; events: TaskEvent[] } | null
  presence: TaskPresence[]
  error: string | null
  load: () => Promise<void>
  setActiveBoard: (boardId: string | null) => Promise<void>
  createBoard: (input: {
    name: string
    clientId: string
    projectId: string
    memberIds: string[]
  }) => Promise<string | null>
  renameBoard: (id: string, name: string, description: string) => Promise<boolean>
  deleteBoard: (id: string) => Promise<boolean>
  addBoardMember: (boardId: string, userId: string) => Promise<boolean>
  removeBoardMember: (boardId: string, userId: string) => Promise<boolean>
  moveTaskToBoard: (taskId: string, boardId: string) => Promise<boolean>
  claimTask: (id: string) => Promise<boolean>
  releaseTask: (id: string) => Promise<boolean>
  loadTaskActivity: (taskId: string) => Promise<void>
  clearTaskActivity: () => void
  addComment: (taskId: string, body: string) => Promise<boolean>
  deleteComment: (id: string) => Promise<boolean>
  startRealtime: (self: { id: string; name: string }) => void
  stopRealtime: () => void
  trackPresence: (taskId: string | null) => void
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

function storedBoardId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_BOARD_KEY) || null
  } catch {
    return null
  }
}

function rememberBoardId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_BOARD_KEY, id)
    else localStorage.removeItem(ACTIVE_BOARD_KEY)
  } catch {
    /* storage unavailable */
  }
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
    boardId: (row.board_id as string | null) ?? null,
    assigneeId: (row.assignee_id as string | null) ?? null,
    assignedAt: (row.assigned_at as string | null) ?? null,
    createdBy: (row.created_by as string | null) ?? null,
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

function mapBoard(row: Record<string, unknown>): TaskBoard {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    clientId: (row.client_id as string | null) ?? null,
    projectId: (row.project_id as string | null) ?? null,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    createdBy: row.created_by as string,
    memberIds: ((row.task_board_members as { user_id: string }[] | null) ?? []).map(
      (member) => member.user_id
    )
  }
}

function mapEvent(row: Record<string, unknown>): TaskEvent {
  return {
    id: row.id as string,
    boardId: row.board_id as string,
    taskId: (row.task_id as string | null) ?? null,
    taskTitle: row.task_title as string,
    actorId: (row.actor_id as string | null) ?? null,
    type: row.type as TaskEventType,
    data: (row.data as Record<string, unknown> | null) ?? {},
    createdAt: row.created_at as string
  }
}

function mapComment(row: Record<string, unknown>): TaskComment {
  return {
    id: row.id as string,
    taskId: row.task_id as string,
    authorId: row.author_id as string,
    body: row.body as string,
    createdAt: row.created_at as string
  }
}

function numericOrNull(value: string): number | null {
  const parsed = Number(value.replace(',', '.'))
  return value.trim() && Number.isFinite(parsed) ? Math.max(0, parsed) : null
}

/** Shared boards assign a person (`assignee_id`); the personal board keeps the free-text field. */
function taskPatch(input: TaskInput, shared: boolean): Record<string, unknown> {
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
    ...(shared
      ? { assignee_id: input.assigneeId || null }
      : { assignee: input.assignee.trim() || null }),
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

/** Narrow a mutation to the rows the current user may touch on the active board. */
function ownedBy<T extends { eq: (column: string, value: string) => T }>(
  query: T,
  userId: string,
  boardId: string | null
): T {
  // Personal rows are owner-only; shared rows are guarded by board membership in RLS.
  return boardId ? query : query.eq('user_id', userId)
}

let channel: RealtimeChannel | null = null
let presenceChannel: RealtimeChannel | null = null
let presenceSelf: { id: string; name: string } | null = null
let presenceTask: string | null = null
let boardsTimer: ReturnType<typeof setTimeout> | null = null

function inScope(row: Record<string, unknown>, boardId: string | null, userId: string | null): boolean {
  const rowBoard = (row.board_id as string | null | undefined) ?? null
  return boardId ? rowBoard === boardId : rowBoard === null && row.user_id === userId
}

function applyTaskRow(tasks: TaskItem[], row: Record<string, unknown>): TaskItem[] {
  const incoming = mapTask({ ...row, task_subtasks: [] })
  const existing = tasks.find((task) => task.id === incoming.id)
  if (!existing) return [...tasks, incoming]
  return tasks.map((task) =>
    task.id === incoming.id ? { ...incoming, subtasks: existing.subtasks } : task
  )
}

export const useTasksStore = create<TasksState>((set, get) => ({
  loaded: false,
  loading: false,
  tasks: [],
  columns: [],
  boards: [],
  activeBoardId: storedBoardId(),
  boardEvents: [],
  taskActivity: null,
  presence: [],
  error: null,

  load: async () => {
    const userId = currentUserId()
    if (!userId) return
    set({ loading: true, error: null })

    // Shared boards are optional: without migration 044 the personal board keeps working.
    const boardsResult = await supabase
      .from('task_boards')
      .select('*, task_board_members(user_id)')
      .order('created_at')
    if (currentUserId() !== userId) return
    const boards = boardsResult.error
      ? []
      : (boardsResult.data ?? []).map((row) => mapBoard(row as Record<string, unknown>))
    const stored = get().activeBoardId
    const activeBoardId = stored && boards.some((board) => board.id === stored) ? stored : null
    if (activeBoardId !== stored) rememberBoardId(activeBoardId)
    set({ boards, activeBoardId })

    const shared = Boolean(activeBoardId)
    const columnsQuery = supabase.from('task_columns').select('*')
    const columnsResult = await (shared
      ? columnsQuery.eq('board_id', activeBoardId as string)
      : columnsQuery.eq('user_id', userId).is('board_id', null)
    ).order('position')
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
    if (!columnRows?.length && !shared) {
      await supabase.from('task_columns').upsert(
        DEFAULT_COLUMNS.map((column) => ({ ...column, user_id: userId })),
        { onConflict: 'user_id,key' }
      )
      const result = await supabase
        .from('task_columns')
        .select('*')
        .eq('user_id', userId)
        .is('board_id', null)
        .order('position')
      columnRows = result.data
    }
    const tasksQuery = supabase.from('tasks').select('*, task_subtasks(*)')
    const { data, error } = await (shared
      ? tasksQuery.eq('board_id', activeBoardId as string)
      : tasksQuery.eq('user_id', userId).is('board_id', null)
    ).order('position')
    if (currentUserId() !== userId) return
    if (error) {
      set({
        loaded: true,
        loading: false,
        error: 'Não foi possível carregar as tarefas. Aplique a migration 019.'
      })
      return
    }
    let boardEvents: TaskEvent[] = []
    if (shared) {
      const events = await supabase
        .from('task_events')
        .select('*')
        .eq('board_id', activeBoardId as string)
        .order('created_at', { ascending: false })
        .limit(40)
      boardEvents = (events.data ?? []).map((row) => mapEvent(row as Record<string, unknown>))
    }
    if (currentUserId() !== userId) return
    set({
      loaded: true,
      loading: false,
      columns: (columnRows ?? []).map(mapColumn),
      tasks: (data ?? []).map((row) => mapTask(row as Record<string, unknown>)),
      boardEvents,
      taskActivity: null
    })
    get().trackPresence(null)
  },

  setActiveBoard: async (boardId) => {
    if (boardId === get().activeBoardId) return
    rememberBoardId(boardId)
    set({
      activeBoardId: boardId,
      loaded: false,
      tasks: [],
      columns: [],
      boardEvents: [],
      taskActivity: null,
      presence: []
    })
    await get().load()
  },

  createBoard: async ({ name, clientId, projectId, memberIds }) => {
    const userId = currentUserId()
    if (!userId || !name.trim()) return null
    const { data, error } = await supabase.rpc('create_task_board', {
      p_name: name.trim(),
      p_client: clientId || null,
      p_project: projectId || null,
      p_members: memberIds
    })
    if (error || typeof data !== 'string') {
      set({ error: 'Não foi possível criar o quadro. Aplique a migration 044.' })
      return null
    }
    set({ loaded: false })
    rememberBoardId(data)
    set({ activeBoardId: data })
    await get().load()
    return data
  },

  renameBoard: async (id, name, description) => {
    if (!name.trim()) return false
    const { error } = await supabase
      .from('task_boards')
      .update({ name: name.trim(), description: description.trim() || null })
      .eq('id', id)
    if (error) return false
    set((state) => ({
      boards: state.boards.map((board) =>
        board.id === id
          ? { ...board, name: name.trim(), description: description.trim() || null }
          : board
      )
    }))
    return true
  },

  deleteBoard: async (id) => {
    const { error } = await supabase.from('task_boards').delete().eq('id', id)
    if (error) return false
    set((state) => ({ boards: state.boards.filter((board) => board.id !== id) }))
    if (get().activeBoardId === id) await get().setActiveBoard(null)
    return true
  },

  addBoardMember: async (boardId, userId) => {
    const { error } = await supabase
      .from('task_board_members')
      .insert({ board_id: boardId, user_id: userId, added_by: currentUserId() })
    if (error) return false
    set((state) => ({
      boards: state.boards.map((board) =>
        board.id === boardId && !board.memberIds.includes(userId)
          ? { ...board, memberIds: [...board.memberIds, userId] }
          : board
      )
    }))
    return true
  },

  removeBoardMember: async (boardId, userId) => {
    const { error } = await supabase
      .from('task_board_members')
      .delete()
      .eq('board_id', boardId)
      .eq('user_id', userId)
    if (error) return false
    if (userId === currentUserId()) {
      set((state) => ({ boards: state.boards.filter((board) => board.id !== boardId) }))
      if (get().activeBoardId === boardId) await get().setActiveBoard(null)
      return true
    }
    set((state) => ({
      boards: state.boards.map((board) =>
        board.id === boardId
          ? { ...board, memberIds: board.memberIds.filter((id) => id !== userId) }
          : board
      ),
      tasks: state.tasks.map((task) =>
        task.assigneeId === userId ? { ...task, assigneeId: null, assignedAt: null } : task
      )
    }))
    return true
  },

  moveTaskToBoard: async (taskId, boardId) => {
    const userId = currentUserId()
    const task = get().tasks.find((item) => item.id === taskId)
    if (!userId || !task || task.boardId || get().activeBoardId) return false
    const { error } = await supabase.rpc('move_task_to_board', { p_task: taskId, p_board: boardId })
    if (error) {
      set({
        error: /another (client|project)/.test(error.message)
          ? 'Esta tarefa é de outro cliente ou projeto que o do quadro escolhido.'
          : 'Não foi possível mover a tarefa para o quadro. Aplique a migration 045.'
      })
      return false
    }
    set((state) => ({
      tasks: state.tasks
        .filter((item) => item.id !== taskId)
        .map((item) => ({
          ...item,
          dependencyIds: item.dependencyIds.filter((id) => id !== taskId)
        }))
    }))
    return true
  },

  claimTask: async (id) => {
    const userId = currentUserId()
    if (!userId || !get().activeBoardId) return false
    const { data, error } = await supabase.rpc('claim_task', { p_task: id })
    if (error) {
      set({ error: 'Não foi possível assumir a tarefa.' })
      return false
    }
    if (data !== true) {
      set({ error: 'Outra pessoa assumiu esta tarefa antes de você.' })
      return false
    }
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === id
          ? { ...task, assigneeId: userId, assignedAt: new Date().toISOString() }
          : task
      )
    }))
    return true
  },

  releaseTask: async (id) => {
    const userId = currentUserId()
    if (!userId || !get().activeBoardId) return false
    const { data, error } = await supabase.rpc('release_task', { p_task: id })
    if (error || data !== true) {
      set({ error: 'Só quem assumiu a tarefa pode liberá-la.' })
      return false
    }
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === id ? { ...task, assigneeId: null, assignedAt: null } : task
      )
    }))
    return true
  },

  loadTaskActivity: async (taskId) => {
    if (!get().activeBoardId) return
    set({ taskActivity: { taskId, comments: [], events: [] } })
    const [comments, events] = await Promise.all([
      supabase.from('task_comments').select('*').eq('task_id', taskId).order('created_at'),
      supabase
        .from('task_events')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false })
        .limit(50)
    ])
    if (get().taskActivity?.taskId !== taskId) return
    set({
      taskActivity: {
        taskId,
        comments: (comments.data ?? []).map((row) => mapComment(row as Record<string, unknown>)),
        events: (events.data ?? []).map((row) => mapEvent(row as Record<string, unknown>))
      }
    })
  },

  clearTaskActivity: () => set({ taskActivity: null }),

  addComment: async (taskId, body) => {
    const userId = currentUserId()
    if (!userId || !body.trim()) return false
    const { data, error } = await supabase
      .from('task_comments')
      .insert({ task_id: taskId, author_id: userId, body: body.trim() })
      .select('*')
      .single()
    if (error || !data) return false
    const comment = mapComment(data as Record<string, unknown>)
    set((state) =>
      state.taskActivity?.taskId === taskId &&
      !state.taskActivity.comments.some((item) => item.id === comment.id)
        ? {
            taskActivity: {
              ...state.taskActivity,
              comments: [...state.taskActivity.comments, comment]
            }
          }
        : state
    )
    return true
  },

  deleteComment: async (id) => {
    const { error } = await supabase.from('task_comments').delete().eq('id', id)
    if (error) return false
    set((state) =>
      state.taskActivity
        ? {
            taskActivity: {
              ...state.taskActivity,
              comments: state.taskActivity.comments.filter((item) => item.id !== id)
            }
          }
        : state
    )
    return true
  },

  startRealtime: (self) => {
    get().stopRealtime()
    presenceSelf = self
    const boardId = get().activeBoardId
    const onRows = (_table: string, apply: (payload: RealtimePayload) => void) => apply
    const refreshBoards = (): void => {
      if (boardsTimer) clearTimeout(boardsTimer)
      boardsTimer = setTimeout(() => {
        void (async () => {
          const result = await supabase
            .from('task_boards')
            .select('*, task_board_members(user_id)')
            .order('created_at')
          if (result.error) return
          const boards = (result.data ?? []).map((row) => mapBoard(row as Record<string, unknown>))
          set({ boards })
          const active = get().activeBoardId
          if (active && !boards.some((board) => board.id === active)) await get().setActiveBoard(null)
        })()
      }, 250)
    }
    channel = supabase
      .channel(`tasks-live-${self.id}-${boardId ?? 'personal'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        onRows('tasks', (payload) => {
          const userId = currentUserId()
          if (payload.eventType === 'DELETE') {
            const id = payload.old.id as string | undefined
            if (id) set((state) => ({ tasks: state.tasks.filter((task) => task.id !== id) }))
            return
          }
          if (!inScope(payload.new, get().activeBoardId, userId)) {
            const gone = payload.new.id as string | undefined
            if (gone) set((state) => ({ tasks: state.tasks.filter((task) => task.id !== gone) }))
            return
          }
          set((state) => ({ tasks: applyTaskRow(state.tasks, payload.new) }))
        })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_subtasks' },
        onRows('task_subtasks', (payload) => {
          if (payload.eventType === 'DELETE') {
            const id = payload.old.id as string | undefined
            if (!id) return
            set((state) => ({
              tasks: state.tasks.map((task) => ({
                ...task,
                subtasks: task.subtasks.filter((item) => item.id !== id)
              }))
            }))
            return
          }
          const subtask = mapSubtask(payload.new)
          set((state) => ({
            tasks: state.tasks.map((task) => {
              if (task.id !== subtask.taskId) return task
              const exists = task.subtasks.some((item) => item.id === subtask.id)
              const subtasks = exists
                ? task.subtasks.map((item) => (item.id === subtask.id ? subtask : item))
                : [...task.subtasks, subtask]
              return { ...task, subtasks: subtasks.sort((a, b) => a.position - b.position) }
            })
          }))
        })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_columns' },
        onRows('task_columns', (payload) => {
          if (payload.eventType === 'DELETE') {
            const id = payload.old.id as string | undefined
            if (id) set((state) => ({ columns: state.columns.filter((item) => item.id !== id) }))
            return
          }
          if (!inScope(payload.new, get().activeBoardId, currentUserId())) return
          const column = mapColumn(payload.new)
          set((state) => ({
            columns: (state.columns.some((item) => item.id === column.id)
              ? state.columns.map((item) => (item.id === column.id ? column : item))
              : [...state.columns, column]
            ).sort((a, b) => a.position - b.position)
          }))
        })
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_boards' }, refreshBoards)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_board_members' },
        refreshBoards
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'task_events' },
        onRows('task_events', (payload) => {
          const active = get().activeBoardId
          if (!active || payload.new.board_id !== active) return
          const event = mapEvent(payload.new)
          set((state) => ({
            boardEvents: [event, ...state.boardEvents.filter((item) => item.id !== event.id)].slice(0, 40),
            taskActivity:
              state.taskActivity && event.taskId === state.taskActivity.taskId
                ? {
                    ...state.taskActivity,
                    events: [event, ...state.taskActivity.events.filter((item) => item.id !== event.id)]
                  }
                : state.taskActivity
          }))
        })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_comments' },
        onRows('task_comments', (payload) => {
          const activity = get().taskActivity
          if (!activity) return
          if (payload.eventType === 'DELETE') {
            const id = payload.old.id as string | undefined
            if (id)
              set({
                taskActivity: {
                  ...activity,
                  comments: activity.comments.filter((item) => item.id !== id)
                }
              })
            return
          }
          if (payload.new.task_id !== activity.taskId) return
          const comment = mapComment(payload.new)
          if (activity.comments.some((item) => item.id === comment.id)) return
          set({ taskActivity: { ...activity, comments: [...activity.comments, comment] } })
        })
      )
      .subscribe()

    if (boardId) {
      presenceChannel = supabase.channel(`task-board-presence-${boardId}`, {
        config: { presence: { key: self.id } }
      })
      presenceChannel
        .on('presence', { event: 'sync' }, () => {
          const state = presenceChannel?.presenceState<{ name: string; taskId: string | null }>() ?? {}
          set({
            presence: Object.entries(state).flatMap(([userId, metas]) => {
              const meta = metas[metas.length - 1]
              return meta ? [{ userId, name: meta.name, taskId: meta.taskId ?? null }] : []
            })
          })
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED')
            void presenceChannel?.track({ name: self.name, taskId: presenceTask })
        })
    }
  },

  stopRealtime: () => {
    if (boardsTimer) clearTimeout(boardsTimer)
    boardsTimer = null
    if (channel) void supabase.removeChannel(channel)
    if (presenceChannel) void supabase.removeChannel(presenceChannel)
    channel = null
    presenceChannel = null
    set({ presence: [] })
  },

  trackPresence: (taskId) => {
    presenceTask = taskId
    if (presenceChannel && presenceSelf)
      void presenceChannel.track({ name: presenceSelf.name, taskId })
  },

  createTask: async (input) => {
    const userId = currentUserId()
    if (!userId) return null
    const boardId = get().activeBoardId
    const maxPosition = Math.max(
      0,
      ...get()
        .tasks.filter((task) => task.status === input.status)
        .map((task) => task.position)
    )
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        user_id: userId,
        ...(boardId ? { board_id: boardId } : {}),
        ...taskPatch(input, Boolean(boardId)),
        position: maxPosition + 1000
      })
      .select('*')
      .single()
    if (currentUserId() !== userId || error || !data) return null
    const task = mapTask({ ...data, task_subtasks: [] })
    set((state) =>
      state.tasks.some((item) => item.id === task.id)
        ? state
        : { tasks: [...state.tasks, task] }
    )
    return task
  },

  updateTask: async (id, input) => {
    const userId = currentUserId()
    if (!userId) return false
    const boardId = get().activeBoardId
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
    const patch = { ...taskPatch(input, Boolean(boardId)), position }
    const { error } = await ownedBy(supabase.from('tasks').update(patch).eq('id', id), userId, boardId)
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
              assignee: boardId ? task.assignee : input.assignee.trim() || null,
              assigneeId: boardId ? input.assigneeId || null : null,
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
    const { error } = await ownedBy(
      supabase.from('tasks').delete().eq('id', id),
      userId,
      get().activeBoardId
    )
    if (error) return false
    set((state) => ({ tasks: state.tasks.filter((task) => task.id !== id) }))
    return true
  },

  moveTask: async (id, status, beforeTaskId) => {
    const userId = currentUserId()
    if (!userId) return
    const boardId = get().activeBoardId
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
        ownedBy(
          supabase
            .from('tasks')
            .update({ position: item.position, ...(item.id === id ? { status } : {}) })
            .eq('id', item.id),
          userId,
          boardId
        )
      )
    )
    const targetColumn = get().columns.find((column) => column.key === status)
    const previousColumn = get().columns.find((column) => column.key === moving.status)
    if (targetColumn?.isDone && !previousColumn?.isDone && moving.recurrence !== 'none') {
      const todo =
        get().columns.find((column) => !column.isDone && !column.isBlocked) ?? get().columns[0]
      const next = await get().createTask({
        assigneeId: moving.assigneeId ?? '',
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
      tasks: state.tasks.map((item) => {
        if (item.id !== taskId) return item
        const known = new Set(item.subtasks.map((subtask) => subtask.id))
        const added = data.map((row) => mapSubtask(row)).filter((subtask) => !known.has(subtask.id))
        return { ...item, subtasks: [...item.subtasks, ...added] }
      })
    }))
  },
  toggleSubtask: async (id, completed) => {
    const userId = currentUserId()
    if (!userId) return
    const { error } = await ownedBy(
      supabase.from('task_subtasks').update({ completed }).eq('id', id),
      userId,
      get().activeBoardId
    )
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
    const { error } = await ownedBy(
      supabase.from('task_subtasks').delete().eq('id', id),
      userId,
      get().activeBoardId
    )
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
    const boardId = get().activeBoardId
    const key = `custom_${Date.now().toString(36)}`
    const position = Math.max(0, ...get().columns.map((column) => column.position)) + 1000
    const { data, error } = await supabase
      .from('task_columns')
      .insert({
        user_id: userId,
        ...(boardId ? { board_id: boardId } : {}),
        key,
        name: name.trim(),
        description: description.trim() || null,
        color,
        position
      })
      .select('*')
      .single()
    if (currentUserId() !== userId || error || !data) return false
    set((state) =>
      state.columns.some((item) => item.id === data.id)
        ? state
        : { columns: [...state.columns, mapColumn(data)] }
    )
    return true
  },
  updateColumn: async (id, name, description, color) => {
    const userId = currentUserId()
    if (!userId) return false
    const { error } = await ownedBy(
      supabase
        .from('task_columns')
        .update({ name: name.trim(), description: description.trim() || null, color })
        .eq('id', id),
      userId,
      get().activeBoardId
    )
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
    const boardId = get().activeBoardId
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
        ownedBy(
          supabase.from('task_columns').update({ position: item.position }).eq('id', item.id),
          userId,
          boardId
        )
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
    const { error } = await ownedBy(
      supabase.from('task_columns').delete().eq('id', id),
      userId,
      get().activeBoardId
    )
    if (error) return false
    set((state) => ({ columns: state.columns.filter((item) => item.id !== id) }))
    return true
  },
  linkSession: async (taskId, subtaskId, chatId) => {
    const userId = currentUserId()
    if (!userId || !get().tasks.some((task) => task.id === taskId)) return false
    const boardId = get().activeBoardId
    const result = subtaskId
      ? await ownedBy(
          supabase
            .from('task_subtasks')
            .update({ chat_id: chatId })
            .eq('id', subtaskId)
            .eq('task_id', taskId),
          userId,
          boardId
        )
          .select('id')
          .single()
      : await ownedBy(
          supabase.from('tasks').update({ chat_id: chatId }).eq('id', taskId),
          userId,
          boardId
        )
          .select('id')
          .single()
    if (result.error || !result.data) {
      set({ error: 'Não foi possível vincular a sessão à tarefa.' })
      return false
    }
    if (currentUserId() !== userId) return false
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id !== taskId
          ? task
          : subtaskId
            ? {
                ...task,
                subtasks: task.subtasks.map((subtask) =>
                  subtask.id === subtaskId ? { ...subtask, chatId } : subtask
                )
              }
            : { ...task, chatId }
      )
    }))
    return true
  },
  reset: () => {
    get().stopRealtime()
    presenceSelf = null
    presenceTask = null
    set({
      loaded: false,
      loading: false,
      tasks: [],
      columns: [],
      boards: [],
      activeBoardId: storedBoardId(),
      boardEvents: [],
      taskActivity: null,
      presence: [],
      error: null
    })
  }
}))

interface RealtimePayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: Record<string, unknown>
  old: Record<string, unknown>
}
