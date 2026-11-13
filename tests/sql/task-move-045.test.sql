-- Moving a personal task into a shared board (045).
\set ON_ERROR_STOP on

\i supabase/sql/045_move_task_to_board.sql
\i supabase/sql/045_move_task_to_board.sql
grant execute on all functions in schema public to authenticated;

create table public.t45(k text primary key, v uuid);
grant all on public.t45 to authenticated;

do $$ declare a3 uuid := '00000000-0000-0000-0000-0000000000a3'; a5 uuid := '00000000-0000-0000-0000-0000000000a5';
  b_open uuid; b_other uuid; b_client uuid; t_done uuid; t_custom uuid; t_other_client uuid; begin
  perform public.act(a3);
  b_open := public.create_task_board('Aberto', null, null, array[a5]);
  b_client := public.create_task_board('Cliente 44', 'b0000000-0000-0000-0000-000000000044', null, '{}');
  insert into public.task_columns(user_id, key, name, is_done) values (a3, 'done', 'Concluído', true), (a3, 'custom_q', 'Revisão', false);
  insert into public.tasks(user_id, title, status, dependency_ids, client_id)
    values (a3, 'Feita', 'done', array[gen_random_uuid()], 'b0000000-0000-0000-0000-000000000043') returning id into t_done;
  insert into public.tasks(user_id, title, status) values (a3, 'Em revisão', 'custom_q') returning id into t_custom;
  insert into public.tasks(user_id, title, status, client_id)
    values (a3, 'Outro cliente', 'todo', 'b0000000-0000-0000-0000-000000000043') returning id into t_other_client;
  insert into public.task_subtasks(task_id, user_id, title) values (t_done, a3, 'passo');
  reset role;
  perform public.act(a5);
  b_other := public.create_task_board('So a5', null, null, '{}');
  reset role;
  insert into public.t45 values ('open', b_open), ('other', b_other), ('client', b_client),
    ('done', t_done), ('custom', t_custom), ('otherclient', t_other_client);
end $$;

do $$ declare a3 uuid := '00000000-0000-0000-0000-0000000000a3'; a5 uuid := '00000000-0000-0000-0000-0000000000a5';
  b_open uuid := (select v from public.t45 where k = 'open'); b_other uuid := (select v from public.t45 where k = 'other');
  b_client uuid := (select v from public.t45 where k = 'client');
  t_done uuid := (select v from public.t45 where k = 'done'); t_custom uuid := (select v from public.t45 where k = 'custom');
  t_oc uuid := (select v from public.t45 where k = 'otherclient'); begin
  -- another member cannot move a3's task; a non-member board is refused
  perform public.act(a5);
  perform public.expect_error(format('select public.move_task_to_board(%L, %L)', t_done, b_open), '%Only the owner%');
  reset role;
  perform public.act(a3);
  perform public.expect_error(format('select public.move_task_to_board(%L, %L)', t_done, b_other), '%Board member required%');
  perform public.expect_error(format('update public.tasks set board_id = %L where id = %L', b_open, t_done), '%cannot be changed%');
  -- board bound to another client refuses the task
  perform public.expect_error(format('select public.move_task_to_board(%L, %L)', t_oc, b_client), '%another client%');

  -- the real moves
  perform public.move_task_to_board(t_done, b_open);
  perform public.move_task_to_board(t_custom, b_open);
  perform public.expect_error(format('select public.move_task_to_board(%L, %L)', t_done, b_open), '%Only the owner%');  -- already shared
  reset role;

  assert (select board_id from public.tasks where id = t_done) = b_open, 'moved to the board';
  assert (select status from public.tasks where id = t_done) = 'done', 'same column key is kept';
  assert (select status from public.tasks where id = t_custom) = 'todo', 'custom open column maps to the first open column';
  assert (select dependency_ids from public.tasks where id = t_done) = '{}', 'dependencies cleared';
  assert (select assignee_id from public.tasks where id = t_done) is null, 'assignee free';
  assert (select count(*) from public.task_subtasks where task_id = t_done) = 1, 'subtasks follow the task';
  assert (select count(*) from public.task_events where task_id = t_done and type = 'created' and data ? 'from_personal') = 1, 'history marks personal origin';

  -- visibility flipped: a5 (board member) sees it, and it left a3's personal board
  perform public.act(a5);
  assert public.count_of(format('select 1 from public.tasks where id = %L', t_done)) = 1, 'member sees moved task';
  assert (select count(*) from public.task_subtasks where task_id = t_done) = 1, 'member sees subtasks';
  reset role;
end $$;
