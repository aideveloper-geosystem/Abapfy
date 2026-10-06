# Supabase — Abapfy Admin

Roda no **mesmo projeto Supabase** do app desktop Abapfy (`../../supabase`) — o dashboard lê
`profiles`/`chats`/`chat_messages` de lá direto, sem duplicar dado. Estes scripts só criam as
tabelas novas que o dashboard precisa (não existem no app principal).

## Ordem de execução

Aplique **depois** de todo o `../../supabase/sql` (001 a 014) já estar rodado no mesmo projeto.

1. `sql/001_admin_users.sql` — quem é administrador (referencia `auth.users`, mesma tabela do
   app principal). RLS habilitada sem policy — só acessível via `service_role` no server.
2. `sql/002_admin_invites.sql` — allowlist de e-mails autorizados a se registrar como admin.
3. `sql/003_model_pricing.sql` — US$ por 1M de tokens por `model_id` exato (casa com
   `chats.model` do app principal), seedado com os preços Anthropic vigentes em 2026-08.
   OpenAI/Gemini entram com preço 0 (não verificado) — edite em Preços no dashboard.
4. `sql/004_admin_audit_log.sql` — trilha de auditoria das ações do dashboard.

## Variáveis de ambiente

Copie `.env.example` (na raiz de `external/`) para `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — as mesmas do app desktop
  (`AbapfyV2/.env`), projeto Supabase compartilhado.
- `SUPABASE_SERVICE_ROLE_KEY` — **só** em Project Settings → API → `service_role`. Nunca é
  enviada ao navegador (só lida em Server Components/Actions); é o que permite o dashboard
  agregar dado de todos os usuários apesar da RLS de `chats`/`chat_messages` restringir cada
  usuário ao próprio dado.

## Primeiro acesso

`/register` só cria uma conta se `admin_users` estiver vazia (bootstrap do primeiro owner) ou
se o e-mail tiver uma linha pendente em `admin_invites`. Depois do primeiro owner, convide os
próximos administradores pela tela **Administradores** do dashboard (grava em
`admin_invites`, que o próprio `/register` consome).
