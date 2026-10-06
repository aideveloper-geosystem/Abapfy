-- Abapfy Admin — tabela de preço por modelo (para estimativa de custo)
--
-- chat_messages (do app Abapfy) grava tokens_input/tokens_output por
-- resposta do assistente, e chats.model grava o model_id exato usado naquele
-- chat (ver src/renderer/src/lib/aiProviders.ts no app principal) — não o
-- provedor sozinho, o id do modelo. O dashboard casa chats.model com
-- model_pricing.model_id (match exato de string) pra converter tokens em
-- US$ estimado. Modelo sem linha aqui aparece como "sem preço cadastrado" em
-- vez de custo errado/zerado silencioso.
--
-- `create or replace function` (não `create or replace ... if not exists`)
-- de propósito: se este SQL rodar no mesmo projeto do app Abapfy, a função já
-- existe idêntica desde sql/001_profiles.sql — redefinir é inofensivo. Se
-- rodar num projeto novo, cria do zero.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.model_pricing (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('openai', 'gemini', 'claude')),
  model_id text not null unique,
  label text not null,
  input_price_per_million numeric(10, 4) not null default 0,
  output_price_per_million numeric(10, 4) not null default 0,
  notes text,
  updated_at timestamptz not null default now()
);

comment on table public.model_pricing is
  'US$ por 1M de tokens (input/output) por model_id exato — editável em Configurações → Preços do dashboard. Fonte: preços públicos dos provedores; revisar periodicamente.';

drop trigger if exists model_pricing_set_updated_at on public.model_pricing;
create trigger model_pricing_set_updated_at
  before update on public.model_pricing
  for each row
  execute function public.set_updated_at();

alter table public.model_pricing enable row level security;

-- Seed: preços Anthropic vigentes em 2026-08 (Claude API, tabela oficial de
-- preços). Sonnet 5 tem promoção de lançamento (US$2,00/US$10,00) válida até
-- 2026-08-31 — a linha abaixo já usa o preço padrão pós-promoção; ajuste
-- manualmente na tela de Preços enquanto a promoção estiver ativa, se quiser
-- refletir o valor exato do período.
insert into public.model_pricing (provider, model_id, label, input_price_per_million, output_price_per_million, notes)
values
  ('claude', 'claude-fable-5', 'Claude Fable 5', 10.00, 50.00, 'Modelo mais capaz da Anthropic. Retenção de dados de 30 dias obrigatória.'),
  ('claude', 'claude-opus-5', 'Claude Opus 5', 5.00, 25.00, null),
  ('claude', 'claude-opus-4-8', 'Claude Opus 4.8', 5.00, 25.00, null),
  ('claude', 'claude-opus-4-7', 'Claude Opus 4.7', 5.00, 25.00, null),
  ('claude', 'claude-opus-4-6', 'Claude Opus 4.6', 5.00, 25.00, null),
  ('claude', 'claude-sonnet-5', 'Claude Sonnet 5', 3.00, 15.00, 'Promoção de lançamento US$2,00/US$10,00 até 2026-08-31.'),
  ('claude', 'claude-sonnet-4-6', 'Claude Sonnet 4.6', 3.00, 15.00, null),
  ('claude', 'claude-haiku-4-5-20251001', 'Claude Haiku 4.5', 1.00, 5.00, 'Id com data — é o exato usado pelo catálogo do app (aiProviders.ts).'),
  ('claude', 'claude-haiku-4-5', 'Claude Haiku 4.5', 1.00, 5.00, 'Id sem data, caso o app passe a usar essa variante.')
on conflict (model_id) do nothing;

-- OpenAI/Gemini: o app oferece esses provedores, mas os ids do catálogo
-- (gpt-5.6-*, gemini-3.*) não têm preço público verificado nesta revisão —
-- entram com 0 pra não estimar custo errado; edite na tela de Preços.
insert into public.model_pricing (provider, model_id, label, input_price_per_million, output_price_per_million, notes)
values
  ('openai', 'gpt-5.6-sol', 'GPT-5.6 Sol', 0, 0, 'Preço não verificado — edite antes de confiar na estimativa.'),
  ('openai', 'gpt-5.6-terra', 'GPT-5.6 Terra', 0, 0, 'Preço não verificado — edite antes de confiar na estimativa.'),
  ('openai', 'gpt-5.6-luna', 'GPT-5.6 Luna', 0, 0, 'Preço não verificado — edite antes de confiar na estimativa.'),
  ('openai', 'gpt-5-codex', 'GPT-5 Codex', 0, 0, 'Preço não verificado — edite antes de confiar na estimativa.'),
  ('gemini', 'gemini-3.6-flash', 'Gemini 3.6 Flash', 0, 0, 'Preço não verificado — edite antes de confiar na estimativa.'),
  ('gemini', 'gemini-3.1-pro-preview', 'Gemini 3.1 Pro', 0, 0, 'Preço não verificado — edite antes de confiar na estimativa.'),
  ('gemini', 'gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite', 0, 0, 'Preço não verificado — edite antes de confiar na estimativa.')
on conflict (model_id) do nothing;
