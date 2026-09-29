-- Apply after 033. Per-user AI preferences edited in Configurações → Inteligência Artificial.
-- Shape: {"defaultEffort": "low|medium|high|xhigh|max", "showThinking": bool,
--         "webSearch": bool, "webFetch": bool}. Missing keys fall back to the app
-- defaults (web tools off, since they are billed separately).
-- Existing RLS on user_settings (owner-only) already covers this column.
-- Idempotent: safe to run again.

alter table public.user_settings
  add column if not exists ai_preferences jsonb not null default '{}'::jsonb;

comment on column public.user_settings.ai_preferences is
  'Preferências de IA do usuário: effort padrão, exibição do raciocínio e ferramentas web cobradas à parte.';
