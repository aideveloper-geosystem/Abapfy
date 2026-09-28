-- Apply after 030. MASTER/ADMIN manage the shared catalog and their own imported agents.
-- Existing chat snapshots remain unchanged; the client checks enabled before new sends.

alter table public.default_agents
  add column if not exists enabled boolean not null default true;
alter table public.user_agents
  add column if not exists enabled boolean not null default true;

drop policy if exists default_agents_admin_update on public.default_agents;
create policy default_agents_admin_update on public.default_agents
  for update to authenticated
  using (public.is_abapfy_admin())
  with check (public.is_abapfy_admin());

drop policy if exists "user_agents_update_own" on public.user_agents;
drop policy if exists user_agents_admin_update_own on public.user_agents;
create policy user_agents_admin_update_own on public.user_agents
  for update to authenticated
  using (user_id = auth.uid() and public.is_abapfy_admin())
  with check (user_id = auth.uid() and public.is_abapfy_admin());
