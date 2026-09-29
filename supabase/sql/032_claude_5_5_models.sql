-- Apply after 031. Adds Claude Opus 5.5 and Sonnet 5.5 to the model catalog.
-- Existing Claude rows stay enabled so saved defaults and chats keep working;
-- admins can disable them from the catalog once users have migrated.
-- Idempotent: safe to run again.

insert into public.ai_models(provider, model_id, label, description) values
 ('claude','claude-opus-5-5','Claude Opus 5.5','Raciocínio e tarefas longas'),
 ('claude','claude-sonnet-5-5','Claude Sonnet 5.5','Uso diário')
on conflict (provider, model_id) do update
  set label = excluded.label,
      description = excluded.description,
      enabled = true;

-- The previous generation is relabeled so the picker makes the newer default obvious.
update public.ai_models set description = 'Geração anterior'
 where provider = 'claude' and model_id in ('claude-sonnet-5', 'claude-opus-4-8');
