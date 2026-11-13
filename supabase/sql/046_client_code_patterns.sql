-- Abapfy — biblioteca de padrões de código aprovados por cliente.
-- Aplicar depois da 045. Pode ser executada mais de uma vez.
--
-- Um bloco de código só entra na biblioteca quando alguém do workspace o aprova (atalho no bloco
-- de código do chat). O arquivo continua no drive do cliente (pasta "Padrões aprovados"); esta
-- tabela guarda a aprovação, a cópia do texto usada para dar contexto ao agente e os metadados.
--
--   * Qualquer membro do workspace aprova (cada aprovação registra o autor via auth.uid()).
--   * Quem aprovou, o proprietário e o administrador revogam. Revogado deixa de ser usado, mas
--     permanece como histórico; um mesmo texto só tem uma aprovação ativa por cliente.
--   * Só proprietário e administrador excluem de vez.
--   * O texto aprovado não muda: para corrigir, revoga e aprova a nova versão. O vínculo com o
--     arquivo do drive pode ser preenchido uma vez depois da aprovação (o arquivo é salvo em seguida).

begin;

create table if not exists public.client_code_patterns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  module_id uuid not null,
  file_id uuid references public.client_files(id) on delete set null,
  source_chat_id uuid references public.chats(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text check (description is null or char_length(description) <= 500),
  kind text not null default 'snippet'
    check (kind in ('snippet', 'report', 'class', 'function', 'include', 'interface', 'other')),
  tags text[] not null default '{}' check (cardinality(tags) <= 8),
  content text not null check (char_length(content) between 1 and 60000),
  content_hash text generated always as (md5(content)) stored,
  approved_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  approved_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  foreign key (client_id, module_id) references public.client_modules(client_id, id) on delete cascade
);
create unique index if not exists client_code_patterns_active_hash
  on public.client_code_patterns(client_id, content_hash) where revoked_at is null;
create index if not exists client_code_patterns_client_idx
  on public.client_code_patterns(client_id, approved_at desc) where revoked_at is null;

create or replace function public.guard_client_code_pattern()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.approved_by := auth.uid();
    new.approved_at := now();
    new.revoked_at := null;
    new.revoked_by := null;
    if new.file_id is not null and not exists (select 1 from public.client_files f
      where f.id = new.file_id and f.client_id = new.client_id) then
      raise exception 'Pattern file belongs to another client';
    end if;
    return new;
  end if;
  if new.client_id is distinct from old.client_id or new.module_id is distinct from old.module_id
    or new.content is distinct from old.content or new.approved_by is distinct from old.approved_by
    or new.approved_at is distinct from old.approved_at
    or (old.file_id is not null and new.file_id is distinct from old.file_id)
    or new.source_chat_id is distinct from old.source_chat_id or new.kind is distinct from old.kind then
    raise exception 'Approved pattern content cannot be changed; revoke it and approve the new version';
  end if;
  if old.revoked_at is not null then
    raise exception 'Revoked pattern cannot be changed';
  end if;
  if new.revoked_at is not null then
    new.revoked_at := now();
    new.revoked_by := auth.uid();
  else
    new.revoked_by := null;
  end if;
  return new;
end $$;
drop trigger if exists client_code_patterns_guard on public.client_code_patterns;
create trigger client_code_patterns_guard before insert or update on public.client_code_patterns
  for each row execute function public.guard_client_code_pattern();

alter table public.client_code_patterns enable row level security;

drop policy if exists client_code_patterns_select on public.client_code_patterns;
create policy client_code_patterns_select on public.client_code_patterns for select to authenticated
  using (public.can_access_client(client_id));
drop policy if exists client_code_patterns_insert on public.client_code_patterns;
create policy client_code_patterns_insert on public.client_code_patterns for insert to authenticated
  with check (approved_by = auth.uid() and public.can_access_client(client_id));
drop policy if exists client_code_patterns_update on public.client_code_patterns;
create policy client_code_patterns_update on public.client_code_patterns for update to authenticated
  using (public.can_access_client(client_id)
    and (approved_by = auth.uid() or public.can_admin_client(client_id)))
  with check (public.can_access_client(client_id));
drop policy if exists client_code_patterns_delete on public.client_code_patterns;
create policy client_code_patterns_delete on public.client_code_patterns for delete to authenticated
  using (public.can_admin_client(client_id));

grant select, insert, update, delete on public.client_code_patterns to authenticated;

commit;
