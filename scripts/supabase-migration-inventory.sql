-- Run in the SOURCE project's SQL Editor before choosing the restore method.
-- Read-only inventory: no user emails, password hashes, API keys or file contents.
begin transaction read only;

select current_database() as database_name,
       current_setting('server_version') as postgres_version,
       pg_size_pretty(pg_database_size(current_database())) as database_size;

select extname as extension, extversion as version, n.nspname as schema
from pg_extension e join pg_namespace n on n.oid = e.extnamespace
order by extname;

select n.nspname as schema, c.relname as table_name,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced,
       pg_size_pretty(pg_total_relation_size(c.oid)) as total_size
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'auth', 'storage') and c.relkind in ('r', 'p')
order by n.nspname, c.relname;

-- Generates SELECT statements for exact public table counts. Execute the returned
-- statements in the SQL Editor separately; do not substitute statistics estimates.
select format('select %L as table_name, count(*) as row_count from %I.%I;',
              n.nspname || '.' || c.relname, n.nspname, c.relname) as count_statement
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition
order by c.relname;

select count(*) as auth_users from auth.users;
select count(*) as auth_identities from auth.identities;

select b.id as bucket_id, b.public, b.file_size_limit, b.allowed_mime_types,
       count(o.id) as object_metadata_count
from storage.buckets b left join storage.objects o on o.bucket_id = b.id
group by b.id, b.public, b.file_size_limit, b.allowed_mime_types
order by b.id;

select schemaname, tablename, policyname, permissive, roles, cmd,
       md5(coalesce(qual, '') || '|' || coalesce(with_check, '')) as expression_fingerprint
from pg_policies where schemaname in ('public', 'auth', 'storage')
order by schemaname, tablename, policyname;

select n.nspname as schema, c.relname as table_name, t.tgname as trigger_name,
       fn.nspname as function_schema, p.proname as function_name
from pg_trigger t join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
join pg_namespace fn on fn.oid = p.pronamespace
where not t.tgisinternal and n.nspname in ('public', 'auth', 'storage')
order by n.nspname, c.relname, t.tgname;

select pubname, schemaname, tablename from pg_publication_tables
order by pubname, schemaname, tablename;

select nspname as optional_schema
from pg_namespace where nspname in ('supabase_migrations', 'vault', 'cron', 'net');

commit;
