# Abapfy Admin

Dashboard administrativo do Abapfy — Next.js 15 (App Router) + Material UI. Lê **o mesmo projeto
Supabase** do app desktop (`../` na raiz do repo): nenhum dado de usuário é duplicado, só duas
tabelas novas (`admin_users`, `model_pricing`, etc. — ver `supabase/README.md`) existem só aqui.

## Stack

- **Next.js 15** (App Router, Server Components + Server Actions — sem API routes separadas pra
  mutação)
- **Material UI v6** (`@mui/material`, `@mui/x-charts` pros gráficos, `@mui/x-data-grid` disponível
  se alguma tabela crescer o bastante pra precisar de paginação/virtualização nativa)
- **@supabase/ssr** pra sessão via cookie (login do admin) + **service_role** server-only
  (`lib/supabase/admin.ts`) pra agregar dado de todos os usuários apesar da RLS

## Fluxos implementados

1. **Registro de administrador** (`/register`) — o primeiro cadastro (com `admin_users` vazia)
   vira automaticamente o `owner`. Depois disso, todo cadastro exige um convite pendente em
   `admin_invites` (e-mail exato) — ver tela **Administradores** (só o owner enxerga).
2. **Login** (`/login`) — e-mail/senha via Supabase Auth; a sessão também precisa ter linha em
   `admin_users`, senão é recusada mesmo com credenciais válidas (usuário comum do Abapfy não
   entra aqui).
3. **Visão geral** (`/dashboard`) — KPIs (usuários, conversas, tokens, custo estimado 90 dias),
   gráfico de requests/tokens por dia, uso por modelo e top usuários por consumo.
4. **Uso e requests** (`/dashboard/usage`) — requests por dia (30 dias), tokens por provedor
   (pizza), detalhe por provedor.
5. **Usuários** (`/dashboard/users`) — todo usuário do Abapfy com conversas/respostas/tokens/custo
   dos últimos 90 dias, provedores de IA configurados, busca por nome/empresa/cargo.
6. **Preços por modelo** (`/dashboard/pricing`) — US$ por 1M tokens (entrada/saída) por
   `model_id` exato, editável inline; é o que converte tokens em custo estimado em todo o resto
   do dashboard. Seedado com os preços Anthropic vigentes (ver
   `supabase/sql/003_model_pricing.sql`); OpenAI/Gemini entram com 0 (preço não verificado) —
   edite antes de confiar na estimativa desses provedores.
7. **Administradores** (`/dashboard/admins`, só owner) — convidar por e-mail, revogar convite,
   remover acesso de outro admin.

Toda ação que muda estado (editar preço, convidar/remover admin) grava uma linha em
`admin_audit_log` (`lib/auth.ts::logAuditAction`).

## Rodando local

```bash
pnpm install
cp .env.example .env.local   # preencha com as credenciais do MESMO projeto Supabase do app desktop
pnpm dev                      # http://localhost:3000
```

Antes do primeiro `pnpm dev`, rode as migrações em `supabase/sql/` (ordem descrita em
`supabase/README.md`) no projeto Supabase — precisa já ter rodado `../supabase/sql` (001–014) do
app principal antes.

## Segurança

- `SUPABASE_SERVICE_ROLE_KEY` só é lida em Server Components/Actions (nunca enviada ao browser).
  Não a coloque em nenhuma variável `NEXT_PUBLIC_*`.
- `admin_users`/`admin_invites`/`model_pricing`/`admin_audit_log` têm RLS habilitada sem policy
  nenhuma (deny-all pra `anon`/`authenticated`) — só acessíveis via `service_role`, de propósito.
- Registro é allowlist-only (bootstrap do primeiro owner + convite depois) — não existe
  autocadastro livre.

## Scripts

```bash
pnpm dev         # desenvolvimento
pnpm build       # build de produção
pnpm start       # roda o build (após pnpm build)
pnpm typecheck   # tsc --noEmit
pnpm lint        # next lint
```
