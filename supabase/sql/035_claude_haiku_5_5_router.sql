-- Apply after 034. Router model for Claude Haiku 5.5.
-- Preserve the old model, saved defaults and administrative restrictions.
-- Existing Haiku 5.5 enablement is not changed on reapplication.
begin;

insert into public.ai_models(provider, model_id, label, description, enabled)
values (
  'claude', 'claude-haiku-5-5', 'Claude Haiku 5.5', 'Alto volume e roteamento',
  coalesce((select enabled from public.ai_models
    where provider = 'claude' and model_id = 'claude-haiku-4-5-20251001'), true)
)
on conflict (provider, model_id) do update
  set label = excluded.label, description = excluded.description;

-- Carry forward per-user restrictions on the previous router.
insert into public.ai_model_blocks(user_id, provider, model_id, blocked_at)
select user_id, provider, 'claude-haiku-5-5', blocked_at
from public.ai_model_blocks
where provider = 'claude' and model_id = 'claude-haiku-4-5-20251001'
on conflict (user_id, provider, model_id) do nothing;

commit;
