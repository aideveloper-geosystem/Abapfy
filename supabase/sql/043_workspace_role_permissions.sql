-- Apply after 042, in the Supabase SQL Editor. Safe to run more than once.
--
-- Role matrix inside a workspace (see docs/workspaces-e-nova-interface.md):
--
--                                   OWNER  ADMIN  MEMBER
--   read clients, modules, drive      yes    yes    yes
--   upload files to the drive         yes    yes    yes
--   create drive folders              yes    yes    yes   (upload flows create them)
--   create/edit clients, modules      yes    yes    no
--   archive / unarchive a client      yes    yes    no
--   create/edit projects              yes    yes    no
--   edit/move files, restore trash    yes    yes    no
--   delete clients, modules           yes    no     no
--   delete projects and folders       yes    no     no
--   move files to trash, purge        yes    no     no
--   remove members, change roles      yes    no     no   (members may leave on their own)
--   approve or reject join requests   yes    yes    no
--
-- Sessions (chats) stay open to every member: they are how people work.
-- Policies are replaced by name; the restrictive workspace-isolation policies of 041 still apply.

begin;

-- ---------------------------------------------------------------- columns and favorites

alter table public.clients add column if not exists archived_at timestamptz;
alter table public.clients add column if not exists archived_by uuid references auth.users(id) on delete set null;
create index if not exists clients_archived_idx on public.clients(workspace_id, archived_at);

create table if not exists public.client_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, client_id)
);
alter table public.client_favorites enable row level security;
drop policy if exists client_favorites_read on public.client_favorites;
create policy client_favorites_read on public.client_favorites for select to authenticated
  using (user_id = auth.uid());
drop policy if exists client_favorites_insert on public.client_favorites;
create policy client_favorites_insert on public.client_favorites for insert to authenticated
  with check (user_id = auth.uid() and public.can_access_client(client_id));
drop policy if exists client_favorites_delete on public.client_favorites;
create policy client_favorites_delete on public.client_favorites for delete to authenticated
  using (user_id = auth.uid());
revoke all on public.client_favorites from anon;
grant select, insert, delete on public.client_favorites to authenticated;

-- The archive author and time are always derived on the server, never taken from the client.
create or replace function public.stamp_client_archive()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.archived_at := null;
    new.archived_by := null;
  elsif new.archived_at is not distinct from old.archived_at then
    new.archived_by := old.archived_by;
  elsif new.archived_at is null then
    new.archived_by := null;
  else
    new.archived_at := now();
    new.archived_by := auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists clients_stamp_archive on public.clients;
create trigger clients_stamp_archive before insert or update on public.clients
  for each row execute function public.stamp_client_archive();

-- ---------------------------------------------------------------- role helpers

create or replace function public.workspace_role_of_client(p_client uuid)
returns text language sql stable security definer set search_path = public
as $$ select m.role from public.clients c
  join public.workspace_members m on m.workspace_id = c.workspace_id
  where c.id = p_client and m.user_id = auth.uid() $$;

-- OWNER and ADMIN: create and edit.
create or replace function public.can_edit_client(p_client uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.workspace_role_of_client(p_client) in ('OWNER', 'ADMIN'), false) $$;

-- OWNER only: delete, trash and purge.
create or replace function public.can_delete_client(p_client uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.workspace_role_of_client(p_client) = 'OWNER', false) $$;

create or replace function public.can_delete_client_path(p_path text)
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.can_delete_client(public.client_id_from_path(p_path)), false) $$;

revoke all on function public.workspace_role_of_client(uuid), public.can_edit_client(uuid),
  public.can_delete_client(uuid), public.can_delete_client_path(text) from public, anon;
grant execute on function public.workspace_role_of_client(uuid), public.can_edit_client(uuid),
  public.can_delete_client(uuid), public.can_delete_client_path(text) to authenticated;

-- ---------------------------------------------------------------- clients and modules

drop policy if exists clients_insert on public.clients;
create policy clients_insert on public.clients for insert to authenticated
  with check (public.is_workspace_admin(workspace_id) and created_by = auth.uid());
drop policy if exists clients_update on public.clients;
create policy clients_update on public.clients for update to authenticated
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id) and updated_by = auth.uid());
drop policy if exists clients_delete on public.clients;
create policy clients_delete on public.clients for delete to authenticated
  using (public.is_workspace_owner(workspace_id));

drop policy if exists client_modules_insert on public.client_modules;
create policy client_modules_insert on public.client_modules for insert to authenticated
  with check (public.can_edit_client(client_id) and created_by = auth.uid());
drop policy if exists client_modules_update on public.client_modules;
create policy client_modules_update on public.client_modules for update to authenticated
  using (public.can_edit_client(client_id)) with check (public.can_edit_client(client_id));
drop policy if exists client_modules_delete on public.client_modules;
create policy client_modules_delete on public.client_modules for delete to authenticated
  using (public.can_delete_client(client_id));

-- ---------------------------------------------------------------- projects

drop policy if exists projects_insert_shared on public.projects;
create policy projects_insert_shared on public.projects for insert to authenticated
  with check (user_id = auth.uid() and public.can_edit_client(client_id));
drop policy if exists projects_update_shared on public.projects;
create policy projects_update_shared on public.projects for update to authenticated
  using (public.can_edit_client(client_id)) with check (public.can_edit_client(client_id));
drop policy if exists projects_delete_shared on public.projects;
create policy projects_delete_shared on public.projects for delete to authenticated
  using (public.can_delete_client(client_id));

-- ---------------------------------------------------------------- drive: files, folders, trash

-- Any member uploads (insert policy from 028 stays). Editing, moving and restoring: OWNER/ADMIN.
drop policy if exists client_files_update on public.client_files;
create policy client_files_update on public.client_files for update to authenticated
  using (public.can_edit_client(client_id)) with check (public.can_edit_client(client_id));
drop policy if exists client_files_delete_admin on public.client_files;
create policy client_files_delete_admin on public.client_files for delete to authenticated
  using (public.can_delete_client(client_id) and deleted_at is not null);

drop policy if exists client_folders_update on public.client_folders;
create policy client_folders_update on public.client_folders for update to authenticated
  using (public.can_edit_client(client_id)) with check (public.can_edit_client(client_id));
drop policy if exists client_folders_delete on public.client_folders;
create policy client_folders_delete on public.client_folders for delete to authenticated
  using (public.can_delete_client(client_id));

-- Trash guard: moving a file to the trash and purging it are deletions (OWNER only);
-- restoring is an edit (OWNER/ADMIN). Calls without a user (maintenance jobs) are not blocked.
create or replace function public.guard_client_file_trash()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- A new file never starts in the trash; trashing goes through the owner-only update below.
    new.deleted_at := null;
    new.deleted_by := null;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if auth.uid() is not null and not public.can_delete_client(old.client_id) then
      raise exception 'Only the workspace owner can empty the trash';
    end if;
    if old.deleted_at is null then raise exception 'Move the file to the trash before purging it'; end if;
    return old;
  end if;

  if new.storage_path is distinct from old.storage_path then
    raise exception 'The storage path of a file cannot be changed';
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    if auth.uid() is not null and not public.can_delete_client(new.client_id) then
      raise exception 'Only the workspace owner can move files to the trash';
    end if;
    new.deleted_at := now();
    new.deleted_by := auth.uid();
  elsif old.deleted_at is not null and new.deleted_at is null then
    if auth.uid() is not null and not public.can_edit_client(new.client_id) then
      raise exception 'Only workspace admins can restore files from the trash';
    end if;
    new.deleted_by := null;
  elsif new.deleted_at is distinct from old.deleted_at or new.deleted_by is distinct from old.deleted_by then
    raise exception 'Trash metadata cannot be edited directly';
  end if;
  return new;
end $$;

drop trigger if exists client_files_guard_trash on public.client_files;
create trigger client_files_guard_trash before insert or update or delete on public.client_files
  for each row execute function public.guard_client_file_trash();

-- Storage: only the owner removes trashed objects; the uploader still cleans up own orphans.
drop policy if exists client_files_storage_delete_admin on storage.objects;
create policy client_files_storage_delete_admin on storage.objects for delete to authenticated
  using (bucket_id = 'client-files' and (
    (public.can_delete_client_path(storage.objects.name)
      and exists (select 1 from public.client_files f
        where f.storage_path = storage.objects.name and f.deleted_at is not null
          and f.client_id = public.client_id_from_path(storage.objects.name))
      and not exists (select 1 from public.client_files f
        where f.storage_path = storage.objects.name and f.deleted_at is null)) or
    (owner_id = auth.uid()::text and not exists (
      select 1 from public.client_files f where f.storage_path = storage.objects.name
    ))
  ));

-- ---------------------------------------------------------------- members

-- Removing other people is an owner action; anyone can still leave on their own.
create or replace function public.remove_workspace_member(p_workspace uuid, p_user uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_role text;
begin
  select role into v_role from public.workspace_members where workspace_id = p_workspace and user_id = p_user for update;
  if not found then return false; end if;
  if p_user <> auth.uid() then
    if not public.is_workspace_owner(p_workspace) then raise exception 'Only the owner can remove members'; end if;
    if v_role = 'OWNER' then raise exception 'The owner cannot be removed'; end if;
  end if;
  if v_role = 'OWNER' and
     (select count(*) from public.workspace_members where workspace_id = p_workspace and role = 'OWNER') <= 1 then
    raise exception 'Workspace needs at least one owner';
  end if;
  delete from public.workspace_members where workspace_id = p_workspace and user_id = p_user;
  return true;
end $$;
revoke all on function public.remove_workspace_member(uuid, uuid) from public, anon;
grant execute on function public.remove_workspace_member(uuid, uuid) to authenticated;

commit;
