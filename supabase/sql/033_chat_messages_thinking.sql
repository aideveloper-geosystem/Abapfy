-- Apply after 032. Stores Claude's summarized reasoning and time spent thinking
-- for assistant messages, so the collapsed "Pensou por Xs" row survives reloads.
-- Shape: {"text": "<summary>", "ms": <number>}. Null for providers without thinking.
-- Idempotent: safe to run again. The client keeps working before this is applied.

alter table public.chat_messages
  add column if not exists thinking jsonb;

comment on column public.chat_messages.thinking is
  'Resumo do raciocínio do modelo (display summarized) e tempo pensando: {"text": string, "ms": number}.';
