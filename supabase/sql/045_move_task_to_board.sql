-- Abapfy — mover uma tarefa pessoal para um quadro em grupo.
-- Aplicar depois da 044. Pode ser executada mais de uma vez.
--
-- move_task_to_board(task, board): só o dono move a própria tarefa pessoal, para um quadro do qual
-- é membro. A tarefa mantém id, subtarefas, sessões e comentários de vínculo. Mudam:
--   * a coluna é mapeada: mesma chave se existir no quadro; senão pela natureza (concluída,
--     bloqueada ou a primeira coluna aberta);
--   * o responsável fica livre e as dependências são removidas (apontam para o quadro pessoal);
--   * o cliente e o projeto do quadro, quando fixos, precisam coincidir com os da tarefa.
-- Mover de volta não é permitido: o board_id continua imutável fora desta função.

begin;

-- validate_personal_task_scope: igual à 044, com a exceção controlada para a função de mover.
create or replace function public.validate_personal_task_scope()
returns trigger language plpgsql security definer set search_path = public as $task_scope$
declare v_board public.task_boards;
        v_moving boolean := coalesce(current_setting('abapfy.moving_task', true), '') = 'on';
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'Task board and owner cannot be changed';
  end if;
  if tg_op = 'UPDATE' and new.board_id is distinct from old.board_id
    and not (v_moving and old.board_id is null) then
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

-- Histórico: mover para um quadro conta como criação ali (com a marca de origem pessoal).
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
    if old.board_id is null then
      insert into public.task_events(board_id, task_id, task_title, actor_id, type, data)
      values (new.board_id, new.id, new.title, v_actor, 'created',
        jsonb_build_object('status', new.status, 'from_personal', true));
      return new;
    end if;
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
    if old.board_id is not null and exists (select 1 from public.task_boards where id = old.board_id) then
      insert into public.task_events(board_id, task_id, task_title, actor_id, type, data)
      values (old.board_id, old.id, old.title, v_actor, 'deleted', '{}');
    end if;
    return old;
  end if;
  return new;
end $$;

create or replace function public.move_task_to_board(p_task uuid, p_board uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_task public.tasks;
  v_board public.task_boards;
  v_old_column public.task_columns;
  v_target text;
  v_position bigint;
begin
  select * into v_task from public.tasks where id = p_task;
  if not found or v_task.board_id is not null or v_task.user_id <> auth.uid() then
    raise exception 'Only the owner can move a personal task';
  end if;
  select * into v_board from public.task_boards where id = p_board;
  if not found or not public.is_task_board_member(p_board) then
    raise exception 'Board member required';
  end if;
  if v_board.client_id is not null and v_task.client_id is not null and v_task.client_id <> v_board.client_id then
    raise exception 'Task belongs to another client than the board';
  end if;
  if v_board.project_id is not null and v_task.project_id is not null and v_task.project_id <> v_board.project_id then
    raise exception 'Task belongs to another project than the board';
  end if;

  select * into v_old_column from public.task_columns
    where user_id = v_task.user_id and board_id is null and key = v_task.status;
  select key into v_target from public.task_columns where board_id = p_board and key = v_task.status;
  if v_target is null then
    select key into v_target from public.task_columns
      where board_id = p_board
        and is_done = coalesce(v_old_column.is_done, false)
        and is_blocked = coalesce(v_old_column.is_blocked, false)
      order by position limit 1;
  end if;
  if v_target is null then
    select key into v_target from public.task_columns
      where board_id = p_board and not is_done and not is_blocked order by position limit 1;
  end if;
  if v_target is null then
    select key into v_target from public.task_columns where board_id = p_board order by position limit 1;
  end if;
  if v_target is null then raise exception 'Board has no columns'; end if;

  select coalesce(max(position), 0) + 1000 into v_position from public.tasks
    where board_id = p_board and status = v_target;

  perform set_config('abapfy.moving_task', 'on', true);
  update public.tasks set board_id = p_board, status = v_target, position = v_position,
    assignee_id = null, assignee = null, dependency_ids = '{}'
  where id = p_task;
  perform set_config('abapfy.moving_task', 'off', true);
  return p_task;
end $$;

revoke all on function public.move_task_to_board(uuid, uuid) from public, anon;
grant execute on function public.move_task_to_board(uuid, uuid) to authenticated;

commit;
