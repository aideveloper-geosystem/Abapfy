-- Apply after 041. Safe to run more than once.
-- Replaces the SAP Horizon/Quartz catalogue with two macOS-style themes:
-- abapfy-dark (default) and abapfy-light. Saved preferences keep their light/dark mode.

alter table public.user_settings drop constraint if exists user_settings_theme_check;

update public.user_settings
set theme = case
  when theme in ('sap-horizon-light', 'sap-quartz-light', 'sap-horizon-hcw') then 'abapfy-light'
  else 'abapfy-dark'
end
where theme is distinct from 'abapfy-dark' and theme is distinct from 'abapfy-light';

alter table public.user_settings alter column theme set default 'abapfy-dark';
alter table public.user_settings add constraint user_settings_theme_check
  check (theme in ('abapfy-dark', 'abapfy-light'));
