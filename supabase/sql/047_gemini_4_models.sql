-- Apply after 046. Adds the Gemini 4 family and Gemini 3.8 Flash to the model catalog.
-- Existing Gemini rows stay enabled so saved defaults and chats keep working;
-- admins can disable them from the catalog once users have migrated.
-- gemini-3.6-flash is scheduled for retirement on 2026-11-19 (replacement: gemini-3.8-flash).
-- Idempotent: safe to run again.

insert into public.ai_models(provider, model_id, label, description) values
 ('gemini','gemini-4-carbon','Gemini 4 Carbon','Raciocínio avançado'),
 ('gemini','gemini-4-argon','Gemini 4 Argon','Raciocínio eficiente'),
 ('gemini','gemini-4-hydrogen','Gemini 4 Hydrogen','Código e agentes'),
 ('gemini','gemini-3.8-flash','Gemini 3.8 Flash','Uso diário')
on conflict (provider, model_id) do update
  set label = excluded.label,
      description = excluded.description,
      enabled = true;

update public.ai_models set description = 'Geração anterior'
 where provider = 'gemini' and model_id in ('gemini-3.1-pro-preview');

update public.ai_models set description = 'Descontinuado em 19/11/2026'
 where provider = 'gemini' and model_id = 'gemini-3.6-flash';
