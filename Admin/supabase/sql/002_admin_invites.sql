-- Abapfy Admin — convites de administrador
--
-- Registro em /register só cria um admin_users se: (a) admin_users está
-- vazia ainda (bootstrap do primeiro owner) OU (b) o e-mail tem um convite
-- pendente aqui. Sem isso, qualquer pessoa com acesso ao Supabase anon key
-- (que já é pública no app desktop) poderia se auto-registrar como admin.

create table if not exists public.admin_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role text not null default 'admin' check (role in ('owner', 'admin', 'viewer')),
  invited_by uuid references public.admin_users (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

comment on table public.admin_invites is
  'Allowlist de e-mails autorizados a se registrar como administrador. accepted_at marcado quando o convite vira um admin_users de fato.';

create index if not exists admin_invites_email_pending_idx
  on public.admin_invites (email)
  where accepted_at is null;

alter table public.admin_invites enable row level security;
