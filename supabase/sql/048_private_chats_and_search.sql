-- Abapfy — sessões privadas, publicação por cliente e busca no conteúdo.
-- Aplicar depois da 047, no SQL Editor do Supabase. Pode ser executada mais de uma vez.
--
--   * Toda sessão nasce privada. As sessões que já existem também ficam privadas.
--   * Só o autor publica ou torna privada. Publicada, a sessão fica visível aos membros do
--     workspace na aba Sessões do cliente, somente para leitura.
--   * Só o autor altera, arquiva ou exclui a sessão e escreve mensagens nela.
--   * Administradores e proprietários do workspace não enxergam sessões privadas de terceiros.
--
-- As regras são políticas RESTRICTIVE: valem junto com as permissivas das migrações 005/021
-- e com o isolamento por workspace da 041, sem depender dos nomes delas.

begin;

alter table public.chats add column if not exists is_public boolean not null default false;
comment on column public.chats.is_public is 'Sessão publicada pelo autor para os membros do workspace (somente leitura).';

-- ---------------------------------------------------------------- chats

drop policy if exists chats_private_select on public.chats;
create policy chats_private_select on public.chats as restrictive for select to authenticated
  using (user_id = auth.uid() or is_public);
drop policy if exists chats_owner_insert on public.chats;
create policy chats_owner_insert on public.chats as restrictive for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists chats_owner_update on public.chats;
create policy chats_owner_update on public.chats as restrictive for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists chats_owner_delete on public.chats;
create policy chats_owner_delete on public.chats as restrictive for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------- messages

drop policy if exists chat_messages_private_select on public.chat_messages;
create policy chat_messages_private_select on public.chat_messages as restrictive for select to authenticated
  using (exists (select 1 from public.chats c
    where c.id = chat_id and (c.user_id = auth.uid() or c.is_public)));
drop policy if exists chat_messages_owner_insert on public.chat_messages;
create policy chat_messages_owner_insert on public.chat_messages as restrictive for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.chats c
    where c.id = chat_id and c.user_id = auth.uid()));
drop policy if exists chat_messages_owner_update on public.chat_messages;
create policy chat_messages_owner_update on public.chat_messages as restrictive for update to authenticated
  using (exists (select 1 from public.chats c where c.id = chat_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.chats c where c.id = chat_id and c.user_id = auth.uid()));
drop policy if exists chat_messages_owner_delete on public.chat_messages;
create policy chat_messages_owner_delete on public.chat_messages as restrictive for delete to authenticated
  using (exists (select 1 from public.chats c where c.id = chat_id and c.user_id = auth.uid()));

-- ---------------------------------------------------------------- search

-- Comparação sem diferenciar maiúsculas nem acentos. Mantém o mesmo número de caracteres,
-- então a posição encontrada serve para recortar o texto original.
create or replace function public.search_fold(p_text text)
returns text language sql immutable parallel safe set search_path = ''
as $$ select translate(lower(coalesce(p_text, '')), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn') $$;

-- SECURITY INVOKER: a busca só alcança o que as políticas acima deixam o chamador ler.
-- Cada palavra precisa aparecer no título ou em alguma mensagem da sessão.
create or replace function public.search_chats(
  p_query text default '',
  p_client uuid default null,
  p_user uuid default null,
  p_exclude_user uuid default null,
  p_public_only boolean default false,
  p_archived boolean default false,
  p_since timestamptz default null,
  p_limit integer default 51,
  p_offset integer default 0)
returns table(id uuid, title text, project_id uuid, agent_name text, updated_at timestamptz,
  client_id uuid, module_id uuid, user_id uuid, is_public boolean, archived boolean, excerpt text)
language sql stable security invoker set search_path = public as $$
  with terms as (
    select distinct public.search_fold(t.term) as term, t.position
    from regexp_split_to_table(btrim(left(coalesce(p_query, ''), 200)), '\s+')
      with ordinality as t(term, position)
    where t.term <> ''
    order by t.position
    limit 8
  ), matched as (
    select c.* from public.chats c
    where (p_client is null or c.client_id = p_client)
      and (p_user is null or c.user_id = p_user)
      and (p_exclude_user is null or c.user_id <> p_exclude_user)
      and (not p_public_only or c.is_public)
      and c.archived = p_archived
      and (p_since is null or c.updated_at >= p_since)
      and not exists (
        select 1 from terms t
        where position(t.term in public.search_fold(c.title)) = 0
          and not exists (select 1 from public.chat_messages m
            where m.chat_id = c.id and position(t.term in public.search_fold(m.content)) > 0))
    order by c.updated_at desc, c.id
    limit least(greatest(p_limit, 1), 101)
    offset greatest(p_offset, 0)
  )
  select c.id, c.title, c.project_id, c.agent_name, c.updated_at, c.client_id, c.module_id,
    c.user_id, c.is_public, c.archived,
    (select regexp_replace(substr(m.content,
        greatest(position(t.term in public.search_fold(m.content)) - 60, 1), 180), '\s+', ' ', 'g')
      from terms t join public.chat_messages m
        on m.chat_id = c.id and position(t.term in public.search_fold(m.content)) > 0
      order by t.position, m.created_at
      limit 1)
  from matched c
  order by c.updated_at desc, c.id
$$;
revoke all on function public.search_chats(text, uuid, uuid, uuid, boolean, boolean, timestamptz, integer, integer) from public, anon;
grant execute on function public.search_chats(text, uuid, uuid, uuid, boolean, boolean, timestamptz, integer, integer) to authenticated;
grant execute on function public.search_fold(text) to authenticated;

commit;
