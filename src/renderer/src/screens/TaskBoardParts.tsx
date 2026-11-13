import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Hand,
  MessageSquare,
  Plus,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X
} from 'lucide-react'
import {
  useTasksStore,
  type TaskBoard,
  type TaskColumn,
  type TaskEvent,
  type TaskItem
} from '@renderer/store/tasksStore'
import { useWorkspaceStore, type WorkspaceMember } from '@renderer/store/workspaceStore'
import { useAuthStore } from '@renderer/store/authStore'
import { useClientsStore } from '@renderer/store/clientsStore'
import { useChatStore } from '@renderer/store/chatStore'
import { isWorkspaceAdmin } from '@renderer/lib/workspaceAccess'

export interface PeopleDirectory {
  members: WorkspaceMember[]
  nameOf: (userId: string | null | undefined) => string
  initialsOf: (userId: string | null | undefined) => string
  selfId: string | null
  selfName: string
}

/** Names of workspace members, with the signed-in person resolved even when the list is not loaded. */
export function usePeople(): PeopleDirectory {
  const members = useWorkspaceStore((state) => state.members)
  const user = useAuthStore((state) => state.user)
  const profile = useAuthStore((state) => state.profile)
  return useMemo(() => {
    const selfId = user?.id ?? null
    const selfName = profile?.nome || user?.email || 'Você'
    const nameOf = (userId: string | null | undefined): string => {
      if (!userId) return 'Sem responsável'
      const member = members.find((item) => item.userId === userId)
      if (member) return member.nome || member.email || 'Membro'
      return userId === selfId ? selfName : 'Membro'
    }
    const initialsOf = (userId: string | null | undefined): string => {
      const parts = nameOf(userId).trim().split(/\s+/).filter(Boolean)
      return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '')).toUpperCase()
    }
    return { members, nameOf, initialsOf, selfId, selfName }
  }, [members, user, profile])
}

export function Avatar({
  people,
  userId,
  size = 22
}: {
  people: PeopleDirectory
  userId: string | null
  size?: number
}): JSX.Element {
  return (
    <span
      className={`tb-avatar${userId ? '' : ' tb-avatar-empty'}${userId === people.selfId ? ' tb-avatar-self' : ''}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      title={people.nameOf(userId)}
    >
      {userId ? people.initialsOf(userId) : '?'}
    </span>
  )
}

function eventText(event: TaskEvent, people: PeopleDirectory, columns: TaskColumn[]): string {
  const who = people.nameOf(event.actorId)
  const column = (key: unknown): string =>
    columns.find((item) => item.key === key)?.name ?? String(key ?? '')
  switch (event.type) {
    case 'created':
      return `${who} criou a tarefa`
    case 'moved':
      return `${who} moveu para ${column(event.data.to)}`
    case 'assigned': {
      const to = (event.data.to as string | null) ?? null
      if (!to) return `${who} liberou a tarefa`
      return to === event.actorId
        ? `${who} assumiu a tarefa`
        : `${who} atribuiu a tarefa a ${people.nameOf(to)}`
    }
    case 'updated': {
      const labels: Record<string, string> = {
        title: 'título',
        priority: 'prioridade',
        due_date: 'prazo',
        description: 'descrição'
      }
      const fields = ((event.data.fields as string[] | undefined) ?? []).map((key) => labels[key] ?? key)
      return `${who} alterou ${fields.join(', ') || 'a tarefa'}`
    }
    case 'subtask':
      return `${who} ${event.data.completed ? 'concluiu' : 'reabriu'} “${String(event.data.title ?? '')}”`
    case 'deleted':
      return `${who} excluiu a tarefa`
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(diff / 60000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  return new Date(iso).toLocaleDateString('pt-BR')
}

/** Board toolbar: switch between the personal board and the shared boards, create and manage them. */
export function BoardBar({
  people,
  activityOpen,
  onToggleActivity
}: {
  people: PeopleDirectory
  activityOpen: boolean
  onToggleActivity: () => void
}): JSX.Element {
  const { boards, activeBoardId, setActiveBoard, presence } = useTasksStore()
  const [creating, setCreating] = useState(false)
  const [managing, setManaging] = useState(false)
  const active = boards.find((board) => board.id === activeBoardId) ?? null
  const clients = useClientsStore((state) => state.clients)
  const clientName = (board: TaskBoard): string | undefined =>
    clients.find((client) => client.id === board.clientId)?.name
  const online = presence.filter((item) => item.userId !== people.selfId)
  return (
    <div className="tb-bar">
      <div className="tb-tabs" role="tablist" aria-label="Quadros de tarefas">
        <button
          type="button"
          role="tab"
          aria-selected={!active}
          className={!active ? 'active' : ''}
          onClick={() => void setActiveBoard(null)}
        >
          Meu quadro
        </button>
        {boards.map((board) => (
          <button
            key={board.id}
            type="button"
            role="tab"
            aria-selected={board.id === activeBoardId}
            className={board.id === activeBoardId ? 'active' : ''}
            onClick={() => void setActiveBoard(board.id)}
            title={clientName(board) ? `${board.name} · ${clientName(board)}` : board.name}
          >
            <Users size={13} /> {board.name}
          </button>
        ))}
        <button type="button" className="tb-new" onClick={() => setCreating(true)}>
          <Plus size={13} /> Quadro em grupo
        </button>
      </div>
      {active && (
        <div className="tb-board-tools">
          <div className="tb-online" aria-label="Pessoas online neste quadro">
            {online.slice(0, 5).map((item) => (
              <Avatar key={item.userId} people={people} userId={item.userId} />
            ))}
            {online.length > 0 && (
              <span>{online.length === 1 ? '1 online' : `${online.length} online`}</span>
            )}
          </div>
          <button
            type="button"
            className={`task-secondary-button${activityOpen ? ' tb-pressed' : ''}`}
            aria-pressed={activityOpen}
            onClick={onToggleActivity}
          >
            <Activity size={14} /> Atividade
          </button>
          <button type="button" className="task-secondary-button" onClick={() => setManaging(true)}>
            <Users size={14} /> Membros ({active.memberIds.length})
          </button>
        </div>
      )}
      {creating && <NewBoardModal people={people} onClose={() => setCreating(false)} />}
      {managing && active && (
        <BoardMembersModal board={active} people={people} onClose={() => setManaging(false)} />
      )}
    </div>
  )
}

function NewBoardModal({
  people,
  onClose
}: {
  people: PeopleDirectory
  onClose: () => void
}): JSX.Element {
  const createBoard = useTasksStore((state) => state.createBoard)
  const clients = useClientsStore((state) => state.clients)
  const projects = useChatStore((state) => state.projects)
  const [name, setName] = useState('')
  const [clientId, setClientId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const others = people.members.filter((member) => member.userId !== people.selfId)
  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!name.trim() || saving) return
    setSaving(true)
    const id = await createBoard({ name, clientId, projectId, memberIds: picked })
    setSaving(false)
    if (id) onClose()
  }
  return (
    <div className="task-modal-backdrop" onMouseDown={onClose}>
      <form
        className="task-modal tb-modal"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <div className="task-modal-header">
          <div>
            <h2>Novo quadro em grupo</h2>
            <p>As tarefas ficam visíveis para todos os membros, em tempo real.</p>
          </div>
          <button type="button" className="task-icon-button" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        <div className="task-form">
          <label>
            <span>Nome</span>
            <input
              autoFocus
              required
              value={name}
              maxLength={80}
              placeholder="Ex.: Projeto Financeiro — Acme"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <div className="task-form-row">
            <label>
              <span>Cliente (opcional)</span>
              <select
                value={clientId}
                onChange={(event) => {
                  setClientId(event.target.value)
                  setProjectId('')
                }}
              >
                <option value="">Qualquer cliente</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Projeto (opcional)</span>
              <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                <option value="">Sem projeto fixo</option>
                {projects
                  .filter((project) => !clientId || project.clientId === clientId)
                  .map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div className="task-dependencies">
            <span>Membros</span>
            <div>
              {others.length === 0 && <small>Nenhuma outra pessoa no workspace.</small>}
              {others.map((member) => (
                <label key={member.userId}>
                  <input
                    type="checkbox"
                    checked={picked.includes(member.userId)}
                    onChange={(event) =>
                      setPicked(
                        event.target.checked
                          ? [...picked, member.userId]
                          : picked.filter((id) => id !== member.userId)
                      )
                    }
                  />
                  <span>{member.nome || member.email || 'Membro'}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="task-modal-actions">
          <span className="task-actions-spacer" />
          <button type="button" className="task-secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="task-primary-button" disabled={!name.trim() || saving}>
            {saving ? 'Criando…' : 'Criar quadro'}
          </button>
        </div>
      </form>
    </div>
  )
}

function BoardMembersModal({
  board,
  people,
  onClose
}: {
  board: TaskBoard
  people: PeopleDirectory
  onClose: () => void
}): JSX.Element {
  const { addBoardMember, removeBoardMember, renameBoard, deleteBoard } = useTasksStore()
  const role = useWorkspaceStore((state) => state.workspace?.role)
  const canDelete = isWorkspaceAdmin(role)
  const canRemoveOthers = canDelete || board.createdBy === people.selfId
  const [name, setName] = useState(board.name)
  const [error, setError] = useState<string | null>(null)
  const candidates = people.members.filter((member) => !board.memberIds.includes(member.userId))
  return (
    <div className="task-modal-backdrop" onMouseDown={onClose}>
      <div className="task-modal tb-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="task-modal-header">
          <div>
            <h2>Membros do quadro</h2>
            <p>Quem está no quadro vê e edita todas as tarefas.</p>
          </div>
          <button type="button" className="task-icon-button" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        <div className="task-form">
          <label>
            <span>Nome do quadro</span>
            <input
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => {
                if (name.trim() && name.trim() !== board.name)
                  void renameBoard(board.id, name, board.description ?? '')
              }}
            />
          </label>
          {error && <div className="tasks-error">{error}</div>}
          <ul className="tb-member-list">
            {board.memberIds.map((userId) => (
              <li key={userId}>
                <Avatar people={people} userId={userId} size={26} />
                <span>
                  {people.nameOf(userId)}
                  {userId === board.createdBy && <small> · criou o quadro</small>}
                  {userId === people.selfId && <small> · você</small>}
                </span>
                {(userId === people.selfId || canRemoveOthers) && (
                  <button
                    type="button"
                    className="task-icon-button"
                    title={userId === people.selfId ? 'Sair do quadro' : 'Remover do quadro'}
                    onClick={async () => {
                      if (!(await removeBoardMember(board.id, userId)))
                        setError('Não foi possível alterar os membros.')
                      else if (userId === people.selfId) onClose()
                    }}
                  >
                    <UserMinus size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {candidates.length > 0 && (
            <label>
              <span>Adicionar pessoa do workspace</span>
              <select
                value=""
                onChange={async (event) => {
                  if (event.target.value && !(await addBoardMember(board.id, event.target.value)))
                    setError('Não foi possível adicionar a pessoa.')
                }}
              >
                <option value="">Selecione…</option>
                {candidates.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.nome || member.email || 'Membro'}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="task-modal-actions">
          {canDelete && (
            <button
              type="button"
              className="task-delete-button"
              onClick={async () => {
                if (!window.confirm(`Excluir o quadro “${board.name}” e todas as suas tarefas?`)) return
                if (await deleteBoard(board.id)) onClose()
                else setError('Não foi possível excluir o quadro.')
              }}
            >
              <Trash2 size={14} /> Excluir quadro
            </button>
          )}
          <span className="task-actions-spacer" />
          <button type="button" className="task-primary-button" onClick={onClose}>
            <UserPlus size={14} /> Concluir
          </button>
        </div>
      </div>
    </div>
  )
}

/** Recent board activity, newest first. */
export function BoardActivityPanel({
  people,
  columns,
  onClose
}: {
  people: PeopleDirectory
  columns: TaskColumn[]
  onClose: () => void
}): JSX.Element {
  const events = useTasksStore((state) => state.boardEvents)
  return (
    <aside className="tb-activity" aria-label="Atividade do quadro">
      <div className="tb-activity-header">
        <strong>Atividade</strong>
        <button type="button" className="task-icon-button" onClick={onClose}>
          <X size={15} />
        </button>
      </div>
      {events.length === 0 && <p className="tb-empty">Nenhuma atividade ainda.</p>}
      <ul>
        {events.map((event) => (
          <li key={event.id}>
            <Avatar people={people} userId={event.actorId} />
            <div>
              <span>{eventText(event, people, columns)}</span>
              <strong>{event.taskTitle}</strong>
              <time dateTime={event.createdAt}>{relativeTime(event.createdAt)}</time>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  )
}

/** Responsible person: claim, release or reassign. Only shown for shared boards. */
export function AssigneeControl({
  task,
  board,
  people,
  value,
  onChange
}: {
  task: TaskItem | null
  board: TaskBoard
  people: PeopleDirectory
  value: string
  onChange: (userId: string) => void
}): JSX.Element {
  const { claimTask, releaseTask } = useTasksStore()
  const live = useTasksStore((state) =>
    task ? (state.tasks.find((item) => item.id === task.id) ?? null) : null
  )
  const current = live ? live.assigneeId : value || null
  const mine = current !== null && current === people.selfId
  return (
    <div className="tb-assignee">
      <span>Responsável</span>
      <div>
        <Avatar people={people} userId={current} size={26} />
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">Sem responsável</option>
          {board.memberIds.map((userId) => (
            <option key={userId} value={userId}>
              {people.nameOf(userId)}
              {userId === people.selfId ? ' (você)' : ''}
            </option>
          ))}
        </select>
        {live && !current && (
          <button
            type="button"
            className="task-secondary-button"
            onClick={async () => {
              if (await claimTask(live.id)) onChange(people.selfId ?? '')
            }}
          >
            <Hand size={13} /> Assumir
          </button>
        )}
        {live && mine && (
          <button
            type="button"
            className="task-secondary-button"
            onClick={async () => {
              if (await releaseTask(live.id)) onChange('')
            }}
          >
            Liberar
          </button>
        )}
      </div>
    </div>
  )
}

/** Comments and history of one task of a shared board. */
export function TaskActivityTabs({
  taskId,
  people,
  columns
}: {
  taskId: string
  people: PeopleDirectory
  columns: TaskColumn[]
}): JSX.Element {
  const { taskActivity, loadTaskActivity, clearTaskActivity, addComment, deleteComment } =
    useTasksStore()
  const [tab, setTab] = useState<'comments' | 'history'>('comments')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  useEffect(() => {
    void loadTaskActivity(taskId)
    return () => clearTaskActivity()
  }, [taskId, loadTaskActivity, clearTaskActivity])
  const comments = taskActivity?.taskId === taskId ? taskActivity.comments : []
  const events = taskActivity?.taskId === taskId ? taskActivity.events : []
  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!body.trim() || sending) return
    setSending(true)
    if (await addComment(taskId, body)) setBody('')
    setSending(false)
  }
  return (
    <div className="tb-thread">
      <div className="tb-thread-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'comments'}
          className={tab === 'comments' ? 'active' : ''}
          onClick={() => setTab('comments')}
        >
          <MessageSquare size={13} /> Comentários ({comments.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'history'}
          className={tab === 'history' ? 'active' : ''}
          onClick={() => setTab('history')}
        >
          <Activity size={13} /> Histórico ({events.length})
        </button>
      </div>
      {tab === 'comments' ? (
        <>
          <ul className="tb-comments">
            {comments.length === 0 && <li className="tb-empty">Nenhum comentário.</li>}
            {comments.map((comment) => (
              <li key={comment.id}>
                <Avatar people={people} userId={comment.authorId} size={24} />
                <div>
                  <header>
                    <strong>{people.nameOf(comment.authorId)}</strong>
                    <time dateTime={comment.createdAt}>{relativeTime(comment.createdAt)}</time>
                    {comment.authorId === people.selfId && (
                      <button
                        type="button"
                        className="task-subtask-delete"
                        title="Excluir comentário"
                        onClick={() => void deleteComment(comment.id)}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </header>
                  <p>{comment.body}</p>
                </div>
              </li>
            ))}
          </ul>
          <form className="task-subtask-form" onSubmit={submit}>
            <input
              value={body}
              maxLength={2000}
              placeholder="Comentar para o grupo…"
              onChange={(event) => setBody(event.target.value)}
            />
            <button type="submit" disabled={!body.trim() || sending}>
              <Plus size={14} /> Enviar
            </button>
          </form>
        </>
      ) : (
        <ul className="tb-history">
          {events.length === 0 && <li className="tb-empty">Sem histórico.</li>}
          {events.map((event) => (
            <li key={event.id}>
              <span>{eventText(event, people, columns)}</span>
              <time dateTime={event.createdAt}>{relativeTime(event.createdAt)}</time>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
