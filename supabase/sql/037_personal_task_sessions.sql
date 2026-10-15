-- Apply after 036 and existing Kanban RLS. Client links do not grant task access.
begin;
alter table public.tasks add column client_id uuid references public.clients(id) on delete set null;
alter table public.tasks add column module_id uuid references public.client_modules(id) on delete set null;
alter table public.tasks add column folder_id uuid references public.client_folders(id) on delete set null;
alter table public.task_subtasks add column chat_id uuid references public.chats(id) on delete set null;
create index tasks_user_client_status on public.tasks(user_id, client_id, status);
-- Recover the client context of existing linked sessions/projects.
update public.tasks t set client_id = c.client_id, module_id = c.module_id, folder_id = c.folder_id
  from public.chats c where t.chat_id = c.id and t.user_id = c.user_id;
update public.tasks t set client_id = p.client_id from public.projects p
  where t.project_id = p.id and t.user_id = p.user_id and t.client_id is null;
create or replace function public.validate_personal_task_scope()
returns trigger language plpgsql set search_path = public as $task_scope$
begin
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
  if new.project_id is not null and not exists (select 1 from public.projects p
    where p.id = new.project_id and p.user_id = new.user_id and (new.client_id is null or p.client_id = new.client_id)) then
    raise exception 'Task project must belong to its owner and client';
  end if;
  if new.chat_id is not null and not exists (select 1 from public.chats c
    where c.id = new.chat_id and c.user_id = new.user_id and (new.client_id is null or c.client_id = new.client_id)) then
    raise exception 'Task session must belong to its owner and client';
  end if;
  if tg_op = 'UPDATE' and new.client_id is distinct from old.client_id and new.client_id is not null
    and exists (select 1 from public.task_subtasks s join public.chats c on c.id = s.chat_id
      where s.task_id = new.id and c.client_id is distinct from new.client_id) then
    raise exception 'Existing subtask sessions belong to another client';
  end if;
  return new;
end;
$task_scope$;
create trigger tasks_validate_scope before insert or update on public.tasks
  for each row execute function public.validate_personal_task_scope();
create or replace function public.validate_personal_subtask_session()
returns trigger language plpgsql set search_path = public as $subtask_session$
begin
  if not exists (select 1 from public.tasks t where t.id = new.task_id and t.user_id = new.user_id) then
    raise exception 'Subtask must belong to its parent task owner';
  end if;
  if new.chat_id is not null and not exists (select 1 from public.chats c join public.tasks t on t.id = new.task_id
    where c.id = new.chat_id and c.user_id = new.user_id and (t.client_id is null or c.client_id = t.client_id)) then
    raise exception 'Subtask session must belong to its owner and client';
  end if;
  return new;
end;
$subtask_session$;
create trigger subtasks_validate_session before insert or update on public.task_subtasks
  for each row execute function public.validate_personal_subtask_session();
commit;
