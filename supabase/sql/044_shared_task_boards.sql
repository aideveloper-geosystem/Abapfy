-- Abapfy — quadros de tarefas compartilhados (tarefas em grupo).
-- Aplicar depois da 043, no SQL Editor do Supabase. Pode ser executada mais de uma vez.
--
-- Modelo:
--   * O quadro pessoal continua igual: tasks/task_columns com board_id nulo e user_id = dono.
--   * Um quadro compartilhado (task_boards) pertence a um workspace, pode estar ligado a um cliente
--     e/ou projeto e tem membros explícitos (task_board_members). Todos os membros leem e editam
--     tarefas, subtarefas e colunas; só proprietário/administrador do workspace exclui o quadro e
--     suas colunas.
--   * Responsável é um usuário (tasks.assignee_id), que deve ser membro do quadro. "Assumir" é
--     atômico (claim_task): quem chegar depois recebe falso em vez de sobrescrever.
--   * Histórico (task_events) é escrito só por gatilhos, com o autor vindo de auth.uid().
--   * Comentários (task_comments) existem apenas em tarefas de quadros compartilhados.
--   * As tabelas entram na publicação supabase_realtime; a RLS vale também para o Realtime.

begin;

-- ---------------------------------------------------------------- boards

create table if not exists public.task_boards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  name text not null check (char_length(trim(name)) between 1 and 80),
  description text check (description is null or char_length(description) <= 500),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists task_boards_workspace_idx on public.task_boards(workspace_id, created_at);

create table if not exists public.task_board_members (
  board_id uuid not null references public.task_boards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (board_id, user_id)
);
create index if not exists task_board_members_user_idx on public.task_board_members(user_id);

drop trigger if exists task_boards_set_updated_at on public.task_boards;
create trigger task_boards_set_updated_at before update on public.task_boards
  for each row execute function public.set_updated_at();

create or replace function public.keep_task_board_scope()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.workspace_id is distinct from old.workspace_id or new.created_by is distinct from old.created_by
    or new.client_id is distinct from old.client_id or new.project_id is distinct from old.project_id then
    raise exception 'Task board workspace, creator, client and project cannot be changed';
  end if;
  return new;
end $$;
drop trigger if exists task_boards_keep_scope on public.task_boards;
create trigger task_boards_keep_scope before update on public.task_boards
  for each row execute function public.keep_task_board_scope();

-- ---------------------------------------------------------------- access helpers (SECURITY DEFINER avoids RLS recursion)

create or replace function public.task_board_workspace(p_board uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select workspace_id from public.task_boards where id = p_board $$;

create or replace function public.is_task_board_member(p_board uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.task_board_members m
    join public.task_boards b on b.id = m.board_id
    join public.workspace_members w on w.workspace_id = b.workspace_id and w.user_id = m.user_id
    where m.board_id = p_board and m.user_id = auth.uid()) $$;

-- ---------------------------------------------------------------- tasks, subtasks, columns

alter table public.tasks
  add column if not exists board_id uuid references public.task_boards(id) on delete cascade,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists assignee_id uuid references auth.users(id) on delete set null,
  add column if not exists assigned_at timestamptz;
update public.tasks set created_by = user_id where created_by is null;
alter table public.tasks alter column created_by set default auth.uid();
create index if not exists tasks_board_status_position_idx on public.tasks(board_id, status, position);
create index if not exists tasks_assignee_idx on public.tasks(assignee_id) where assignee_id is not null;

-- Defined after the column exists: SQL-language function bodies are checked at creation.
create or replace function public.can_access_task(p_task uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tasks t where t.id = p_task and (
    (t.board_id is null and t.user_id = auth.uid())
    or (t.board_id is not null and public.is_task_board_member(t.board_id)))) $$;

alter table public.task_columns
  add column if not exists board_id uuid references public.task_boards(id) on delete cascade;
-- Personal keys stay unique per user; shared keys are unique per board.
alter table public.task_columns drop constraint if exists task_columns_user_id_key_key;
alter table public.task_columns drop constraint if exists task_columns_owner_board_key;
alter table public.task_columns add constraint task_columns_owner_board_key
  unique nulls not distinct (user_id, board_id, key);
create index if not exists task_columns_board_position_idx on public.task_columns(board_id, position);

create or replace function public.keep_task_column_board()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.board_id is distinct from old.board_id or new.user_id is distinct from old.user_id then
    raise exception 'Task column board and owner cannot be changed';
  end if;
  return new;
end $$;
drop trigger if exists task_columns_keep_board on public.task_columns;
create trigger task_columns_keep_board before update on public.task_columns
  for each row execute function public.keep_task_column_board();

-- Scope validation, now board-aware. Personal tasks keep the 037 rules exactly.
create or replace function public.validate_personal_task_scope()
returns trigger language plpgsql security definer set search_path = public as $task_scope$
declare v_board public.task_boards;
begin
  if tg_op = 'UPDATE' and (new.board_id is distinct from old.board_id or new.user_id is distinct from old.user_id) then
    raise exception 'Task board and owner cannot be changed';
  end if;
  if new.board_id is not null then
    select * into v_board from public.task_boards where id = new.board_id;
    if not found then raise exception 'Task board not found'; end if;
    if v_board.client_id is not null then new.client_id := v_board.client_id; end if;
    if v_board.project_id is not null then new.project_id := v_board.project_id; end if;
    if new.client_id is not null and not exists (select 1 from public.clients c
      where c.id = new.client_id and c.workspace_id = v_board.workspace_id) then
      raise exception 'Task client must belong to the board workspace';
    end if;
    if new.project_id is not null and not exists (select 1 from public.projects p
      join public.clients c on c.id = p.client_id
      where p.id = new.project_id and c.workspace_id = v_board.workspace_id
        and (new.client_id is null or p.client_id = new.client_id)) then
      raise exception 'Task project must belong to the board workspace and client';
    end if;
    if new.chat_id is not null and (tg_op = 'INSERT' or new.chat_id is distinct from old.chat_id)
      and not exists (select 1 from public.chats c
        where c.id = new.chat_id and c.user_id = auth.uid()
          and (new.client_id is null or c.client_id = new.client_id)) then
      raise exception 'Task session must belong to the person linking it and to the client';
    end if;
    if new.assignee_id is not null and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
      and not exists (select 1 from public.task_board_members m
        where m.board_id = new.board_id and m.user_id = new.assignee_id) then
      raise exception 'Assignee must be a member of the board';
    end if;
  else
    if new.project_id is not null and not exists (select 1 from public.projects p
      where p.id = new.project_id and p.user_id = new.user_id and (new.client_id is null or p.client_id = new.client_id)) then
      raise exception 'Task project must belong to its owner and client';
    end if;
    if new.chat_id is not null and not exists (select 1 from public.chats c
      where c.id = new.chat_id and c.user_id = new.user_id and (new.client_id is null or c.client_id = new.client_id)) then
      raise exception 'Task session must belong to its owner and client';
    end if;
    new.assignee_id := null;
  end if;
  if new.client_id is null then new.module_id := null; new.folder_id := null; end if;
  if new.module_id is null then new.folder_id := null; end if;
  if new.module_id is not null and not exists (select 1 from public.client_modules m
    where m.id = new.module_id and m.client_id = new.client_id) then
    raise exception 'Task module must belong to the selected client';
  end if;
  if new.folder_id is not null and not exists (select 1 from public.client_folders f
    where f.id = new.folder_id and f.client_id = new.client_id and f.module_id = new.module_id) then
    raise exception 'Task folder must belong to the selected module';
  end if;
  if tg_op = 'UPDATE' and new.client_id is distinct from old.client_id and new.client_id is not null
    and exists (select 1 from public.task_subtasks s join public.chats c on c.id = s.chat_id
      where s.task_id = new.id and c.client_id is distinct from new.client_id) then
    raise exception 'Existing subtask sessions belong to another client';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by, new.user_id);
  end if;
  if new.assignee_id is distinct from (case when tg_op = 'UPDATE' then old.assignee_id end) then
    new.assigned_at := case when new.assignee_id is null then null else now() end;
  end if;
  return new;
end;
$task_scope$;

create or replace function public.validate_personal_subtask_session()
returns trigger language plpgsql security definer set search_path = public as $subtask_session$
declare v_task public.tasks;
begin
  select * into v_task from public.tasks where id = new.task_id;
  if not found then raise exception 'Subtask parent task not found'; end if;
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'Subtask creator cannot be changed';
  end if;
  if v_task.board_id is null then
    if v_task.user_id <> new.user_id then
      raise exception 'Subtask must belong to its parent task owner';
    end if;
    if new.chat_id is not null and not exists (select 1 from public.chats c
      where c.id = new.chat_id and c.user_id = new.user_id
        and (v_task.client_id is null or c.client_id = v_task.client_id)) then
      raise exception 'Subtask session must belong to its owner and client';
    end if;
  else
    if tg_op = 'INSERT' and new.user_id is distinct from auth.uid() then
      raise exception 'Subtask creator must be the current user';
    end if;
    if new.chat_id is not null and (tg_op = 'INSERT' or new.chat_id is distinct from old.chat_id)
      and not exists (select 1 from public.chats c
        where c.id = new.chat_id and c.user_id = auth.uid()
          and (v_task.client_id is null or c.client_id = v_task.client_id)) then
      raise exception 'Subtask session must belong to the person linking it and to the client';
    end if;
  end if;
  return new;
end;
$subtask_session$;

-- ---------------------------------------------------------------- history and comments

create table if not exists public.task_events (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.task_boards(id) on delete cascade,
  task_id uuid,
  task_title text not null,
  actor_id uuid references auth.users(id) on delete set null,
  type text not null check (type in ('created', 'moved', 'assigned', 'updated', 'subtask', 'deleted')),
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists task_events_board_idx on public.task_events(board_id, created_at desc);
create index if not exists task_events_task_idx on public.task_events(task_id, created_at desc);

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  board_id uuid not null references public.task_boards(id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists task_comments_task_idx on public.task_comments(task_id, created_at);

create or replace function public.prepare_task_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_board uuid;
begin
  select board_id into v_board from public.tasks where id = new.task_id;
  if v_board is null then raise exception 'Comments exist only on shared board tasks'; end if;
  new.board_id := v_board;
  new.author_id := auth.uid();
  return new;
end $$;
drop trigger if exists task_comments_prepare on public.task_comments;
create trigger task_comments_prepare before insert on public.task_comments
  for each row execute function public.prepare_task_comment();

create or replace function public.log_task_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid(); v_fields text[] := '{}';
begin
  if tg_op = 'INSERT' then
    if new.board_id is not null then
      insert into public.task_events(board_id, task_id, task_title, actor_id, type, data)
      values (new.board_id, new.id, new.title, v_actor, 'created', jsonb_build_object('status', new.status));
    end if;
  elsif tg_op = 'UPDATE' then
    if new.board_id is null then return new; end if;
    if new.status is distinct from old.status then
      insert into public.task_events(board_id, task_id, task_title, actor_id, type, data)
      values (new.board_id, new.id, new.title, v_actor, 'moved', jsonb_build_object('from', old.status, 'to', new.status));
    end if;
    if new.assignee_id is distinct from old.assignee_id then
      insert into public.task_events(board_id, task_id, task_title, actor_id, type, data)
      values (new.board_id, new.id, new.title, v_actor, 'assigned', jsonb_build_object('from', old.assignee_id, 'to', new.assignee_id));
    end if;
    if new.title is distinct from old.title then v_fields := v_fields || 'title'; end if;
    if new.priority is distinct from old.priority then v_fields := v_fields || 'priority'; end if;
    if new.due_date is distinct from old.due_date then v_fields := v_fields || 'due_date'; end if;
    if new.description is distinct from old.description then v_fields := v_fields || 'description'; end if;
    if array_length(v_fields, 1) > 0 then
      insert into public.task_events(board_id, task_id, task_title, actor_id, type, data)
      values (new.board_id, new.id, new.title, v_actor, 'updated', jsonb_build_object('fields', to_jsonb(v_fields)));
    end if;
  else
    -- During a board cascade the board row is already gone: skip, the events go with it.
    if old.board_id is not null and exists (select 1 from public.task_boards where id = old.board_id) then
      insert into public.task_events(board_id, task_id, task_title, actor_id, type, data)
      values (old.board_id, old.id, old.title, v_actor, 'deleted', '{}');
    end if;
    return old;
  end if;
  return new;
end $$;
drop trigger if exists tasks_log_event on public.tasks;
create trigger tasks_log_event after insert or update or delete on public.tasks
  for each row execute function public.log_task_event();

create or replace function public.log_subtask_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_task public.tasks;
begin
  if new.completed is distinct from old.completed then
    select * into v_task from public.tasks where id = new.task_id;
    if found and v_task.board_id is not null then
      insert into public.task_events(board_id, task_id, task_title, actor_id, type, data)
      values (v_task.board_id, v_task.id, v_task.title, auth.uid(), 'subtask',
        jsonb_build_object('title', new.title, 'completed', new.completed));
    end if;
  end if;
  return new;
end $$;
drop trigger if exists task_subtasks_log_event on public.task_subtasks;
create trigger task_subtasks_log_event after update on public.task_subtasks
  for each row execute function public.log_subtask_event();

-- Leaving a board releases the person's tasks (skipped when the board itself is being deleted).
create or replace function public.release_member_tasks()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.task_boards where id = old.board_id) then
    update public.tasks set assignee_id = null where board_id = old.board_id and assignee_id = old.user_id;
  end if;
  return old;
end $$;
drop trigger if exists task_board_members_release on public.task_board_members;
create trigger task_board_members_release after delete on public.task_board_members
  for each row execute function public.release_member_tasks();

-- ---------------------------------------------------------------- RPCs

create or replace function public.create_task_board(
  p_name text, p_client uuid default null, p_project uuid default null, p_members uuid[] default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_ws uuid; v_id uuid; v_client uuid := p_client; v_project_client uuid;
begin
  select m.workspace_id into v_ws from public.workspace_members m where m.user_id = auth.uid() limit 1;
  if v_ws is null then raise exception 'Workspace required'; end if;
  if p_project is not null then
    select p.client_id into v_project_client from public.projects p
      join public.clients c on c.id = p.client_id where p.id = p_project and c.workspace_id = v_ws;
    if v_project_client is null then raise exception 'Project not found in the workspace'; end if;
    if v_client is not null and v_client <> v_project_client then
      raise exception 'Project belongs to another client';
    end if;
    v_client := v_project_client;
  end if;
  if v_client is not null and not exists (select 1 from public.clients where id = v_client and workspace_id = v_ws) then
    raise exception 'Client not found in the workspace';
  end if;
  insert into public.task_boards(workspace_id, client_id, project_id, name, created_by)
  values (v_ws, v_client, p_project, trim(p_name), auth.uid()) returning id into v_id;
  insert into public.task_board_members(board_id, user_id, added_by)
  select v_id, u, auth.uid() from (
    select auth.uid() as u union
    select w.user_id from public.workspace_members w
    where w.workspace_id = v_ws and w.user_id = any (coalesce(p_members, '{}'))) s
  on conflict do nothing;
  insert into public.task_columns(user_id, board_id, key, name, description, color, position, is_done, is_blocked)
  values
    (auth.uid(), v_id, 'todo', 'A fazer', 'Trabalhos planejados', '#5b738b', 1000, false, false),
    (auth.uid(), v_id, 'in_progress', 'Em andamento', 'Execução atual', '#0070f2', 2000, false, false),
    (auth.uid(), v_id, 'blocked', 'Bloqueado', 'Aguardando resolução', '#e76500', 3000, false, true),
    (auth.uid(), v_id, 'done', 'Concluído', 'Trabalhos finalizados', '#188918', 4000, true, false);
  return v_id;
end $$;

-- Atomic: only the first caller wins an unassigned task.
create or replace function public.claim_task(p_task uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_board uuid; v_rows int;
begin
  select board_id into v_board from public.tasks where id = p_task;
  if v_board is null or not public.is_task_board_member(v_board) then
    raise exception 'Board member required';
  end if;
  update public.tasks set assignee_id = auth.uid() where id = p_task and assignee_id is null;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end $$;

create or replace function public.release_task(p_task uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_board uuid; v_rows int;
begin
  select board_id into v_board from public.tasks where id = p_task;
  if v_board is null or not public.is_task_board_member(v_board) then
    raise exception 'Board member required';
  end if;
  update public.tasks set assignee_id = null where id = p_task and assignee_id = auth.uid();
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end $$;

-- ---------------------------------------------------------------- RLS

alter table public.task_boards enable row level security;
alter table public.task_board_members enable row level security;
alter table public.task_events enable row level security;
alter table public.task_comments enable row level security;

drop policy if exists task_boards_select on public.task_boards;
create policy task_boards_select on public.task_boards for select to authenticated
  using (public.is_task_board_member(id) or public.is_workspace_admin(workspace_id));
drop policy if exists task_boards_update on public.task_boards;
create policy task_boards_update on public.task_boards for update to authenticated
  using (public.is_task_board_member(id)) with check (public.is_task_board_member(id));
drop policy if exists task_boards_delete on public.task_boards;
create policy task_boards_delete on public.task_boards for delete to authenticated
  using (public.is_workspace_admin(workspace_id));

drop policy if exists task_board_members_select on public.task_board_members;
create policy task_board_members_select on public.task_board_members for select to authenticated
  using (public.is_task_board_member(board_id) or public.is_workspace_admin(public.task_board_workspace(board_id)));
drop policy if exists task_board_members_insert on public.task_board_members;
create policy task_board_members_insert on public.task_board_members for insert to authenticated
  with check (
    added_by = auth.uid()
    and (public.is_task_board_member(board_id) or public.is_workspace_admin(public.task_board_workspace(board_id)))
    and exists (select 1 from public.workspace_members w
      where w.workspace_id = public.task_board_workspace(board_id) and w.user_id = task_board_members.user_id));
drop policy if exists task_board_members_delete on public.task_board_members;
create policy task_board_members_delete on public.task_board_members for delete to authenticated
  using (
    user_id = auth.uid()
    or public.is_workspace_admin(public.task_board_workspace(board_id))
    or exists (select 1 from public.task_boards b where b.id = board_id and b.created_by = auth.uid()));

drop policy if exists task_events_select on public.task_events;
create policy task_events_select on public.task_events for select to authenticated
  using (public.is_task_board_member(board_id));

drop policy if exists task_comments_select on public.task_comments;
create policy task_comments_select on public.task_comments for select to authenticated
  using (public.is_task_board_member(board_id));
drop policy if exists task_comments_insert on public.task_comments;
create policy task_comments_insert on public.task_comments for insert to authenticated
  with check (author_id = auth.uid() and public.can_access_task(task_id));
drop policy if exists task_comments_delete on public.task_comments;
create policy task_comments_delete on public.task_comments for delete to authenticated
  using (author_id = auth.uid() or public.is_workspace_admin(public.task_board_workspace(board_id)));

-- Tasks: personal rows stay owner-only; board rows belong to every board member.
drop policy if exists "tasks_select_own" on public.tasks;
create policy "tasks_select_own" on public.tasks for select to authenticated
  using ((board_id is null and auth.uid() = user_id) or (board_id is not null and public.is_task_board_member(board_id)));
drop policy if exists "tasks_insert_own" on public.tasks;
create policy "tasks_insert_own" on public.tasks for insert to authenticated
  with check (auth.uid() = user_id and (board_id is null or public.is_task_board_member(board_id)));
drop policy if exists "tasks_update_own" on public.tasks;
create policy "tasks_update_own" on public.tasks for update to authenticated
  using ((board_id is null and auth.uid() = user_id) or (board_id is not null and public.is_task_board_member(board_id)))
  with check ((board_id is null and auth.uid() = user_id) or (board_id is not null and public.is_task_board_member(board_id)));
drop policy if exists "tasks_delete_own" on public.tasks;
create policy "tasks_delete_own" on public.tasks for delete to authenticated
  using ((board_id is null and auth.uid() = user_id) or (board_id is not null and public.is_task_board_member(board_id)));

-- Subtasks follow their parent task.
drop policy if exists "task_subtasks_select_own" on public.task_subtasks;
create policy "task_subtasks_select_own" on public.task_subtasks for select to authenticated
  using (public.can_access_task(task_id));
drop policy if exists "task_subtasks_insert_own" on public.task_subtasks;
create policy "task_subtasks_insert_own" on public.task_subtasks for insert to authenticated
  with check (auth.uid() = user_id and public.can_access_task(task_id));
drop policy if exists "task_subtasks_update_own" on public.task_subtasks;
create policy "task_subtasks_update_own" on public.task_subtasks for update to authenticated
  using (public.can_access_task(task_id)) with check (public.can_access_task(task_id));
drop policy if exists "task_subtasks_delete_own" on public.task_subtasks;
create policy "task_subtasks_delete_own" on public.task_subtasks for delete to authenticated
  using (public.can_access_task(task_id));

-- Columns: personal per user; board columns shared, deleted only by workspace OWNER/ADMIN.
drop policy if exists "task_columns_select_own" on public.task_columns;
create policy "task_columns_select_own" on public.task_columns for select to authenticated
  using ((board_id is null and auth.uid() = user_id)
    or (board_id is not null and (public.is_task_board_member(board_id)
      or public.is_workspace_admin(public.task_board_workspace(board_id)))));  -- admins need it to delete columns
drop policy if exists "task_columns_insert_own" on public.task_columns;
create policy "task_columns_insert_own" on public.task_columns for insert to authenticated
  with check (auth.uid() = user_id and (board_id is null or public.is_task_board_member(board_id)));
drop policy if exists "task_columns_update_own" on public.task_columns;
create policy "task_columns_update_own" on public.task_columns for update to authenticated
  using ((board_id is null and auth.uid() = user_id) or (board_id is not null and public.is_task_board_member(board_id)))
  with check ((board_id is null and auth.uid() = user_id) or (board_id is not null and public.is_task_board_member(board_id)));
drop policy if exists "task_columns_delete_own" on public.task_columns;
create policy "task_columns_delete_own" on public.task_columns for delete to authenticated
  using ((board_id is null and auth.uid() = user_id)
    or (board_id is not null and public.is_workspace_admin(public.task_board_workspace(board_id))));

grant select, insert, update, delete on public.task_boards, public.task_board_members,
  public.task_comments to authenticated;
grant select on public.task_events to authenticated;

do $$
declare f text;
begin
  foreach f in array array['task_board_workspace(uuid)', 'is_task_board_member(uuid)', 'can_access_task(uuid)',
    'create_task_board(text,uuid,uuid,uuid[])', 'claim_task(uuid)', 'release_task(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------- Realtime

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['tasks', 'task_subtasks', 'task_columns', 'task_boards',
      'task_board_members', 'task_events', 'task_comments'] loop
      if not exists (select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

commit;
