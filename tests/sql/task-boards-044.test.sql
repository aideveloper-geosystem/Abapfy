-- Shared task boards (044): membership, atomic claim, history, comments and role rules.
-- Runs after the 041/043 tests, reusing their W43 workspace: a1 OWNER, a2 ADMIN, a3 MEMBER.
\set ON_ERROR_STOP on

grant all on all tables in schema public to authenticated;
grant usage on schema public to authenticated;

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000a5', 'member44@x.com'),
  ('00000000-0000-0000-0000-0000000000a6', 'other44@x.com');
insert into public.profiles(id, nome) values
  ('00000000-0000-0000-0000-0000000000a5', 'member44'), ('00000000-0000-0000-0000-0000000000a6', 'other44');
insert into public.workspace_members(workspace_id, user_id, role) values
  ('90000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-0000000000a5', 'MEMBER'),
  ('90000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-0000000000a3', 'MEMBER')  -- the 043 test removed a3
on conflict do nothing;
insert into public.chats(id, user_id, client_id, module_id, title) values
  ('41000000-0000-0000-0000-000000000044', '00000000-0000-0000-0000-0000000000a3',
   'b0000000-0000-0000-0000-000000000043', 'c0000000-0000-0000-0000-000000000043', 'sessao a3');

alter table public.chats add column if not exists folder_id uuid;  -- added by 024 in production
\i supabase/sql/015_tasks_kanban.sql
\i supabase/sql/019_advanced_kanban.sql
\i supabase/rls/015_tasks_kanban_rls.sql
\i supabase/rls/019_advanced_kanban_rls.sql
\i supabase/sql/037_personal_task_sessions.sql
\i supabase/sql/044_shared_task_boards.sql
\i supabase/sql/044_shared_task_boards.sql
grant all on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

create table public.t44(k text primary key, v uuid);
grant all on public.t44 to authenticated;

-- 1. A member creates a board; only workspace members are added; columns are seeded.
do $$ declare a3 uuid := '00000000-0000-0000-0000-0000000000a3'; b uuid; begin
  perform public.act(a3);
  b := public.create_task_board('Equipe FI', 'b0000000-0000-0000-0000-000000000043', null,
    array['00000000-0000-0000-0000-0000000000a5'::uuid, '00000000-0000-0000-0000-0000000000a4'::uuid]);
  insert into public.t44 values ('board', b);
  assert (select count(*) from public.task_columns where board_id = b) = 4, 'seeded columns';
  assert (select count(*) from public.task_board_members where board_id = b) = 2, 'creator and workspace member only';
  perform public.expect_error($q$select public.create_task_board('X', 'b0000000-0000-0000-0000-000000000044', 'd0000000-0000-0000-0000-000000000043', '{}')$q$, '%another client%');
  reset role;
end $$;

-- 2. Tasks: forced client, creation event, visibility.
do $$ declare a3 uuid := '00000000-0000-0000-0000-0000000000a3'; b uuid := (select v from public.t44 where k = 'board'); t uuid; begin
  perform public.act(a3);
  insert into public.tasks(user_id, board_id, title, status, position)
    values (a3, b, 'Fechar período', 'todo', 1000) returning id into t;
  insert into public.t44 values ('task', t);
  assert (select client_id from public.tasks where id = t) = 'b0000000-0000-0000-0000-000000000043', 'board forces client';
  assert (select created_by from public.tasks where id = t) = a3, 'created_by from auth';
  perform public.expect_error(format('insert into public.tasks(user_id, board_id, title) values (%L, %L, ''x'')', '00000000-0000-0000-0000-0000000000a1', b), '%row-level security%');
  insert into public.tasks(user_id, title) values (a3, 'Pessoal a3');
  reset role;
  assert (select count(*) from public.task_events where task_id = t and type = 'created') = 1, 'created event';
  assert (select actor_id from public.task_events where task_id = t) = a3, 'event actor is the caller';
end $$;

do $$ declare a5 uuid := '00000000-0000-0000-0000-0000000000a5'; b uuid := (select v from public.t44 where k = 'board'); t uuid := (select v from public.t44 where k = 'task'); begin
  perform public.act(a5);
  assert public.count_of('select 1 from public.tasks') = 1, 'member sees the shared task and not the personal one';
  update public.tasks set status = 'in_progress' where id = t;
  perform public.expect_error(format('update public.tasks set board_id = null where id = %L', t), '%cannot be changed%');
  reset role;
  assert (select count(*) from public.task_events where task_id = t and type = 'moved'
    and data->>'to' = 'in_progress' and actor_id = a5) = 1, 'moved event by a5';
end $$;

do $$ begin
  perform public.act('00000000-0000-0000-0000-0000000000a1');  -- OWNER, not a board member
  assert public.count_of('select 1 from public.tasks') = 0, 'owner without membership sees no tasks';
  assert public.count_of('select 1 from public.task_boards') = 1, 'workspace admin sees the board';
  assert public.count_of('select 1 from public.task_events') = 0, 'no history without membership';
  reset role;
  perform public.act('00000000-0000-0000-0000-0000000000a4');  -- outsider
  assert public.count_of('select 1 from public.task_boards') = 0, 'outsider sees no board';
  reset role;
end $$;

-- 3. Claim is atomic; release only by the assignee; assignee must be a member.
do $$ declare a3 uuid := '00000000-0000-0000-0000-0000000000a3'; a5 uuid := '00000000-0000-0000-0000-0000000000a5';
  t uuid := (select v from public.t44 where k = 'task'); begin
  perform public.act(a5);
  assert public.claim_task(t) = true, 'a5 claims';
  reset role;
  perform public.act(a3);
  assert public.claim_task(t) = false, 'a3 loses the race';
  assert public.release_task(t) = false, 'a3 cannot release a5 task';
  perform public.expect_error(format('update public.tasks set assignee_id = %L where id = %L', '00000000-0000-0000-0000-0000000000a1', t), '%member of the board%');
  update public.tasks set assignee_id = a3 where id = t;  -- members may reassign
  reset role;
  assert (select assignee_id from public.tasks where id = t) = a3, 'reassigned';
  assert (select count(*) from public.task_events where task_id = t and type = 'assigned') = 2, 'claim and reassignment events';
  perform public.act('00000000-0000-0000-0000-0000000000a1');
  perform public.expect_error(format('select public.claim_task(%L)', t), '%Board member required%');
  reset role;
end $$;

-- 4. Subtasks and comments follow the board.
do $$ declare a5 uuid := '00000000-0000-0000-0000-0000000000a5'; t uuid := (select v from public.t44 where k = 'task'); s uuid; begin
  perform public.act(a5);
  insert into public.task_subtasks(task_id, user_id, title) values (t, a5, 'Conciliar') returning id into s;
  update public.task_subtasks set completed = true where id = s;
  insert into public.task_comments(task_id, body) values (t, 'Feito o ajuste');
  perform public.expect_error(format('insert into public.task_subtasks(task_id, user_id, title) values (%L, %L, ''x'')', t, '00000000-0000-0000-0000-0000000000a3'), '%creator must be%');
  reset role;
  assert (select count(*) from public.task_events where task_id = t and type = 'subtask' and (data->>'completed')::boolean) = 1, 'subtask event';
  assert (select author_id from public.task_comments where task_id = t) = a5, 'comment author from auth';
  assert (select board_id from public.task_comments where task_id = t) = (select board_id from public.tasks where id = t), 'comment board derived';
  perform public.act('00000000-0000-0000-0000-0000000000a1');
  perform public.expect_error(format('insert into public.task_comments(task_id, body) values (%L, ''oi'')', t), '%row-level security%');
  assert public.count_of('select 1 from public.task_comments') = 0, 'non-member reads no comments';
  reset role;
  perform public.act('00000000-0000-0000-0000-0000000000a3');
  delete from public.task_comments;  -- not the author: filtered
  reset role;
  assert (select count(*) from public.task_comments) = 1, 'only the author deletes a comment';
end $$;

-- 5. Personal tasks stay private to their owner and cannot carry an assignee.
do $$ declare a5 uuid := '00000000-0000-0000-0000-0000000000a5'; begin
  perform public.act(a5);
  update public.tasks set title = 'hack' where board_id is null;
  insert into public.tasks(user_id, title) values (a5, 'Pessoal a5');
  assert public.count_of('select 1 from public.tasks where board_id is null') = 1, 'only own personal task';
  reset role;
  assert (select count(*) from public.tasks where title = 'hack') = 0, 'cannot edit another personal task';
end $$;

-- 6. Columns: members edit, only workspace OWNER/ADMIN delete.
do $$ declare a3 uuid := '00000000-0000-0000-0000-0000000000a3'; b uuid := (select v from public.t44 where k = 'board'); begin
  perform public.act(a3);
  update public.task_columns set name = 'Aguardando' where board_id = b and key = 'blocked';
  insert into public.task_columns(user_id, board_id, key, name) values (a3, b, 'custom_x', 'Extra');
  delete from public.task_columns where board_id = b and key = 'custom_x';
  reset role;
  assert (select name from public.task_columns where board_id = b and key = 'blocked') = 'Aguardando', 'member renames column';
  assert (select count(*) from public.task_columns where board_id = b and key = 'custom_x') = 1, 'member cannot delete column';
  perform public.act('00000000-0000-0000-0000-0000000000a2');
  delete from public.task_columns where board_id = b and key = 'custom_x';
  reset role;
  assert (select count(*) from public.task_columns where board_id = b and key = 'custom_x') = 0, 'admin deletes column';
end $$;

-- 7. Membership: leaving releases tasks; member can add workspace members; board delete cascades cleanly.
do $$ declare a3 uuid := '00000000-0000-0000-0000-0000000000a3'; b uuid := (select v from public.t44 where k = 'board'); t uuid := (select v from public.t44 where k = 'task'); begin
  perform public.act(a3);
  insert into public.task_board_members(board_id, user_id) values (b, '00000000-0000-0000-0000-0000000000a2');
  perform public.expect_error(format('insert into public.task_board_members(board_id, user_id) values (%L, %L)', b, '00000000-0000-0000-0000-0000000000a6'), '%row-level security%');
  delete from public.task_board_members where board_id = b and user_id = a3;  -- a3 leaves
  reset role;
  assert (select count(*) from public.task_board_members where board_id = b) = 2, 'a3 left';
  assert (select assignee_id from public.tasks where id = t) is null, 'leaving releases the task';
  perform public.act('00000000-0000-0000-0000-0000000000a5');
  delete from public.task_boards where id = b;  -- member: denied (filtered)
  reset role;
  assert (select count(*) from public.task_boards where id = b) = 1, 'member cannot delete the board';
  perform public.act('00000000-0000-0000-0000-0000000000a2');
  delete from public.task_boards where id = b;
  reset role;
  assert (select count(*) from public.task_boards where id = b) = 0, 'admin deletes the board';
  assert (select count(*) from public.tasks where board_id = b) = 0, 'tasks cascade';
  assert (select count(*) from public.task_events where board_id = b) = 0, 'history cascades';
end $$;
