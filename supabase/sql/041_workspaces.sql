-- Apply after 040, in the Supabase SQL Editor. Safe to run more than once.
--
-- Workspaces: a workspace groups people (OWNER / ADMIN / MEMBER) and owns clients.
-- Projects, chats, drive files and project knowledge belong to a client and therefore
-- inherit the workspace boundary.
--
-- Decisions
--  * One workspace per user (unique(user_id)); the constraint can be dropped later.
--  * A new user either creates a workspace or asks to join one with its join code.
--    OWNER/ADMIN of that workspace approve or reject the request.
--  * Existing users are migrated into the workspace "Geral" keeping their hierarchy:
--    app_roles MASTER -> OWNER, ADMIN -> ADMIN, everyone else -> MEMBER.
--  * public.app_roles keeps its platform meaning (global catalogs, AI keys, news).
--    It is NOT synchronised with workspace roles: a workspace admin created by a new
--    user must not become a platform administrator.
--  * Isolation is added with RESTRICTIVE policies, so every existing permissive policy
--    keeps working and is additionally filtered by workspace membership.

begin;

-- ---------------------------------------------------------------- tables

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 80),
  join_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.workspaces is 'Group of people and clients. Join code lets a user request entry.';
drop trigger if exists workspaces_updated on public.workspaces;
create trigger workspaces_updated before update on public.workspaces
  for each row execute function public.set_updated_at();

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'MEMBER' check (role in ('OWNER', 'ADMIN', 'MEMBER')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id),
  unique (user_id)
);
create index if not exists workspace_members_user_idx on public.workspace_members(user_id);

create table if not exists public.workspace_join_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  message text check (message is null or length(message) <= 300),
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists workspace_join_requests_pending
  on public.workspace_join_requests(workspace_id, user_id) where status = 'PENDING';
create index if not exists workspace_join_requests_user_idx on public.workspace_join_requests(user_id);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_join_requests enable row level security;

-- ---------------------------------------------------------------- helpers
-- SECURITY DEFINER so policies never recurse into the RLS of the tables they read.

create or replace function public.is_workspace_member(p_workspace uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.workspace_members
  where workspace_id = p_workspace and user_id = auth.uid()) $$;

create or replace function public.is_workspace_admin(p_workspace uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.workspace_members
  where workspace_id = p_workspace and user_id = auth.uid() and role in ('OWNER', 'ADMIN')) $$;

create or replace function public.is_workspace_owner(p_workspace uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.workspace_members
  where workspace_id = p_workspace and user_id = auth.uid() and role = 'OWNER') $$;

-- Added to clients below; functions are created first and resolved at call time.
alter table public.clients add column if not exists workspace_id uuid references public.workspaces(id);

create or replace function public.can_access_client(p_client uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (
  select 1 from public.clients c
  join public.workspace_members m on m.workspace_id = c.workspace_id
  where c.id = p_client and m.user_id = auth.uid()) $$;

create or replace function public.can_admin_client(p_client uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (
  select 1 from public.clients c
  join public.workspace_members m on m.workspace_id = c.workspace_id
  where c.id = p_client and m.user_id = auth.uid() and m.role in ('OWNER', 'ADMIN')) $$;

create or replace function public.can_access_chat(p_chat uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.chats ch
  where ch.id = p_chat and public.can_access_client(ch.client_id)) $$;

create or replace function public.can_access_project(p_project uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.projects p
  where p.id = p_project and public.can_access_client(p.client_id)) $$;

-- Storage objects of bucket client-files live under "<client_id>/<module_id>/<file>".
create or replace function public.client_id_from_path(p_path text)
returns uuid language sql immutable set search_path = ''
as $$ select case when (storage.foldername(p_path))[1] ~
  '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then (storage.foldername(p_path))[1]::uuid end $$;

create or replace function public.can_access_client_path(p_path text)
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.can_access_client(public.client_id_from_path(p_path)), false) $$;

create or replace function public.can_admin_client_path(p_path text)
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.can_admin_client(public.client_id_from_path(p_path)), false) $$;

revoke all on function public.is_workspace_member(uuid), public.is_workspace_admin(uuid),
  public.is_workspace_owner(uuid), public.can_access_client(uuid), public.can_admin_client(uuid),
  public.can_access_chat(uuid), public.can_access_project(uuid), public.client_id_from_path(text),
  public.can_access_client_path(text), public.can_admin_client_path(text) from public, anon;
grant execute on function public.is_workspace_member(uuid), public.is_workspace_admin(uuid),
  public.is_workspace_owner(uuid), public.can_access_client(uuid), public.can_admin_client(uuid),
  public.can_access_chat(uuid), public.can_access_project(uuid), public.client_id_from_path(text),
  public.can_access_client_path(text), public.can_admin_client_path(text) to authenticated;

-- ---------------------------------------------------------------- migrate existing users
-- Runs only while no workspace exists, so re-running never duplicates or reshuffles anything.

do $$
declare
  v_workspace uuid;
  v_creator uuid;
begin
  if exists (select 1 from public.workspaces) then return; end if;
  if not exists (select 1 from auth.users) and not exists (select 1 from public.clients) then return; end if;

  select r.user_id into v_creator from public.app_roles r
    where r.role = 'MASTER' order by r.granted_at, r.user_id limit 1;
  if v_creator is null then
    select r.user_id into v_creator from public.app_roles r
      where r.role = 'ADMIN' order by r.granted_at, r.user_id limit 1;
  end if;
  if v_creator is null then
    select u.id into v_creator from auth.users u order by u.created_at, u.id limit 1;
  end if;

  insert into public.workspaces(name, created_by) values ('Geral', v_creator) returning id into v_workspace;

  insert into public.workspace_members(workspace_id, user_id, role)
  select v_workspace, u.id,
    case
      when r.role = 'MASTER' then 'OWNER'
      when r.role = 'ADMIN' then 'ADMIN'
      when u.id = v_creator then 'OWNER'  -- no MASTER/ADMIN at all: oldest user owns the workspace
      else 'MEMBER'
    end
  from auth.users u left join public.app_roles r on r.user_id = u.id
  on conflict do nothing;
end $$;

update public.clients set workspace_id = (select id from public.workspaces order by created_at, id limit 1)
  where workspace_id is null and exists (select 1 from public.workspaces);

-- New clients default to the workspace of the creator (the app sends it explicitly).
create or replace function public.default_client_workspace()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.workspace_id is null then
    select m.workspace_id into new.workspace_id from public.workspace_members m
      where m.user_id = coalesce(new.created_by, auth.uid()) limit 1;
  end if;
  if new.workspace_id is null then raise exception 'Workspace required to create a client'; end if;
  return new;
end $$;
drop trigger if exists clients_default_workspace on public.clients;
create trigger clients_default_workspace before insert on public.clients
  for each row execute function public.default_client_workspace();

do $$
begin
  if not exists (select 1 from public.clients where workspace_id is null) then
    alter table public.clients alter column workspace_id set not null;
  end if;
end $$;

-- Client names are unique inside a workspace, not across the whole database.
alter table public.clients drop constraint if exists clients_name_key;
create unique index if not exists clients_workspace_name_key on public.clients(workspace_id, name);
create index if not exists clients_workspace_idx on public.clients(workspace_id);

create or replace function public.keep_client_workspace()
returns trigger language plpgsql as $$
begin
  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'Client workspace cannot be changed';
  end if;
  return new;
end $$;
drop trigger if exists clients_keep_workspace on public.clients;
create trigger clients_keep_workspace before update on public.clients
  for each row execute function public.keep_client_workspace();

-- ---------------------------------------------------------------- policies: workspace tables

drop policy if exists workspaces_read on public.workspaces;
create policy workspaces_read on public.workspaces for select to authenticated
  using (public.is_workspace_member(id));
drop policy if exists workspaces_update on public.workspaces;
create policy workspaces_update on public.workspaces for update to authenticated
  using (public.is_workspace_admin(id)) with check (public.is_workspace_admin(id));

drop policy if exists workspace_members_read on public.workspace_members;
create policy workspace_members_read on public.workspace_members for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists workspace_join_requests_read on public.workspace_join_requests;
create policy workspace_join_requests_read on public.workspace_join_requests for select to authenticated
  using (user_id = auth.uid() or public.is_workspace_admin(workspace_id));

-- Writes to members / requests go through the RPCs below only.
revoke all on public.workspaces, public.workspace_members, public.workspace_join_requests from anon;
revoke insert, delete on public.workspaces from authenticated;
revoke insert, update, delete on public.workspace_members, public.workspace_join_requests from authenticated;
grant select on public.workspace_members, public.workspace_join_requests to authenticated;
-- join_code is deliberately excluded: plain members must not read it. OWNER/ADMIN get it from my_workspace().
revoke select on public.workspaces from authenticated;
grant select (id, name, created_by, created_at, updated_at) on public.workspaces to authenticated;
grant update (name) on public.workspaces to authenticated;

-- ---------------------------------------------------------------- policies: content isolation

-- clients: restrictive membership filter + workspace-admin writes (replaces platform-admin writes).
drop policy if exists clients_workspace_isolation on public.clients;
create policy clients_workspace_isolation on public.clients as restrictive for all to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
drop policy if exists clients_insert on public.clients;
create policy clients_insert on public.clients for insert to authenticated
  with check (public.is_workspace_admin(workspace_id) and created_by = auth.uid());
drop policy if exists clients_update on public.clients;
create policy clients_update on public.clients for update to authenticated
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id) and updated_by = auth.uid());
drop policy if exists clients_delete on public.clients;
create policy clients_delete on public.clients for delete to authenticated
  using (public.is_workspace_admin(workspace_id));

-- client_modules: same shape, scoped by client.
drop policy if exists client_modules_workspace_isolation on public.client_modules;
create policy client_modules_workspace_isolation on public.client_modules as restrictive for all to authenticated
  using (public.can_access_client(client_id)) with check (public.can_access_client(client_id));
drop policy if exists client_modules_insert on public.client_modules;
create policy client_modules_insert on public.client_modules for insert to authenticated
  with check (public.can_admin_client(client_id) and created_by = auth.uid());
drop policy if exists client_modules_update on public.client_modules;
create policy client_modules_update on public.client_modules for update to authenticated
  using (public.can_admin_client(client_id)) with check (public.can_admin_client(client_id));
drop policy if exists client_modules_delete on public.client_modules;
create policy client_modules_delete on public.client_modules for delete to authenticated
  using (public.can_admin_client(client_id));

-- Tables that carry client_id directly.
do $$
declare t text;
begin
  foreach t in array array['client_files', 'client_folders', 'client_file_events',
                           'client_work_presence', 'projects', 'chats'] loop
    execute format('drop policy if exists %I on public.%I', t || '_workspace_isolation', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated '
      'using (public.can_access_client(client_id)) with check (public.can_access_client(client_id))',
      t || '_workspace_isolation', t);
  end loop;
end $$;

drop policy if exists chat_messages_workspace_isolation on public.chat_messages;
create policy chat_messages_workspace_isolation on public.chat_messages as restrictive for all to authenticated
  using (public.can_access_chat(chat_id)) with check (public.can_access_chat(chat_id));

drop policy if exists project_documents_workspace_isolation on public.project_documents;
create policy project_documents_workspace_isolation on public.project_documents as restrictive for all to authenticated
  using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));
drop policy if exists project_document_chunks_workspace_isolation on public.project_document_chunks;
create policy project_document_chunks_workspace_isolation on public.project_document_chunks as restrictive for all to authenticated
  using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));

-- Trash: purge and orphan cleanup now require admin of the file's client workspace.
create or replace function public.guard_client_file_trash()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if not public.can_admin_client(old.client_id) then raise exception 'Only administrators can empty the trash'; end if;
    if old.deleted_at is null then raise exception 'Move the file to the trash before purging it'; end if;
    return old;
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    new.deleted_at := now();
    new.deleted_by := auth.uid();
  elsif old.deleted_at is not null and new.deleted_at is null then
    new.deleted_by := null;
  elsif new.deleted_at is distinct from old.deleted_at or new.deleted_by is distinct from old.deleted_by then
    raise exception 'Trash metadata cannot be edited directly';
  end if;
  return new;
end $$;

drop policy if exists client_files_delete_admin on public.client_files;
create policy client_files_delete_admin on public.client_files for delete to authenticated
  using (public.can_admin_client(client_id) and deleted_at is not null);

-- Storage (bucket client-files): isolation + admin purge scoped to the workspace.
drop policy if exists client_files_storage_workspace_isolation on storage.objects;
create policy client_files_storage_workspace_isolation on storage.objects as restrictive for all to authenticated
  using (case when bucket_id = 'client-files' then public.can_access_client_path(name) else true end)
  with check (case when bucket_id = 'client-files' then public.can_access_client_path(name) else true end);

drop policy if exists client_files_storage_delete_admin on storage.objects;
create policy client_files_storage_delete_admin on storage.objects for delete to authenticated
  using (bucket_id = 'client-files' and (
    (public.can_admin_client_path(storage.objects.name) and exists (
      select 1 from public.client_files f
      where f.storage_path = storage.objects.name and f.deleted_at is not null
    )) or
    (owner_id = auth.uid()::text and not exists (
      select 1 from public.client_files f where f.storage_path = storage.objects.name
    ))
  ));

-- ---------------------------------------------------------------- RPCs

create or replace function public.create_workspace(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Login required'; end if;
  if length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'Workspace name too short'; end if;
  if exists (select 1 from public.workspace_members where user_id = auth.uid()) then
    raise exception 'You already belong to a workspace';
  end if;
  insert into public.workspaces(name, created_by) values (btrim(p_name), auth.uid()) returning id into v_id;
  insert into public.workspace_members(workspace_id, user_id, role) values (v_id, auth.uid(), 'OWNER');
  update public.workspace_join_requests set status = 'CANCELLED', decided_at = now()
    where user_id = auth.uid() and status = 'PENDING';
  return v_id;
end $$;

create or replace function public.request_workspace_join(p_code text, p_message text default null)
returns table(request_id uuid, workspace_name text) language plpgsql security definer set search_path = public as $$
declare v_workspace public.workspaces%rowtype; v_request uuid;
begin
  if auth.uid() is null then raise exception 'Login required'; end if;
  if exists (select 1 from public.workspace_members where user_id = auth.uid()) then
    raise exception 'You already belong to a workspace';
  end if;
  select * into v_workspace from public.workspaces where join_code = upper(btrim(coalesce(p_code, '')));
  if not found then raise exception 'Invalid workspace code'; end if;
  if exists (select 1 from public.workspace_join_requests
    where workspace_id = v_workspace.id and user_id = auth.uid() and status = 'PENDING') then
    raise exception 'Request already pending';
  end if;
  insert into public.workspace_join_requests(workspace_id, user_id, message)
    values (v_workspace.id, auth.uid(), nullif(btrim(p_message), '')) returning id into v_request;
  return query select v_request, v_workspace.name;
end $$;

create or replace function public.cancel_workspace_join(p_request uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.workspace_join_requests set status = 'CANCELLED', decided_at = now()
    where id = p_request and user_id = auth.uid() and status = 'PENDING';
  return found;
end $$;

create or replace function public.my_workspace_join_requests()
returns table(id uuid, workspace_name text, status text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, w.name, r.status, r.created_at from public.workspace_join_requests r
  join public.workspaces w on w.id = r.workspace_id
  where r.user_id = auth.uid() order by r.created_at desc limit 20 $$;

create or replace function public.decide_workspace_join(p_request uuid, p_approve boolean, p_role text default 'MEMBER')
returns boolean language plpgsql security definer set search_path = public as $$
declare v_request public.workspace_join_requests%rowtype; v_role text := coalesce(p_role, 'MEMBER');
begin
  select * into v_request from public.workspace_join_requests where id = p_request and status = 'PENDING' for update;
  if not found then return false; end if;
  if not public.is_workspace_admin(v_request.workspace_id) then raise exception 'Workspace admin required'; end if;
  if v_role not in ('ADMIN', 'MEMBER') then raise exception 'Invalid role'; end if;
  if v_role = 'ADMIN' and not public.is_workspace_owner(v_request.workspace_id) then
    raise exception 'Only the owner can grant ADMIN';
  end if;
  if p_approve then
    if exists (select 1 from public.workspace_members where user_id = v_request.user_id) then
      update public.workspace_join_requests set status = 'CANCELLED', decided_by = auth.uid(), decided_at = now()
        where id = p_request;
      raise exception 'User already belongs to a workspace';
    end if;
    insert into public.workspace_members(workspace_id, user_id, role) values (v_request.workspace_id, v_request.user_id, v_role);
  end if;
  update public.workspace_join_requests
    set status = case when p_approve then 'APPROVED' else 'REJECTED' end,
        decided_by = auth.uid(), decided_at = now()
    where id = p_request;
  return true;
end $$;

create or replace function public.list_workspace_join_requests(p_workspace uuid)
returns table(id uuid, user_id uuid, nome text, email text, message text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_workspace_admin(p_workspace) then raise exception 'Workspace admin required'; end if;
  return query
    select r.id, r.user_id, p.nome, u.email::text, r.message, r.created_at
    from public.workspace_join_requests r
    join auth.users u on u.id = r.user_id
    left join public.profiles p on p.id = r.user_id
    where r.workspace_id = p_workspace and r.status = 'PENDING'
    order by r.created_at;
end $$;

create or replace function public.list_workspace_members(p_workspace uuid)
returns table(user_id uuid, nome text, cargo text, email text, role text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
declare v_admin boolean;
begin
  if not public.is_workspace_member(p_workspace) then raise exception 'Workspace member required'; end if;
  v_admin := public.is_workspace_admin(p_workspace);
  return query
    select m.user_id, p.nome, p.cargo, case when v_admin then u.email::text end, m.role, m.created_at
    from public.workspace_members m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.id = m.user_id
    where m.workspace_id = p_workspace
    order by case m.role when 'OWNER' then 0 when 'ADMIN' then 1 else 2 end, p.nome, u.email;
end $$;

create or replace function public.set_workspace_member_role(p_workspace uuid, p_user uuid, p_role text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_current text;
begin
  if not public.is_workspace_owner(p_workspace) then raise exception 'Only the owner can change roles'; end if;
  if p_role not in ('OWNER', 'ADMIN', 'MEMBER') then raise exception 'Invalid role'; end if;
  select role into v_current from public.workspace_members where workspace_id = p_workspace and user_id = p_user for update;
  if not found then return false; end if;
  if v_current = 'OWNER' and p_role <> 'OWNER' and
     (select count(*) from public.workspace_members where workspace_id = p_workspace and role = 'OWNER') <= 1 then
    raise exception 'Workspace needs at least one owner';
  end if;
  update public.workspace_members set role = p_role where workspace_id = p_workspace and user_id = p_user;
  return true;
end $$;

create or replace function public.remove_workspace_member(p_workspace uuid, p_user uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_role text;
begin
  select role into v_role from public.workspace_members where workspace_id = p_workspace and user_id = p_user for update;
  if not found then return false; end if;
  if p_user <> auth.uid() then
    if not public.is_workspace_admin(p_workspace) then raise exception 'Workspace admin required'; end if;
    if v_role = 'OWNER' then raise exception 'The owner cannot be removed'; end if;
    if v_role = 'ADMIN' and not public.is_workspace_owner(p_workspace) then
      raise exception 'Only the owner can remove an admin';
    end if;
  end if;
  if v_role = 'OWNER' and
     (select count(*) from public.workspace_members where workspace_id = p_workspace and role = 'OWNER') <= 1 then
    raise exception 'Workspace needs at least one owner';
  end if;
  delete from public.workspace_members where workspace_id = p_workspace and user_id = p_user;
  return true;
end $$;

create or replace function public.regenerate_workspace_join_code(p_workspace uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_code text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
begin
  if not public.is_workspace_admin(p_workspace) then raise exception 'Workspace admin required'; end if;
  update public.workspaces set join_code = v_code where id = p_workspace;
  return v_code;
end $$;

create or replace function public.my_workspace()
returns table(id uuid, name text, role text, join_code text)
language sql stable security definer set search_path = public as $$
  select w.id, w.name, m.role, case when m.role in ('OWNER', 'ADMIN') then w.join_code end
  from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
  where m.user_id = auth.uid() limit 1 $$;

do $$
declare f text;
begin
  foreach f in array array[
    'create_workspace(text)', 'request_workspace_join(text,text)', 'cancel_workspace_join(uuid)',
    'my_workspace_join_requests()', 'decide_workspace_join(uuid,boolean,text)',
    'list_workspace_join_requests(uuid)', 'list_workspace_members(uuid)',
    'set_workspace_member_role(uuid,uuid,text)', 'remove_workspace_member(uuid,uuid)',
    'regenerate_workspace_join_code(uuid)', 'my_workspace()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

commit;
