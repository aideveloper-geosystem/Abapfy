-- Apply after 035. Preserve legacy per-user copies; seed one shared row per company.
-- When copies differ: prefer MASTER, then ADMIN, then most recently updated.
begin;
create table if not exists public.cliente_parametros_compartilhados (
  id uuid primary key default gen_random_uuid(),
  empresa text not null,
  levantamento numeric(6, 2) not null default 1,
  impl_proposal numeric(6, 2) not null default 0,
  esp_func numeric(6, 2) not null default 1,
  esp_tec numeric(6, 2) not null default 1,
  codific numeric(6, 2) not null default 1,
  traducao_en numeric(6, 2) not null default 0,
  traducao_es numeric(6, 2) not null default 0,
  teste_unitario numeric(6, 2) not null default 1,
  teste_qas numeric(6, 2) not null default 1,
  bpp_pt numeric(6, 2) not null default 0,
  bpp_en numeric(6, 2) not null default 0,
  bpp_es numeric(6, 2) not null default 0,
  teste_volume numeric(6, 2) not null default 0,
  homologacao numeric(6, 2) not null default 0,
  access_control numeric(6, 2) not null default 1,
  homologacao_2 numeric(6, 2) not null default 1,
  go_live numeric(6, 2) not null default 1,
  documentacao numeric(6, 2) not null default 1,
  gerencia numeric(6, 2) not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa)
);
insert into public.cliente_parametros_compartilhados (empresa, levantamento, impl_proposal, esp_func, esp_tec, codific, traducao_en, traducao_es, teste_unitario, teste_qas, bpp_pt, bpp_en, bpp_es, teste_volume, homologacao, access_control, homologacao_2, go_live, documentacao, gerencia)
select btrim(p.empresa), p.levantamento, p.impl_proposal, p.esp_func, p.esp_tec, p.codific, p.traducao_en, p.traducao_es, p.teste_unitario, p.teste_qas, p.bpp_pt, p.bpp_en, p.bpp_es, p.teste_volume, p.homologacao, p.access_control, p.homologacao_2, p.go_live, p.documentacao, p.gerencia from (
  select distinct on (lower(btrim(c.empresa))) c.*
  from public.cliente_parametros c left join public.app_roles r on r.user_id = c.user_id
  order by lower(btrim(c.empresa)), case r.role when 'MASTER' then 0 when 'ADMIN' then 1 else 2 end,
    c.updated_at desc, c.id
) p on conflict (empresa) do nothing;
create unique index if not exists shared_client_parameters_company on public.cliente_parametros_compartilhados (lower(btrim(empresa)));
alter table public.cliente_parametros_compartilhados enable row level security;
create policy shared_client_parameters_read on public.cliente_parametros_compartilhados
  for select to authenticated using (true);
create policy shared_client_parameters_insert on public.cliente_parametros_compartilhados
  for insert to authenticated with check (public.is_abapfy_admin());
create policy shared_client_parameters_update on public.cliente_parametros_compartilhados
  for update to authenticated using (public.is_abapfy_admin()) with check (public.is_abapfy_admin());
create policy shared_client_parameters_delete on public.cliente_parametros_compartilhados
  for delete to authenticated using (public.is_abapfy_admin());
create trigger shared_client_parameters_updated before update on public.cliente_parametros_compartilhados
  for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.cliente_parametros_compartilhados to authenticated;
-- Retain legacy rows for recovery, but retire direct edits to the old per-user copies.
drop policy if exists cliente_parametros_insert_own on public.cliente_parametros;
drop policy if exists cliente_parametros_update_own on public.cliente_parametros;
drop policy if exists cliente_parametros_delete_own on public.cliente_parametros;
commit;
