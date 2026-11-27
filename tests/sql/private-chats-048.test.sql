-- Private sessions (048): private by default, author-only writes, published read-only, search.
\set ON_ERROR_STOP on

-- Columns that exist since 005/011 and are not part of the minimal pre-041 stand-in.
alter table public.chats add column if not exists archived boolean not null default false;
alter table public.chats add column if not exists agent_name text;
alter table public.chats add column if not exists updated_at timestamptz not null default now();
alter table public.chat_messages add column if not exists created_at timestamptz not null default now();

\i supabase/sql/048_private_chats_and_search.sql
\i supabase/sql/048_private_chats_and_search.sql

do $$ declare
  owner_id uuid := '00000000-0000-0000-0000-0000000000a3';
  member_id uuid := '00000000-0000-0000-0000-0000000000a5';
  admin_id uuid := '00000000-0000-0000-0000-0000000000a2';
  outsider_id uuid := '00000000-0000-0000-0000-0000000000a4';
  chat uuid := 'f4800000-0000-0000-0000-000000000048';
  changed integer;
begin
  assert (select count(*) from public.chats where is_public) = 0, 'existing sessions become private';
  insert into public.chats(id, user_id, client_id, module_id, title)
    values (chat, owner_id, 'b0000000-0000-0000-0000-000000000043', 'c0000000-0000-0000-0000-000000000043', 'Dump na VA01');
  insert into public.chat_messages(chat_id, user_id, content)
    values (chat, owner_id, 'A exceção ocorre na Transação de faturamento 100% das vezes.');

  perform public.act(owner_id);
  assert public.count_of(format('select 1 from public.chats where id = %L', chat)) = 1, 'author reads own private session';
  assert public.count_of('select 1 from public.search_chats(''transacao FATURAMENTO'')') = 1, 'search ignores case and accents';
  assert public.count_of('select 1 from public.search_chats(''va01 faturamento'')') = 1, 'terms may match title and content';
  assert public.count_of('select 1 from public.search_chats(''faturamento inexistente'')') = 0, 'every term must match';
  assert public.count_of('select 1 from public.search_chats(''100%'')') = 1, 'wildcards are literal';
  assert public.count_of('select 1 from public.search_chats(''fat_ramento'')') = 0, 'underscore is literal';
  assert (select s.excerpt from public.search_chats('faturamento') s) like '%faturamento%', 'excerpt shows the match';
  reset role;

  -- members and workspace admins do not see private sessions
  foreach member_id in array array[member_id, admin_id] loop
    perform public.act(member_id);
    assert public.count_of(format('select 1 from public.chats where id = %L', chat)) = 0, 'private session is hidden';
    assert public.count_of(format('select 1 from public.chat_messages where chat_id = %L', chat)) = 0, 'private messages are hidden';
    assert public.count_of('select 1 from public.search_chats(''faturamento'')') = 0, 'search respects privacy';
    update public.chats set is_public = true where id = chat;
    get diagnostics changed = row_count;
    assert changed = 0, 'only the author publishes';
    delete from public.chats where id = chat;
    get diagnostics changed = row_count;
    assert changed = 0, 'only the author deletes';
    reset role;
  end loop;
  member_id := '00000000-0000-0000-0000-0000000000a5';

  perform public.act(owner_id);
  update public.chats set is_public = true where id = chat;
  reset role;

  -- published: members read and search, never write
  perform public.act(member_id);
  assert public.count_of(format('select 1 from public.chats where id = %L', chat)) = 1, 'published session is visible';
  assert public.count_of(format('select 1 from public.chat_messages where chat_id = %L', chat)) = 1, 'published messages are visible';
  assert public.count_of('select 1 from public.search_chats(''faturamento'', p_public_only => true)') = 1, 'published sessions are searchable';
  update public.chats set title = 'x' where id = chat;
  get diagnostics changed = row_count;
  assert changed = 0, 'readers cannot rename';
  delete from public.chat_messages where chat_id = chat;
  get diagnostics changed = row_count;
  assert changed = 0, 'readers cannot delete messages';
  delete from public.chats where id = chat;
  get diagnostics changed = row_count;
  assert changed = 0, 'readers cannot delete the session';
  perform public.expect_error(format('insert into public.chat_messages(chat_id, user_id, content) values (%L, %L, ''x'')', chat, member_id), '%row-level security%');
  reset role;

  -- the workspace boundary of 041 still applies to published sessions
  perform public.act(outsider_id);
  assert public.count_of(format('select 1 from public.chats where id = %L', chat)) = 0, 'outsider reads nothing';
  assert public.count_of('select 1 from public.search_chats(''faturamento'')') = 0, 'outsider searches nothing';
  reset role;

  perform public.act(owner_id);
  update public.chats set is_public = false where id = chat;
  reset role;
  perform public.act(member_id);
  assert public.count_of(format('select 1 from public.chats where id = %L', chat)) = 0, 'unpublishing hides it again';
  reset role;

  perform public.act(owner_id);
  delete from public.chats where id = chat;
  get diagnostics changed = row_count;
  assert changed = 1, 'author deletes own session';
  reset role;
end $$;
