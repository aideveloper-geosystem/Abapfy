import { DragEvent, FormEvent, useEffect, useMemo, useState } from 'react'
import type React from 'react'
import {
  Bell,
  CalendarDays,
  Check,
  CheckSquare2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  Clock3,
  GripVertical,
  LayoutGrid,
  List,
  Link2,
  Plus,
  Repeat2,
  Search,
  Settings2,
  Trash2,
  UserRound,
  WandSparkles,
  X
} from 'lucide-react'
import {
  useTasksStore,
  type TaskColumn,
  type TaskInput,
  type TaskItem,
  type TaskPriority,
  type TaskRecurrence,
  type TaskStatus
} from '@renderer/store/tasksStore'
import { useChatStore } from '@renderer/store/chatStore'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { useAuthStore } from '@renderer/store/authStore'
import { suggestTaskDraft } from '@renderer/lib/taskAssistant'
import './TasksScreen.css'

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta'
}
const RECURRENCE_LABELS: Record<TaskRecurrence, string> = {
  none: 'Não repetir',
  daily: 'Diária',
  weekly: 'Semanal',
  monthly: 'Mensal'
}

function emptyForm(status: string): TaskInput {
  return {
    title: '',
    description: '',
    status,
    priority: 'medium',
    dueDate: '',
    labels: [],
    sapModule: '',
    assignee: '',
    projectId: '',
    chatId: '',
    estimatedHours: '',
    actualHours: '',
    dependencyIds: [],
    recurrence: 'none',
    reminderAt: ''
  }
}

function localDateTime(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
}

function TaskCard({
  task,
  tasks,
  columns,
  onOpen
}: {
  task: TaskItem
  tasks: TaskItem[]
  columns: TaskColumn[]
  onOpen: () => void
}): JSX.Element {
  const completed = task.subtasks.filter((item) => item.completed).length
  const overdue = Boolean(
    task.dueDate &&
    !columns.find((column) => column.key === task.status)?.isDone &&
    task.dueDate < new Date().toISOString().slice(0, 10)
  )
  const unresolvedDependencies = task.dependencyIds.filter((id) => {
    const dependency = tasks.find((item) => item.id === id)
    return dependency && !columns.find((column) => column.key === dependency.status)?.isDone
  })
  function handleDragStart(event: DragEvent<HTMLDivElement>): void {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-abapfy-task', task.id)
  }
  return (
    <div
      className="task-card"
      draggable
      onDragStart={handleDragStart}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        event.stopPropagation()
        const draggedId = event.dataTransfer.getData('application/x-abapfy-task')
        if (draggedId && draggedId !== task.id)
          void useTasksStore.getState().moveTask(draggedId, task.status, task.id)
      }}
      onClick={onOpen}
    >
      <div className="task-card-topline">
        <div className="task-card-flags">
          <span className={`task-priority task-priority-${task.priority}`}>
            {PRIORITY_LABELS[task.priority]}
          </span>
          {task.sapModule && <span className="task-module">{task.sapModule}</span>}
        </div>
        <GripVertical size={14} strokeWidth={1.5} className="task-card-grip" />
      </div>
      <h3 className="task-card-title">{task.title}</h3>
      {task.description && <p className="task-card-description">{task.description}</p>}
      {task.labels.length > 0 && (
        <div className="task-labels">
          {task.labels.slice(0, 3).map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      )}
      {unresolvedDependencies.length > 0 && (
        <div className="task-blocked-by">
          <Link2 size={11} /> Bloqueada por {unresolvedDependencies.length} tarefa
          {unresolvedDependencies.length > 1 ? 's' : ''}
        </div>
      )}
      <div className="task-card-meta">
        {task.dueDate && (
          <span className={overdue ? 'task-card-due task-card-due-overdue' : 'task-card-due'}>
            <CalendarDays size={12} />
            {formatDate(task.dueDate)}
          </span>
        )}
        {task.assignee && (
          <span title={task.assignee}>
            <UserRound size={12} />
            {task.assignee}
          </span>
        )}
        {task.subtasks.length > 0 && (
          <span className="task-card-progress">
            <CheckSquare2 size={12} />
            {completed}/{task.subtasks.length}
          </span>
        )}
        {task.estimatedHours != null && (
          <span>
            <Clock3 size={12} />
            {task.actualHours ?? 0}/{task.estimatedHours}h
          </span>
        )}
        {task.recurrence !== 'none' && (
          <span title={RECURRENCE_LABELS[task.recurrence]}>
            <Repeat2 size={12} />
          </span>
        )}
      </div>
    </div>
  )
}

function TaskModal({
  task,
  initialStatus,
  columns,
  tasks,
  onClose
}: {
  task: TaskItem | null
  initialStatus: TaskStatus
  columns: TaskColumn[]
  tasks: TaskItem[]
  onClose: () => void
}): JSX.Element {
  const [form, setForm] = useState<TaskInput>(() =>
    task
      ? {
          title: task.title,
          description: task.description ?? '',
          status: task.status,
          priority: task.priority,
          dueDate: task.dueDate ?? '',
          labels: task.labels,
          sapModule: task.sapModule ?? '',
          assignee: task.assignee ?? '',
          projectId: task.projectId ?? '',
          chatId: task.chatId ?? '',
          estimatedHours: task.estimatedHours?.toString() ?? '',
          actualHours: task.actualHours?.toString() ?? '',
          dependencyIds: task.dependencyIds,
          recurrence: task.recurrence,
          reminderAt: localDateTime(task.reminderAt)
        }
      : emptyForm(initialStatus)
  )
  const [labelsText, setLabelsText] = useState(form.labels.join(', '))
  const [subtaskTitle, setSubtaskTitle] = useState('')
  const [assistantBrief, setAssistantBrief] = useState('')
  const [approvedSuggestions, setApprovedSuggestions] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const liveTask = useTasksStore((state) =>
    task ? (state.tasks.find((item) => item.id === task.id) ?? null) : null
  )
  const {
    createTask,
    updateTask,
    deleteTask,
    addSubtask,
    addSubtasks,
    toggleSubtask,
    deleteSubtask
  } = useTasksStore()
  const { projects, recentChats, projectChats, loadProjectChats } = useChatStore()
  const user = useAuthStore((state) => state.user)
  const { defaultProvider, defaultModel } = useSettingsStore()
  useEffect(() => {
    if (form.projectId) void loadProjectChats(form.projectId)
  }, [form.projectId, loadProjectChats])
  const chats = form.projectId ? (projectChats[form.projectId] ?? []) : recentChats

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!form.title.trim()) return
    const normalized = {
      ...form,
      labels: labelsText
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 12),
      chatId: form.projectId ? form.chatId : form.chatId
    }
    setSaving(true)
    if (task) {
      const ok = await updateTask(task.id, normalized)
      setSaving(false)
      if (ok) onClose()
      return
    }
    const created = await createTask(normalized)
    if (created && approvedSuggestions.length) await addSubtasks(created.id, approvedSuggestions)
    setSaving(false)
    if (created) onClose()
  }

  async function handleAssistant(): Promise<void> {
    if (!assistantBrief.trim() || !user) return
    if (!defaultProvider || !defaultModel) {
      window.alert('Configure um modelo padrão em Configurações → Inteligência Artificial.')
      return
    }
    setSuggesting(true)
    try {
      const suggestion = await suggestTaskDraft({
        userId: user.id,
        provider: defaultProvider,
        model: defaultModel,
        brief: assistantBrief
      })
      const apply = window.confirm(
        `O agente sugeriu “${suggestion.title}” e ${suggestion.subtasks.length} subtarefas. Aplicar ao card?`
      )
      if (!apply) return
      setForm((current) => ({
        ...current,
        title: suggestion.title || current.title,
        description: suggestion.description || current.description,
        priority: suggestion.priority,
        sapModule: suggestion.sapModule,
        estimatedHours: suggestion.estimatedHours?.toString() ?? current.estimatedHours
      }))
      setLabelsText(suggestion.labels.join(', '))
      if (task && suggestion.subtasks.length) await addSubtasks(task.id, suggestion.subtasks)
      else setApprovedSuggestions(suggestion.subtasks)
    } catch (error) {
      window.alert((error as Error).message || 'Não foi possível gerar a sugestão.')
    } finally {
      setSuggesting(false)
    }
  }

  async function handleDelete(): Promise<void> {
    if (!task || !window.confirm('Excluir esta tarefa e todas as subtarefas?')) return
    if (await deleteTask(task.id)) onClose()
  }
  async function handleAddSubtask(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!task || !subtaskTitle.trim()) return
    await addSubtask(task.id, subtaskTitle)
    setSubtaskTitle('')
  }
  return (
    <div className="task-modal-backdrop" onMouseDown={onClose}>
      <div
        className="task-modal task-modal-advanced"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="task-modal-header">
          <div>
            <h2>{task ? 'Detalhes da tarefa' : 'Nova tarefa'}</h2>
            <p>Planejamento SAP, vínculos, esforço e dependências.</p>
          </div>
          <button type="button" className="task-icon-button" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        <div className="task-assistant-panel">
          <WandSparkles size={17} />
          <textarea
            rows={2}
            value={assistantBrief}
            onChange={(event) => setAssistantBrief(event.target.value)}
            placeholder="Descreva o trabalho para o agente preencher o card e sugerir subtarefas…"
          />
          <button
            type="button"
            onClick={handleAssistant}
            disabled={suggesting || !assistantBrief.trim()}
          >
            {suggesting ? 'Analisando…' : 'Preencher com IA'}
          </button>
        </div>
        <form className="task-form" onSubmit={handleSubmit}>
          <label>
            <span>Título</span>
            <input
              autoFocus
              value={form.title}
              maxLength={160}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
          </label>
          <label>
            <span>Descrição</span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </label>
          <div className="task-form-row task-form-row-four">
            <label>
              <span>Coluna</span>
              <select
                value={form.status}
                onChange={(event) => setForm({ ...form, status: event.target.value })}
              >
                {columns.map((column) => (
                  <option key={column.id} value={column.key}>
                    {column.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Prioridade</span>
              <select
                value={form.priority}
                onChange={(event) =>
                  setForm({ ...form, priority: event.target.value as TaskPriority })
                }
              >
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
              </select>
            </label>
            <label>
              <span>Módulo SAP</span>
              <input
                value={form.sapModule}
                placeholder="MM, SD, FI…"
                onChange={(event) => setForm({ ...form, sapModule: event.target.value })}
              />
            </label>
            <label>
              <span>Responsável</span>
              <input
                value={form.assignee}
                onChange={(event) => setForm({ ...form, assignee: event.target.value })}
              />
            </label>
          </div>
          <label>
            <span>Labels, separadas por vírgula</span>
            <input
              value={labelsText}
              placeholder="ABAP, urgente, transporte"
              onChange={(event) => setLabelsText(event.target.value)}
            />
          </label>
          <div className="task-form-row task-form-row-four">
            <label>
              <span>Prazo</span>
              <input
                type="date"
                value={form.dueDate}
                onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
              />
            </label>
            <label>
              <span>Lembrete</span>
              <input
                type="datetime-local"
                value={form.reminderAt}
                onChange={(event) => setForm({ ...form, reminderAt: event.target.value })}
              />
            </label>
            <label>
              <span>Estimativa (h)</span>
              <input
                type="number"
                min="0"
                step="0.25"
                value={form.estimatedHours}
                onChange={(event) => setForm({ ...form, estimatedHours: event.target.value })}
              />
            </label>
            <label>
              <span>Realizado (h)</span>
              <input
                type="number"
                min="0"
                step="0.25"
                value={form.actualHours}
                onChange={(event) => setForm({ ...form, actualHours: event.target.value })}
              />
            </label>
          </div>
          <div className="task-form-row">
            <label>
              <span>Recorrência</span>
              <select
                value={form.recurrence}
                onChange={(event) =>
                  setForm({ ...form, recurrence: event.target.value as TaskRecurrence })
                }
              >
                {Object.entries(RECURRENCE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Projeto</span>
              <select
                value={form.projectId}
                onChange={(event) =>
                  setForm({ ...form, projectId: event.target.value, chatId: '' })
                }
              >
                <option value="">Sem projeto</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Chat relacionado</span>
              <select
                value={form.chatId}
                onChange={(event) => setForm({ ...form, chatId: event.target.value })}
              >
                <option value="">Sem chat</option>
                {chats.map((chat) => (
                  <option key={chat.id} value={chat.id}>
                    {chat.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="task-dependencies">
            <span>Dependências e bloqueios</span>
            <div>
              {tasks
                .filter((item) => item.id !== task?.id)
                .map((item) => (
                  <label key={item.id}>
                    <input
                      type="checkbox"
                      checked={form.dependencyIds.includes(item.id)}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          dependencyIds: event.target.checked
                            ? [...form.dependencyIds, item.id]
                            : form.dependencyIds.filter((id) => id !== item.id)
                        })
                      }
                    />
                    <span>{item.title}</span>
                  </label>
                ))}
            </div>
            {tasks.length <= 1 && <small>Nenhuma outra tarefa disponível.</small>}
          </div>
          {approvedSuggestions.length > 0 && (
            <div className="task-ai-preview">
              <WandSparkles size={14} /> {approvedSuggestions.length} subtarefas sugeridas serão
              criadas após salvar.
            </div>
          )}
          <div className="task-modal-actions">
            {task && (
              <button type="button" className="task-delete-button" onClick={handleDelete}>
                <Trash2 size={14} /> Excluir
              </button>
            )}
            <span className="task-actions-spacer" />
            <button type="button" className="task-secondary-button" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="task-primary-button"
              disabled={!form.title.trim() || saving}
            >
              {saving ? 'Salvando…' : task ? 'Salvar alterações' : 'Criar tarefa'}
            </button>
          </div>
        </form>
        {task && liveTask && (
          <div className="task-subtasks">
            <div className="task-subtasks-header">
              <span>Subtarefas</span>
              <span>
                {liveTask.subtasks.filter((item) => item.completed).length}/
                {liveTask.subtasks.length}
              </span>
            </div>
            <div className="task-subtasks-list">
              {liveTask.subtasks.length === 0 && (
                <p className="task-subtasks-empty">Nenhuma subtarefa adicionada.</p>
              )}
              {liveTask.subtasks.map((subtask) => (
                <div key={subtask.id} className="task-subtask-row">
                  <button
                    type="button"
                    className={`task-subtask-check ${subtask.completed ? 'task-subtask-check-done' : ''}`}
                    onClick={() => toggleSubtask(subtask.id, !subtask.completed)}
                  >
                    {subtask.completed && <Check size={12} />}
                  </button>
                  <span
                    className={
                      subtask.completed
                        ? 'task-subtask-title task-subtask-title-done'
                        : 'task-subtask-title'
                    }
                  >
                    {subtask.title}
                  </span>
                  <button
                    type="button"
                    className="task-subtask-delete"
                    onClick={() => deleteSubtask(subtask.id)}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
            <form className="task-subtask-form" onSubmit={handleAddSubtask}>
              <input
                value={subtaskTitle}
                maxLength={160}
                placeholder="Adicionar subtarefa…"
                onChange={(event) => setSubtaskTitle(event.target.value)}
              />
              <button type="submit" disabled={!subtaskTitle.trim()}>
                <Plus size={14} /> Adicionar
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

function ColumnManager({
  columns,
  tasks,
  onClose
}: {
  columns: TaskColumn[]
  tasks: TaskItem[]
  onClose: () => void
}): JSX.Element {
  const { createColumn, updateColumn, moveColumn, deleteColumn } = useTasksStore()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('#0070f2')
  return (
    <div className="task-modal-backdrop" onMouseDown={onClose}>
      <div
        className="task-modal task-columns-modal"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="task-modal-header">
          <div>
            <h2>Configurar colunas</h2>
            <p>Ordene livremente; colunas com cards não podem ser excluídas.</p>
          </div>
          <button className="task-icon-button" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        <div className="task-columns-list">
          {columns.map((column, index) => (
            <div key={column.id} className="task-column-config">
              <input
                type="color"
                defaultValue={column.color}
                onBlur={(event) =>
                  void updateColumn(
                    column.id,
                    column.name,
                    column.description ?? '',
                    event.target.value
                  )
                }
              />
              <div>
                <strong>{column.name}</strong>
                <span>{column.description}</span>
              </div>
              <button
                type="button"
                disabled={index === 0}
                onClick={() => void moveColumn(column.id, -1)}
                title="Mover para a esquerda"
              >
                <ChevronUp size={14} />
              </button>
              <button
                type="button"
                disabled={index === columns.length - 1}
                onClick={() => void moveColumn(column.id, 1)}
                title="Mover para a direita"
              >
                <ChevronDown size={14} />
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = window.prompt('Novo nome da coluna', column.name)
                  if (next?.trim())
                    void updateColumn(column.id, next, column.description ?? '', column.color)
                }}
              >
                Editar
              </button>
              <button
                type="button"
                disabled={tasks.some((task) => task.status === column.key) || columns.length <= 1}
                onClick={async () => {
                  if (!window.confirm(`Excluir a coluna “${column.name}”?`)) return
                  if (!(await deleteColumn(column.id)))
                    window.alert('Esvazie a coluna antes de excluí-la.')
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <form
          className="task-new-column"
          onSubmit={async (event) => {
            event.preventDefault()
            if (await createColumn(name, description, color)) {
              setName('')
              setDescription('')
            }
          }}
        >
          <h3>Nova coluna</h3>
          <div>
            <input
              required
              value={name}
              placeholder="Nome"
              onChange={(event) => setName(event.target.value)}
            />
            <input
              value={description}
              placeholder="Descrição"
              onChange={(event) => setDescription(event.target.value)}
            />
            <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
            <button className="task-primary-button" type="submit">
              <Plus size={14} /> Adicionar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CalendarView({
  tasks,
  columns,
  month,
  onOpen
}: {
  tasks: TaskItem[]
  columns: TaskColumn[]
  month: Date
  onOpen: (task: TaskItem) => void
}): JSX.Element {
  const year = month.getFullYear(),
    monthIndex = month.getMonth()
  const firstWeekday = new Date(year, monthIndex, 1).getDay()
  const days = new Date(year, monthIndex + 1, 0).getDate()
  const cells = Array.from(
    { length: Math.ceil((firstWeekday + days) / 7) * 7 },
    (_, index) => index - firstWeekday + 1
  )
  return (
    <div className="tasks-calendar">
      <div className="tasks-calendar-weekdays">
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="tasks-calendar-grid">
        {cells.map((day, index) => {
          const date =
            day > 0 && day <= days
              ? `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              : null
          const dayTasks = date ? tasks.filter((task) => task.dueDate === date) : []
          return (
            <div
              key={index}
              className={`tasks-calendar-day ${date ? '' : 'tasks-calendar-day-out'}`}
            >
              <strong>{date ? day : ''}</strong>
              {dayTasks.slice(0, 4).map((task) => (
                <button
                  key={task.id}
                  style={{
                    borderLeftColor: columns.find((column) => column.key === task.status)?.color
                  }}
                  onClick={() => onOpen(task)}
                  title={task.title}
                >
                  {task.title}
                </button>
              ))}
              {dayTasks.length > 4 && <small>+{dayTasks.length - 4} tarefas</small>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function TasksScreen(): JSX.Element {
  const { tasks, columns, loaded, loading, error, load, moveTask } = useTasksStore()
  const [modal, setModal] = useState<{ task: TaskItem | null; status: TaskStatus } | null>(null)
  const [columnManager, setColumnManager] = useState(false)
  const [view, setView] = useState<'board' | 'calendar' | 'list'>('board')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const visibleTasks = useMemo(() => tasks.filter((task) => (!statusFilter || task.status === statusFilter) &&
    [task.title, task.description, task.sapModule, task.assignee, ...task.labels].some((value) => value?.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR')))), [tasks, query, statusFilter])
  const [month, setMonth] = useState(() => new Date())
  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])
  const byStatus = useMemo(
    () =>
      Object.fromEntries(
        columns.map((column) => [
          column.key,
          visibleTasks.filter((task) => task.status === column.key).sort((a, b) => a.position - b.position)
        ])
      ) as Record<string, TaskItem[]>,
    [visibleTasks, columns]
  )
  useEffect(() => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const now = Date.now(),
      today = new Date().toISOString().slice(0, 10)
    tasks.forEach((task) => {
      const notify =
        (task.reminderAt && new Date(task.reminderAt).getTime() <= now) ||
        (task.dueDate &&
          task.dueDate <= today &&
          !columns.find((column) => column.key === task.status)?.isDone)
      const key = `abapfy-task-notified-${task.id}-${task.reminderAt ?? task.dueDate}`
      if (notify && !sessionStorage.getItem(key)) {
        new Notification('Abapfy · Tarefa pendente', { body: task.title })
        sessionStorage.setItem(key, '1')
      }
    })
  }, [tasks, columns])
  async function enableNotifications(): Promise<void> {
    if (typeof Notification !== 'undefined') await Notification.requestPermission()
  }
  const defaultStatus =
    columns.find((column) => !column.isDone && !column.isBlocked)?.key ?? columns[0]?.key ?? 'todo'
  return (
    <main className="tasks-screen">
      <header className="tasks-header">
        <div>
          <h1>Gerenciamento de tarefas</h1>
          <p>Planeje entregas SAP, dependências, esforço e recorrências.</p>
        </div>
        <div className="tasks-header-actions">
          <button type="button" className="task-secondary-button" onClick={enableNotifications}>
            <Bell size={14} /> Notificações
          </button>
          <button
            type="button"
            className="task-secondary-button"
            onClick={() => setColumnManager(true)}
          >
            <Settings2 size={14} /> Colunas
          </button>
          <div className="task-view-toggle">
            <button className={view === 'board' ? 'active' : ''} onClick={() => setView('board')}>
              <LayoutGrid size={14} /> Quadro
            </button>
            <button
              className={view === 'calendar' ? 'active' : ''}
              onClick={() => setView('calendar')}
            >
              <CalendarDays size={14} /> Calendário
            </button>
            <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}><List size={14} /> Lista</button>
          </div>
          <button
            type="button"
            className="task-primary-button"
            onClick={() => setModal({ task: null, status: defaultStatus })}
          >
            <Plus size={14} /> Nova tarefa
          </button>
        </div>
      </header>
      <div className="tasks-filter-bar"><label><Search size={14} /><input aria-label="Buscar tarefas" placeholder="Buscar tarefa, módulo ou responsável…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><div aria-label="Filtrar tarefas por status"><button type="button" aria-pressed={!statusFilter} onClick={() => setStatusFilter(null)}>Todas <span>{tasks.length}</span></button>{columns.map((column) => <button type="button" key={column.id} aria-pressed={statusFilter === column.key} onClick={() => setStatusFilter(column.key)}>{column.name}<span>{tasks.filter((task) => task.status === column.key).length}</span></button>)}</div></div>
      <div className="tasks-result-count" role="status">{loading ? 'Carregando tarefas…' : `${visibleTasks.length} de ${tasks.length} tarefas`}</div>
      {error && (
        <div className="tasks-error">
          <CircleAlert size={15} /> {error}
        </div>
      )}
      {view === 'calendar' && (
        <div className="tasks-calendar-header">
          <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
            <ChevronLeft size={17} />
          </button>
          <strong>
            {new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(month)}
          </strong>
          <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
            <ChevronRight size={17} />
          </button>
        </div>
      )}
      {view === 'list' ? <div className="tasks-records"><table><thead><tr><th>Tarefa</th><th>Status</th><th>Módulo</th><th>Responsável</th><th>Prazo</th><th>Subtarefas</th></tr></thead><tbody>{visibleTasks.map((task) => <tr key={task.id}><td><button type="button" onClick={() => setModal({ task, status: task.status })}>{task.title}</button></td><td>{columns.find((column) => column.key === task.status)?.name ?? 'Status indisponível'}</td><td>{task.sapModule || '—'}</td><td>{task.assignee || '—'}</td><td>{task.dueDate ? new Date(`${task.dueDate}T12:00:00`).toLocaleDateString('pt-BR') : 'Sem prazo'}</td><td>{task.subtasks.filter((item) => item.completed).length}/{task.subtasks.length}</td></tr>)}</tbody></table>{!visibleTasks.length && !loading && <p>Nenhuma tarefa corresponde aos filtros.</p>}</div> : view === 'calendar' ? (
        <CalendarView
          tasks={visibleTasks}
          columns={columns}
          month={month}
          onOpen={(task) => setModal({ task, status: task.status })}
        />
      ) : (
        <div
          className="tasks-board"
          style={{
            gridTemplateColumns: `repeat(${Math.max(statusFilter ? columns.filter((column) => column.key === statusFilter).length : columns.length, 1)}, minmax(250px, 1fr))`
          }}
        >
          {columns.filter((column) => !statusFilter || column.key === statusFilter).map((column) => (
            <section
              key={column.id}
              className="task-column"
              style={{ '--task-column-color': column.color } as React.CSSProperties}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                const taskId = event.dataTransfer.getData('application/x-abapfy-task')
                if (taskId) void moveTask(taskId, column.key)
              }}
            >
              <div className="task-column-accent" />
              <div className="task-column-header">
                <div>
                  <h2>{column.name}</h2>
                  <p>{column.description}</p>
                </div>
                <span>{byStatus[column.key]?.length ?? 0}</span>
              </div>
              <div className="task-column-list">
                {loading && !loaded && <div className="task-column-empty">Carregando…</div>}
                {!loading && (byStatus[column.key]?.length ?? 0) === 0 && (
                  <div className="task-column-empty">Solte um card aqui</div>
                )}
                {(byStatus[column.key] ?? []).map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    tasks={tasks}
                    columns={columns}
                    onOpen={() => setModal({ task, status: task.status })}
                  />
                ))}
                <button
                  type="button"
                  className="task-column-add"
                  onClick={() => setModal({ task: null, status: column.key })}
                >
                  <Plus size={13} /> Adicionar tarefa
                </button>
              </div>
            </section>
          ))}
        </div>
      )}
      {modal && (
        <TaskModal
          task={modal.task}
          initialStatus={modal.status}
          columns={columns}
          tasks={tasks}
          onClose={() => setModal(null)}
        />
      )}
      {columnManager && (
        <ColumnManager columns={columns} tasks={tasks} onClose={() => setColumnManager(false)} />
      )}
    </main>
  )
}
