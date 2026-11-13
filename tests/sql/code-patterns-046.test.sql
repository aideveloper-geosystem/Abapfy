-- Approved code patterns (046): members approve, authors/admins revoke, content is immutable.
\set ON_ERROR_STOP on

\i supabase/sql/046_client_code_patterns.sql
\i supabase/sql/046_client_code_patterns.sql
grant execute on all functions in schema public to authenticated;

do $$ declare a3 uuid := '00000000-0000-0000-0000-0000000000a3'; a5 uuid := '00000000-0000-0000-0000-0000000000a5';
  p1 uuid; f uuid; begin
  -- file of another client for the cross-client check
  insert into public.client_files(id, client_id, module_id, name, storage_path, user_id)
    values ('e1000000-0000-0000-0000-000000000046', 'b0000000-0000-0000-0000-000000000044', 'c0000000-0000-0000-0000-000000000044', 'x.abap', 'p/x', a3)
    on conflict do nothing;

  perform public.act(a3);
  -- any member approves; author comes from auth.uid() even if the client sends someone else
  insert into public.client_code_patterns(client_id, module_id, title, content, approved_by, kind, tags)
    values ('b0000000-0000-0000-0000-000000000043', 'c0000000-0000-0000-0000-000000000043', 'Tratamento de erro BAPI',
      'CALL FUNCTION ''BAPI_X''.', a5, 'snippet', array['bapi', 'erro']) returning id into p1;
  assert (select approved_by from public.client_code_patterns where id = p1) = a3, 'approver is the caller';
  assert (select approved_by from public.client_code_patterns where id = p1) <> a5, 'client cannot forge the approver';
  -- same text twice: one active approval
  perform public.expect_error($q$insert into public.client_code_patterns(client_id, module_id, title, content)
    values ('b0000000-0000-0000-0000-000000000043', 'c0000000-0000-0000-0000-000000000043', 'Dup', 'CALL FUNCTION ''BAPI_X''.')$q$, '%duplicate key%');
  -- file of another client is refused
  perform public.expect_error($q$insert into public.client_code_patterns(client_id, module_id, title, content, file_id)
    values ('b0000000-0000-0000-0000-000000000043', 'c0000000-0000-0000-0000-000000000043', 'Cruz', 'abc', 'e1000000-0000-0000-0000-000000000046')$q$, '%another client%');
  -- content is immutable, metadata is not
  perform public.expect_error(format('update public.client_code_patterns set content = ''outro'' where id = %L', p1), '%cannot be changed%');
  update public.client_code_patterns set title = 'Erro BAPI v2', tags = array['bapi'] where id = p1;
  reset role;
  insert into public.t45 values ('pattern', p1);
end $$;

do $$ declare a2 uuid := '00000000-0000-0000-0000-0000000000a2'; a5 uuid := '00000000-0000-0000-0000-0000000000a5';
  a4 uuid := '00000000-0000-0000-0000-0000000000a4'; p1 uuid := (select v from public.t45 where k = 'pattern'); begin
  -- other member reads but cannot revoke someone else's approval
  perform public.act(a5);
  assert public.count_of('select 1 from public.client_code_patterns') = 1, 'members read the library';
  update public.client_code_patterns set revoked_at = now() where id = p1;
  reset role;
  assert (select revoked_at from public.client_code_patterns where id = p1) is null, 'member cannot revoke another approval';
  -- outsiders see nothing
  perform public.act(a4);
  assert public.count_of('select 1 from public.client_code_patterns') = 0, 'outsider reads nothing';
  reset role;
  -- admin revokes; revocation is stamped by the server and final
  perform public.act(a2);
  update public.client_code_patterns set revoked_at = '2000-01-01' where id = p1;
  reset role;
  assert (select revoked_at from public.client_code_patterns where id = p1) > now() - interval '1 minute', 'server stamps revocation';
  assert (select revoked_by from public.client_code_patterns where id = p1) = a2, 'revoker recorded';
  perform public.act(a2);
  perform public.expect_error(format('update public.client_code_patterns set title = ''x'' where id = %L', p1), '%Revoked pattern%');
  -- after revocation the same text can be approved again
  insert into public.client_code_patterns(client_id, module_id, title, content)
    values ('b0000000-0000-0000-0000-000000000043', 'c0000000-0000-0000-0000-000000000043', 'Reaprovado', 'CALL FUNCTION ''BAPI_X''.');
  reset role;
  -- only admins delete for good
  perform public.act(a5);
  delete from public.client_code_patterns;
  reset role;
  assert (select count(*) from public.client_code_patterns) = 2, 'member cannot delete';
  perform public.act(a2);
  delete from public.client_code_patterns where id = p1;
  reset role;
  assert (select count(*) from public.client_code_patterns) = 1, 'admin deletes';
end $$;
