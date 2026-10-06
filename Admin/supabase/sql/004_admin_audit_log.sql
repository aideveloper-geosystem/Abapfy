-- Abapfy Admin — trilha de auditoria de ações administrativas
--
-- Toda ação que muda estado a partir do dashboard (convidar admin, editar
-- preço de modelo, desativar usuário...) grava uma linha aqui — quem, o quê,
-- quando. Sem isso, um dashboard com poder de gerenciar usuários reais não
-- tem como responder "quem mudou isso" depois.

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.admin_users (id) on delete set null,
  admin_email text not null,
  action text not null,
  target text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

comment on table public.admin_audit_log is
  'Trilha de auditoria das ações feitas no dashboard administrativo. admin_email fica denormalizado (sobrevive a admin_id virar null se a conta for removida).';

create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security;
