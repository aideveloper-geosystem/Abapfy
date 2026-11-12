-- Minimal stand-in for the Supabase schema as it looks right before migration 041.
-- Only the objects 041 touches are reproduced, with their pre-041 policies.
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth; create schema storage;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner_id text);
create function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
alter table storage.objects enable row level security;
create policy storage_read_all on storage.objects for select to authenticated using (true);
create policy storage_insert_all on storage.objects for insert to authenticated with check (true);

create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create table public.profiles (id uuid primary key references auth.users(id), nome text, cargo text, empresa text);
create table public.app_roles (user_id uuid primary key references auth.users(id), role text not null check (role in ('MASTER','ADMIN')), granted_at timestamptz not null default now());
create function public.is_abapfy_admin() returns boolean language sql stable security definer set search_path = public
  as $$ select exists (select 1 from public.app_roles where user_id = auth.uid() and role in ('MASTER','ADMIN')) $$;

create table public.clients (id uuid primary key default gen_random_uuid(), name text not null unique, description text, workbook_md text,
  created_by uuid, updated_by uuid, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.client_modules (id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id) on delete cascade,
  name text not null, description text, created_by uuid, created_at timestamptz default now(), updated_at timestamptz default now(), unique(client_id, name), unique(client_id, id));
create table public.projects (id uuid primary key default gen_random_uuid(), user_id uuid not null, client_id uuid not null references public.clients(id), name text);
create table public.chats (id uuid primary key default gen_random_uuid(), user_id uuid not null, client_id uuid not null references public.clients(id), module_id uuid not null, project_id uuid, title text);
create table public.chat_messages (id uuid primary key default gen_random_uuid(), chat_id uuid not null references public.chats(id) on delete cascade, user_id uuid not null, content text);
create table public.project_documents (id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade, user_id uuid not null, name text);
create table public.project_document_chunks (id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade, document_id uuid not null, user_id uuid not null, content text);
create table public.client_files (id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id), module_id uuid not null,
  name text, storage_path text, user_id uuid not null, deleted_at timestamptz, deleted_by uuid);
create table public.client_folders (id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id), module_id uuid not null, name text, user_id uuid not null);
create table public.client_file_events (id uuid primary key default gen_random_uuid(), file_id uuid, client_id uuid not null references public.clients(id), module_id uuid, file_name text, action text, actor_id uuid);
create table public.client_work_presence (id uuid primary key default gen_random_uuid(), user_id uuid not null, client_id uuid not null references public.clients(id), module_id uuid);

create function public.guard_client_file_trash() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if not public.is_abapfy_admin() then raise exception 'Only administrators can empty the trash'; end if;
    return old;
  end if;
  return new;
end $$;
create trigger client_files_guard_trash before update or delete on public.client_files for each row execute function public.guard_client_file_trash();

do $$ declare t text; begin
  foreach t in array array['clients','client_modules','projects','chats','chat_messages','project_documents','project_document_chunks',
                           'client_files','client_folders','client_file_events','client_work_presence'] loop
    execute format('alter table public.%I enable row level security', t);
    -- Real pre-041 policies: clients/modules were writable only by platform admins, trash deletes only by admins.
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_open_read', t);
    if t not in ('clients', 'client_modules', 'client_files') then
      execute format('create policy %I on public.%I for all to authenticated using (true) with check (true)', t || '_open', t);
    end if;
  end loop;
end $$;
-- Pre-041 admin-only policies that 041 replaces.
create policy client_files_write_open on public.client_files for insert to authenticated with check (true);
create policy client_files_update_open on public.client_files for update to authenticated using (true) with check (true);
create policy clients_insert on public.clients for insert to authenticated with check (public.is_abapfy_admin());
create policy client_files_delete_admin on public.client_files for delete to authenticated using (public.is_abapfy_admin() and deleted_at is not null);
create policy client_files_storage_delete_admin on storage.objects for delete to authenticated using (bucket_id = 'client-files' and public.is_abapfy_admin());
alter table public.profiles enable row level security;
create policy profiles_read on public.profiles for select to authenticated using (true);
grant usage on schema public, auth, storage to authenticated, anon;
grant all on all tables in schema public to authenticated;
grant select on auth.users to authenticated;
grant all on all tables in schema storage to authenticated;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema storage to authenticated;
