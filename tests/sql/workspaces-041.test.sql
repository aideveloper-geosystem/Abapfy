-- Assertions for supabase/sql/041_workspaces.sql. Run after pre041 + seed + 041 (see workspaces-sql.test.mjs).
\set ON_ERROR_STOP on

create function public.act(u uuid) returns void language plpgsql as $$
begin
  perform set_config('app.uid', coalesce(u::text, ''), true);
  execute 'set local role authenticated';
end $$;
create function public.expect_error(q text, pattern text) returns void language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    if sqlerrm like pattern then return; end if;
    raise exception 'expected error like % but got: %', pattern, sqlerrm;
  end;
  raise exception 'expected error like % but statement succeeded: %', pattern, q;
end $$;
create function public.count_of(q text) returns bigint language plpgsql as $$
declare n bigint; begin execute 'select count(*) from (' || q || ') s' into n; return n; end $$;
grant execute on all functions in schema public to authenticated;
create table public.t_geral as select id from public.workspaces where name = 'Geral';
grant select on public.t_geral to authenticated;

-- 1. Existing users were migrated into one workspace preserving the hierarchy.
do $$ begin
  assert (select count(*) from public.workspaces) = 1, 'one workspace';
  assert (select name from public.workspaces) = 'Geral', 'workspace name';
  assert (select count(*) from public.workspace_members) = 4, 'all 4 users migrated';
  assert (select role from public.workspace_members where user_id = '00000000-0000-0000-0000-00000000000a') = 'OWNER', 'MASTER -> OWNER';
  assert (select role from public.workspace_members where user_id = '00000000-0000-0000-0000-00000000000b') = 'ADMIN', 'ADMIN -> ADMIN';
  assert (select count(*) from public.workspace_members where role = 'MEMBER') = 2, 'others -> MEMBER';
  assert (select workspace_id from public.clients) = (select id from public.workspaces), 'existing client moved to workspace';
  assert (select is_nullable from information_schema.columns where table_name = 'clients' and column_name = 'workspace_id') = 'NO', 'workspace_id not null';
end $$;

-- 2. Re-running the migration changes nothing.
\i supabase/sql/041_workspaces.sql
do $$ begin
  assert (select count(*) from public.workspaces) = 1, 'idempotent: workspaces';
  assert (select count(*) from public.workspace_members) = 4, 'idempotent: members';
end $$;

-- 3. Members see the legacy content; a user without workspace sees nothing.
do $$ declare a uuid := '00000000-0000-0000-0000-00000000000c'; begin
  perform public.act(a);
  assert public.count_of('select 1 from public.clients') = 1, 'member sees client';
  assert public.count_of('select 1 from public.chats') = 1, 'member sees chat';
  assert public.count_of('select 1 from public.chat_messages') = 1, 'member sees messages';
  assert public.count_of('select 1 from public.project_documents') = 1, 'member sees project docs';
  assert public.count_of('select 1 from storage.objects') = 2, 'member sees client file + other bucket';
  reset role;
end $$;

insert into auth.users(id, email) values ('00000000-0000-0000-0000-00000000000e', 'stranger@x.com');
insert into public.profiles(id, nome) values ('00000000-0000-0000-0000-00000000000e', 'stranger');
do $$ declare s uuid := '00000000-0000-0000-0000-00000000000e'; begin
  perform public.act(s);
  assert public.count_of('select 1 from public.clients') = 0, 'stranger: no clients';
  assert public.count_of('select 1 from public.chats') = 0, 'stranger: no chats';
  assert public.count_of('select 1 from public.chat_messages') = 0, 'stranger: no messages';
  assert public.count_of('select 1 from public.projects') = 0, 'stranger: no projects';
  assert public.count_of('select 1 from public.client_files') = 0, 'stranger: no files';
  assert public.count_of('select 1 from storage.objects') = 1, 'stranger: only other bucket';
  assert public.count_of('select 1 from public.workspaces') = 0, 'stranger: no workspaces listed';
  assert (select count(*) from public.my_workspace()) = 0, 'stranger: no workspace yet';
  perform public.expect_error($q$insert into public.clients(name, created_by, workspace_id)
    values ('Hack', '00000000-0000-0000-0000-00000000000e', (select id from public.t_geral))$q$, '%row-level security%');
  reset role;
end $$;

-- 4. Stranger creates an own workspace, and cannot touch Geral.
do $$ declare s uuid := '00000000-0000-0000-0000-00000000000e'; w uuid; begin
  perform public.act(s);
  w := public.create_workspace('Outra Consultoria');
  assert (select role from public.my_workspace()) = 'OWNER', 'creator is owner';
  assert (select join_code from public.my_workspace()) is not null, 'owner sees join code';
  perform public.expect_error($q$select public.create_workspace('Segunda')$q$, '%already belong%');
  insert into public.clients(name, created_by, updated_by) values ('Cliente B', s, s);
  assert (select workspace_id from public.clients where name = 'Cliente B') = w, 'default workspace on insert';
  assert public.count_of('select 1 from public.clients') = 1, 'sees only own client';
  assert public.count_of('select 1 from public.chats') = 0, 'still no Geral chats';
  reset role;
end $$;

-- 5. Join request -> approval flow.
insert into auth.users(id, email) values ('00000000-0000-0000-0000-00000000000f', 'new@x.com');
insert into public.profiles(id, nome) values ('00000000-0000-0000-0000-00000000000f', 'novato');
do $$ declare n uuid := '00000000-0000-0000-0000-00000000000f'; code text; req uuid; begin
  select join_code into code from public.workspaces where name = 'Geral';
  perform public.act(n);
  perform public.expect_error($q$select * from public.request_workspace_join('NOPE')$q$, '%Invalid workspace code%');
  select request_id into req from public.request_workspace_join(lower(code), 'sou do time ABAP');
  perform public.expect_error(format($q$select * from public.request_workspace_join(%L)$q$, code), '%already pending%');
  assert public.count_of('select 1 from public.clients') = 0, 'pending user still blind';
  perform public.expect_error(format($q$select public.decide_workspace_join(%L, true)$q$, req), '%admin required%');
  reset role;

  -- plain member cannot approve
  perform public.act('00000000-0000-0000-0000-00000000000c');
  perform public.expect_error(format($q$select public.decide_workspace_join(%L, true)$q$, req), '%admin required%');
  perform public.expect_error('select * from public.list_workspace_join_requests((select id from public.t_geral))', '%admin required%');
  reset role;

  -- ADMIN approves as MEMBER, cannot grant ADMIN
  perform public.act('00000000-0000-0000-0000-00000000000b');
  assert (select count(*) from public.list_workspace_join_requests((select id from public.t_geral))) = 1, 'admin lists request';
  perform public.expect_error(format($q$select public.decide_workspace_join(%L, true, 'ADMIN')$q$, req), '%Only the owner%');
  assert public.decide_workspace_join(req, true) = true, 'approved';
  reset role;

  assert (select role from public.workspace_members where user_id = n) = 'MEMBER', 'new member';
  perform public.act(n);
  assert public.count_of('select 1 from public.clients') = 1, 'new member sees workspace content';
  perform public.expect_error($q$insert into public.clients(name, created_by, workspace_id)
    values ('Nope', '00000000-0000-0000-0000-00000000000f', (select id from public.t_geral))$q$, '%row-level security%');
  reset role;
end $$;

-- 6. Roles: only owner changes roles; last owner is protected; removal rules.
do $$ declare g uuid := (select id from public.t_geral); begin
  perform public.act('00000000-0000-0000-0000-00000000000b');
  perform public.expect_error(format($q$select public.set_workspace_member_role(%L, '00000000-0000-0000-0000-00000000000c', 'ADMIN')$q$, g), '%Only the owner%');
  perform public.expect_error(format($q$select public.remove_workspace_member(%L, '00000000-0000-0000-0000-00000000000a')$q$, g), '%owner cannot be removed%');
  reset role;

  perform public.act('00000000-0000-0000-0000-00000000000a');
  assert public.set_workspace_member_role(g, '00000000-0000-0000-0000-00000000000c', 'ADMIN') = true, 'owner promotes';
  perform public.expect_error(format($q$select public.set_workspace_member_role(%L, '00000000-0000-0000-0000-00000000000a', 'MEMBER')$q$, g), '%at least one owner%');
  perform public.expect_error(format($q$select public.remove_workspace_member(%L, '00000000-0000-0000-0000-00000000000a')$q$, g), '%at least one owner%');
  assert (select count(*) from public.list_workspace_members(g)) = 5, 'owner lists members';
  assert (select email from public.list_workspace_members(g) where user_id = '00000000-0000-0000-0000-00000000000d') = 'abap@x.com', 'admin sees emails';
  assert public.remove_workspace_member(g, '00000000-0000-0000-0000-00000000000d') = true, 'owner removes member';
  reset role;

  -- member sees no emails, can leave
  perform public.act('00000000-0000-0000-0000-00000000000f');
  assert (select email from public.list_workspace_members(g) limit 1) is null, 'member does not see emails';
  assert public.remove_workspace_member(g, '00000000-0000-0000-0000-00000000000f') = true, 'member leaves';
  assert public.count_of('select 1 from public.clients') = 0, 'ex-member loses access';
  reset role;
end $$;

-- 7. Admin powers on client content; trash purge honours workspace boundaries.
do $$ declare g uuid := (select id from public.t_geral); begin
  -- promoted ADMIN (func) can create a client in Geral
  perform public.act('00000000-0000-0000-0000-00000000000c');
  insert into public.clients(name, created_by, updated_by, workspace_id) values ('Cliente C', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000c', g);
  assert public.count_of('select 1 from public.clients') = 2, 'admin created client';
  delete from public.client_files where id = '60000000-0000-0000-0000-000000000001';
  assert public.count_of('select 1 from public.client_files') = 0, 'admin purges trashed file';
  reset role;

  -- other workspace owner cannot purge or delete Geral content
  perform public.act('00000000-0000-0000-0000-00000000000e');
  assert (select count(*) from public.client_files) = 0, 'no cross-workspace files';
  delete from public.clients where id = '10000000-0000-0000-0000-000000000001';
  reset role;
  assert (select count(*) from public.clients where id = '10000000-0000-0000-0000-000000000001') = 1, 'cross-workspace delete blocked';

  -- client workspace is immutable
  perform public.expect_error($q$update public.clients set workspace_id = gen_random_uuid() where name = 'ACME'$q$, '%cannot be changed%');
end $$;

select 'workspaces 041 sql ok' as result;
