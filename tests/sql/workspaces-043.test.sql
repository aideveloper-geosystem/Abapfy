-- Role matrix of 043_workspace_role_permissions.sql: OWNER, ADMIN, MEMBER and a non-member.
\set ON_ERROR_STOP on

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner43@x.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin43@x.com'),
  ('00000000-0000-0000-0000-0000000000a3', 'member43@x.com'),
  ('00000000-0000-0000-0000-0000000000a4', 'outsider43@x.com');
insert into public.profiles(id, nome) select id, split_part(email, '@', 1) from auth.users where email like '%43@x.com';
insert into public.workspaces(id, name, created_by) values ('90000000-0000-0000-0000-000000000043', 'W43', '00000000-0000-0000-0000-0000000000a1');
insert into public.workspace_members(workspace_id, user_id, role) values
  ('90000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-0000000000a1', 'OWNER'),
  ('90000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-0000000000a2', 'ADMIN'),
  ('90000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-0000000000a3', 'MEMBER');
insert into public.clients(id, name, workspace_id, created_by, updated_by) values
  ('b0000000-0000-0000-0000-000000000043', 'C43', '90000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1'),
  ('b0000000-0000-0000-0000-000000000044', 'C44', '90000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1');
insert into public.client_modules(id, client_id, name, created_by) values
  ('c0000000-0000-0000-0000-000000000043', 'b0000000-0000-0000-0000-000000000043', 'M1', '00000000-0000-0000-0000-0000000000a1'),
  ('c0000000-0000-0000-0000-000000000044', 'b0000000-0000-0000-0000-000000000043', 'M2', '00000000-0000-0000-0000-0000000000a1');
insert into public.projects(id, user_id, client_id, name) values
  ('d0000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-000000000043', 'P43'),
  ('d0000000-0000-0000-0000-000000000044', '00000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-000000000043', 'P44');
insert into public.client_files(id, client_id, module_id, name, storage_path, user_id) values
  ('e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000043', 'c0000000-0000-0000-0000-000000000043', 'f1', 'b0000000-0000-0000-0000-000000000043/c0000000-0000-0000-0000-000000000043/f1', '00000000-0000-0000-0000-0000000000a1'),
  ('e0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000043', 'c0000000-0000-0000-0000-000000000043', 'f2', 'b0000000-0000-0000-0000-000000000043/c0000000-0000-0000-0000-000000000043/f2', '00000000-0000-0000-0000-0000000000a1');
insert into public.client_folders(id, client_id, module_id, name, user_id) values
  ('f0000000-0000-0000-0000-000000000043', 'b0000000-0000-0000-0000-000000000043', 'c0000000-0000-0000-0000-000000000043', 'Pasta', '00000000-0000-0000-0000-0000000000a1');
insert into storage.objects(bucket_id, name, owner_id) values
  ('client-files', 'b0000000-0000-0000-0000-000000000043/c0000000-0000-0000-0000-000000000043/f1', '00000000-0000-0000-0000-0000000000a1');

\i supabase/sql/043_workspace_role_permissions.sql
\i supabase/sql/043_workspace_role_permissions.sql

-- Rows touched by a denied UPDATE/DELETE are filtered by RLS (no error), so assert on counts.
create function public.cnt(q text) returns bigint language plpgsql as $$ declare n bigint; begin execute q into n; return n; end $$;
grant execute on function public.cnt(text) to authenticated;

-- MEMBER: reads and uploads only.
do $$ declare m uuid := '00000000-0000-0000-0000-0000000000a3'; begin
  perform public.act(m);
  assert public.count_of('select 1 from public.clients where name like ''C4%''') = 2, 'member reads clients';
  assert public.count_of('select 1 from public.client_files') = 2, 'member reads files';
  perform public.expect_error($q$insert into public.clients(name, created_by, updated_by, workspace_id) values ('Nope', auth.uid(), auth.uid(), '90000000-0000-0000-0000-000000000043')$q$, '%row-level security%');
  update public.clients set description = 'x', updated_by = auth.uid() where id = 'b0000000-0000-0000-0000-000000000043';
  perform public.expect_error($q$insert into public.client_modules(client_id, name, created_by) values ('b0000000-0000-0000-0000-000000000043', 'M3', auth.uid())$q$, '%row-level security%');
  perform public.expect_error($q$insert into public.projects(user_id, client_id, name) values (auth.uid(), 'b0000000-0000-0000-0000-000000000043', 'Px')$q$, '%row-level security%');
  update public.client_files set name = 'renamed' where id = 'e0000000-0000-0000-0000-000000000001';
  update public.client_files set deleted_at = now() where id = 'e0000000-0000-0000-0000-000000000001';
  delete from public.clients where id = 'b0000000-0000-0000-0000-000000000044';
  delete from public.client_modules where id = 'c0000000-0000-0000-0000-000000000044';
  delete from public.projects where id = 'd0000000-0000-0000-0000-000000000044';
  delete from public.client_folders where id = 'f0000000-0000-0000-0000-000000000043';
  -- upload: file row and storage object are allowed
  insert into public.client_files(client_id, module_id, name, storage_path, user_id)
    values ('b0000000-0000-0000-0000-000000000043', 'c0000000-0000-0000-0000-000000000043', 'up', 'b0000000-0000-0000-0000-000000000043/c0000000-0000-0000-0000-000000000043/up', m);
  insert into storage.objects(bucket_id, name, owner_id)
    values ('client-files', 'b0000000-0000-0000-0000-000000000043/c0000000-0000-0000-0000-000000000043/up', m::text);
  insert into public.client_folders(client_id, module_id, name, user_id)
    values ('b0000000-0000-0000-0000-000000000043', 'c0000000-0000-0000-0000-000000000043', 'MinhaPasta', m);
  -- favorites are personal
  insert into public.client_favorites(user_id, client_id) values (m, 'b0000000-0000-0000-0000-000000000043');
  perform public.expect_error($q$insert into public.client_favorites(user_id, client_id) values ('00000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-000000000043')$q$, '%row-level security%');
  reset role;
  assert (select description from public.clients where id = 'b0000000-0000-0000-0000-000000000043') is null, 'member did not edit client';
  assert (select name from public.client_files where id = 'e0000000-0000-0000-0000-000000000001') = 'f1', 'member did not rename file';
  assert (select deleted_at from public.client_files where id = 'e0000000-0000-0000-0000-000000000001') is null, 'member did not trash file';
  assert (select count(*) from public.clients where id = 'b0000000-0000-0000-0000-000000000044') = 1, 'member did not delete client';
  assert (select count(*) from public.client_modules where id = 'c0000000-0000-0000-0000-000000000044') = 1, 'member did not delete module';
  assert (select count(*) from public.projects where id = 'd0000000-0000-0000-0000-000000000044') = 1, 'member did not delete project';
  assert (select count(*) from public.client_folders where id = 'f0000000-0000-0000-0000-000000000043') = 1, 'member did not delete folder';
  assert (select count(*) from public.client_files where name = 'up') = 1, 'member uploaded';
end $$;

-- ADMIN: creates and edits, never deletes, trashes or purges.
do $$ declare a uuid := '00000000-0000-0000-0000-0000000000a2'; begin
  perform public.act(a);
  insert into public.clients(id, name, created_by, updated_by, workspace_id) values ('b0000000-0000-0000-0000-000000000045', 'C45', a, a, '90000000-0000-0000-0000-000000000043');
  update public.clients set description = 'edit', updated_by = a where id = 'b0000000-0000-0000-0000-000000000043';
  update public.clients set archived_at = now(), updated_by = a where id = 'b0000000-0000-0000-0000-000000000045';
  insert into public.client_modules(client_id, name, created_by) values ('b0000000-0000-0000-0000-000000000043', 'M3', a);
  update public.client_modules set description = 'd' where id = 'c0000000-0000-0000-0000-000000000043';
  insert into public.projects(user_id, client_id, name) values (a, 'b0000000-0000-0000-0000-000000000043', 'AdminProject');
  update public.projects set name = 'P43b' where id = 'd0000000-0000-0000-0000-000000000043';
  update public.client_files set name = 'renamed' where id = 'e0000000-0000-0000-0000-000000000001';
  update public.client_folders set name = 'Renomeada' where id = 'f0000000-0000-0000-0000-000000000043';
  -- trash is a deletion: blocked by the guard trigger
  perform public.expect_error($q$update public.client_files set deleted_at = now() where id = 'e0000000-0000-0000-0000-000000000002'$q$, '%owner can move files to the trash%');
  delete from public.clients where id = 'b0000000-0000-0000-0000-000000000044';
  delete from public.client_modules where id = 'c0000000-0000-0000-0000-000000000044';
  delete from public.projects where id = 'd0000000-0000-0000-0000-000000000044';
  delete from public.client_folders where id = 'f0000000-0000-0000-0000-000000000043';
  reset role;
  assert (select description from public.clients where id = 'b0000000-0000-0000-0000-000000000043') = 'edit', 'admin edited client';
  assert (select archived_by from public.clients where id = 'b0000000-0000-0000-0000-000000000045') = a, 'archive stamped with admin';
  assert (select name from public.client_files where id = 'e0000000-0000-0000-0000-000000000001') = 'renamed', 'admin renamed file';
  assert (select name from public.client_folders where id = 'f0000000-0000-0000-0000-000000000043') = 'Renomeada', 'admin renamed folder';
  assert (select count(*) from public.clients where id = 'b0000000-0000-0000-0000-000000000044') = 1, 'admin did not delete client';
  assert (select count(*) from public.client_modules where id = 'c0000000-0000-0000-0000-000000000044') = 1, 'admin did not delete module';
  assert (select count(*) from public.projects where id = 'd0000000-0000-0000-0000-000000000044') = 1, 'admin did not delete project';
  assert (select count(*) from public.client_folders where id = 'f0000000-0000-0000-0000-000000000043') = 1, 'admin did not delete folder';
  assert (select count(*) from public.client_modules where name = 'M3') = 1 and (select count(*) from public.projects where name = 'AdminProject') = 1, 'admin created module and project';
end $$;

-- OWNER: everything, including trash, restore, purge and delete.
do $$ declare o uuid := '00000000-0000-0000-0000-0000000000a1'; begin
  perform public.act(o);
  update public.client_files set deleted_at = now() where id = 'e0000000-0000-0000-0000-000000000002';
  update public.client_files set deleted_at = null where id = 'e0000000-0000-0000-0000-000000000002';
  update public.client_files set deleted_at = now() where id = 'e0000000-0000-0000-0000-000000000002';
  delete from public.client_files where id = 'e0000000-0000-0000-0000-000000000002';
  delete from public.client_files where id = 'e0000000-0000-0000-0000-000000000001'; -- not trashed: filtered out by RLS
  delete from public.projects where id = 'd0000000-0000-0000-0000-000000000044';
  delete from public.client_modules where id = 'c0000000-0000-0000-0000-000000000044';
  delete from public.client_folders where id = 'f0000000-0000-0000-0000-000000000043';
  delete from public.clients where id = 'b0000000-0000-0000-0000-000000000045';
  reset role;
  assert (select count(*) from public.client_files where id = 'e0000000-0000-0000-0000-000000000002') = 0, 'owner purged file';
  assert (select count(*) from public.client_files where id = 'e0000000-0000-0000-0000-000000000001') = 1, 'untrashed file cannot be purged';
  assert (select count(*) from public.projects where id = 'd0000000-0000-0000-0000-000000000044') = 0, 'owner deleted project';
  assert (select count(*) from public.client_modules where id = 'c0000000-0000-0000-0000-000000000044') = 0, 'owner deleted module';
  assert (select count(*) from public.client_folders where id = 'f0000000-0000-0000-0000-000000000043') = 0, 'owner deleted folder';
  assert (select count(*) from public.clients where id = 'b0000000-0000-0000-0000-000000000045') = 0, 'owner deleted client';
end $$;

-- Restore is an edit: after the owner trashes a file, an ADMIN can restore it but not trash again.
do $$ begin
  update public.client_files set deleted_at = now() where id = 'e0000000-0000-0000-0000-000000000001';
  perform public.act('00000000-0000-0000-0000-0000000000a2');
  update public.client_files set deleted_at = null where id = 'e0000000-0000-0000-0000-000000000001';
  perform public.expect_error($q$update public.client_files set deleted_at = now() where id = 'e0000000-0000-0000-0000-000000000001'$q$, '%owner can move files to the trash%');
  reset role;
  assert (select deleted_at from public.client_files where id = 'e0000000-0000-0000-0000-000000000001') is null, 'admin restored';
end $$;

-- Storage purge: owner may remove a trashed object, admin may not; uploader still removes own orphan.
do $$ begin
  update public.client_files set deleted_at = now() where id = 'e0000000-0000-0000-0000-000000000001';
  perform public.act('00000000-0000-0000-0000-0000000000a2');
  delete from storage.objects where name = 'b0000000-0000-0000-0000-000000000043/c0000000-0000-0000-0000-000000000043/f1';
  reset role;
  assert (select count(*) from storage.objects where name = 'b0000000-0000-0000-0000-000000000043/c0000000-0000-0000-0000-000000000043/f1') = 1, 'admin cannot purge storage';
  perform public.act('00000000-0000-0000-0000-0000000000a1');
  delete from storage.objects where name = 'b0000000-0000-0000-0000-000000000043/c0000000-0000-0000-0000-000000000043/f1';
  reset role;
  assert (select count(*) from storage.objects where name = 'b0000000-0000-0000-0000-000000000043/c0000000-0000-0000-0000-000000000043/f1') = 0, 'owner purges storage';
end $$;

-- Archived clients stay readable; non-member sees and does nothing.
update public.clients set archived_at = now() where id = 'b0000000-0000-0000-0000-000000000044';
do $$ begin
  perform public.act('00000000-0000-0000-0000-0000000000a4');
  assert public.count_of('select 1 from public.clients where name like ''C4%''') = 0, 'outsider sees no client';
  assert public.count_of('select 1 from public.client_favorites') = 0, 'outsider sees no favorites';
  perform public.expect_error($q$insert into public.client_favorites(user_id, client_id) values (auth.uid(), 'b0000000-0000-0000-0000-000000000043')$q$, '%row-level security%');
  perform public.expect_error($q$insert into public.client_files(client_id, module_id, name, storage_path, user_id) values ('b0000000-0000-0000-0000-000000000043', 'c0000000-0000-0000-0000-000000000043', 'x', 'p', auth.uid())$q$, '%row-level security%');
  reset role;
  perform public.act('00000000-0000-0000-0000-0000000000a3');
  assert public.count_of('select 1 from public.clients where archived_at is not null') = 1, 'member reads archived client';
  reset role;
end $$;

-- Members: only the owner removes people; anyone can leave.
do $$ declare w uuid := '90000000-0000-0000-0000-000000000043'; begin
  perform public.act('00000000-0000-0000-0000-0000000000a2');
  perform public.expect_error(format($q$select public.remove_workspace_member(%L, '00000000-0000-0000-0000-0000000000a3')$q$, w), '%Only the owner can remove members%');
  reset role;
  perform public.act('00000000-0000-0000-0000-0000000000a1');
  assert public.remove_workspace_member(w, '00000000-0000-0000-0000-0000000000a3') = true, 'owner removes member';
  reset role;
  insert into public.workspace_members(workspace_id, user_id, role) values (w, '00000000-0000-0000-0000-0000000000a3', 'MEMBER');
  perform public.act('00000000-0000-0000-0000-0000000000a3');
  assert public.remove_workspace_member(w, '00000000-0000-0000-0000-0000000000a3') = true, 'member leaves';
  reset role;
end $$;

-- Server-derived fields: archive author cannot be forged, files cannot start trashed or change path.
do $$ declare a uuid := '00000000-0000-0000-0000-0000000000a2'; begin
  perform public.act(a);
  update public.clients set archived_at = now(), archived_by = '00000000-0000-0000-0000-0000000000a1', updated_by = a
    where id = 'b0000000-0000-0000-0000-000000000043';
  update public.clients set description = 'again', archived_by = '00000000-0000-0000-0000-0000000000a1', updated_by = a
    where id = 'b0000000-0000-0000-0000-000000000043';
  insert into public.client_files(id, client_id, module_id, name, storage_path, user_id, deleted_at, deleted_by)
    values ('e0000000-0000-0000-0000-000000000009', 'b0000000-0000-0000-0000-000000000043', 'c0000000-0000-0000-0000-000000000043', 'sneaky',
            'b0000000-0000-0000-0000-000000000043/c0000000-0000-0000-0000-000000000043/sneaky', a, now(), a);
  perform public.expect_error($q$update public.client_files set storage_path = 'elsewhere' where id = 'e0000000-0000-0000-0000-000000000009'$q$, '%storage path of a file cannot be changed%');
  reset role;
  assert (select archived_by from public.clients where id = 'b0000000-0000-0000-0000-000000000043') = a, 'archived_by stays the real actor';
  assert (select deleted_at from public.client_files where id = 'e0000000-0000-0000-0000-000000000009') is null, 'inserted file is not trashed';
end $$;

select 'workspaces 043 sql ok' as result;
