-- Abapfy Admin — administradores do dashboard
--
-- Roda no MESMO projeto Supabase do app desktop (external/ só lê/escreve
-- tabelas novas aqui, nunca duplica auth.users). Um admin é um usuário comum
-- do Supabase Auth (mesma tabela auth.users) marcado como administrador
-- nesta tabela — não existe uma auth.users separada para o dashboard.
--
-- RLS fica habilitada mas SEM policy nenhuma (deny-all para anon/authenticated
-- de propósito): o dashboard só acessa isso via service_role no server
-- (Next.js Server Components/Actions), que ignora RLS. Nunca é consultada
-- do navegador com a anon key.

create table if not exists public.admin_users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text not null,
  role text not null default 'admin' check (role in ('owner', 'admin', 'viewer')),
  created_at timestamptz not null default now()
);

comment on table public.admin_users is
  'Usuários do Supabase Auth com acesso ao dashboard administrativo do Abapfy. owner = primeiro admin (bootstrap) + convida outros; admin = gerencia; viewer = só leitura.';

alter table public.admin_users enable row level security;
