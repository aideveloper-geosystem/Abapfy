-- Apply after 037. MCPs passam a ser pessoais: cada usuário cadastra, ativa e
-- configura os próprios servidores. SAP Docs e SAP ABAP são globais no app
-- (não dependem de linhas nesta tabela) e a gestão por usuário feita por
-- MASTER/ADMIN deixa de ser necessária. Os vínculos por agente deixam de ser
-- usados: todo MCP ativo vale para todos os agentes da conta.

drop policy if exists mcp_servers_admin_read on public.mcp_servers;
drop policy if exists mcp_servers_admin_insert on public.mcp_servers;
drop policy if exists mcp_servers_admin_update on public.mcp_servers;
drop policy if exists mcp_servers_admin_delete on public.mcp_servers;
drop policy if exists mcp_servers_select_own on public.mcp_servers;
drop policy if exists mcp_servers_insert_own on public.mcp_servers;
drop policy if exists mcp_servers_update_own on public.mcp_servers;
drop policy if exists mcp_servers_delete_own on public.mcp_servers;

create policy mcp_servers_select_own on public.mcp_servers for select to authenticated
  using (user_id = auth.uid());
create policy mcp_servers_insert_own on public.mcp_servers for insert to authenticated
  with check (user_id = auth.uid());
create policy mcp_servers_update_own on public.mcp_servers for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy mcp_servers_delete_own on public.mcp_servers for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists mcp_bindings_admin_read on public.mcp_agent_bindings;
drop policy if exists mcp_bindings_admin_insert on public.mcp_agent_bindings;
drop policy if exists mcp_bindings_admin_update on public.mcp_agent_bindings;
drop policy if exists mcp_bindings_admin_delete on public.mcp_agent_bindings;
drop policy if exists mcp_agent_bindings_select_own on public.mcp_agent_bindings;
drop policy if exists mcp_agent_bindings_delete_own on public.mcp_agent_bindings;

create policy mcp_agent_bindings_select_own on public.mcp_agent_bindings for select to authenticated
  using (user_id = auth.uid());
create policy mcp_agent_bindings_delete_own on public.mcp_agent_bindings for delete to authenticated
  using (user_id = auth.uid());
