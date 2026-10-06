import { mkdir, writeFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { run, query, jsonQuery, redact } from './supabase-migration-access.mjs'

const folder = resolve('.supabase-migration', 'backup-' + new Date().toISOString().replaceAll(':','-'))
await mkdir(folder, { recursive: true })
try {
  const inspection = await jsonQuery('SOURCE', `select json_build_object(
    'vault_secret_count',(select count(*) from vault.secrets),
    'roles',(select json_agg(json_build_object('name',rolname,'login',rolcanlogin)) from pg_roles),
    'columns',(select json_agg(json_build_object('schema',table_schema,'table',table_name,'column',column_name,'type',udt_name)) from information_schema.columns where table_schema in ('public','auth','storage')),
    'policies',(select coalesce(json_agg(row_to_json(p)), '[]'::json) from pg_policies p where schemaname in ('auth','storage')),
    'publications',(select coalesce(json_agg(row_to_json(p)), '[]'::json) from pg_publication_tables p),
    'storage_objects',(select coalesce(json_agg(row_to_json(o)), '[]'::json) from storage.objects o),
    'storage_buckets',(select coalesce(json_agg(row_to_json(b)), '[]'::json) from storage.buckets b)
  );`)
  await writeFile(resolve(folder,'inspection.json'), JSON.stringify(inspection,null,2))
  if (inspection.vault_secret_count) throw new Error('Vault contains encrypted secrets: migrate encryption key before restore')
  for (const [file,args] of [
    ['public-schema.sql',['--schema-only','--schema=public','--no-owner']],
    ['app-auth-data.sql',['--data-only','--schema=public','--schema=auth','--exclude-table=auth.schema_migrations','--no-owner']],
    ['managed-schema-reference.sql',['--schema-only','--schema=auth','--schema=storage','--no-owner']]
  ]) {
    await run('SOURCE','pg_dump',['-w','--no-security-labels',...args,'--file',resolve(folder,file)])
    console.log(JSON.stringify({backup:file,bytes:(await stat(resolve(folder,file))).size}))
  }
  const custom = await query('SOURCE', `select pg_get_triggerdef(t.oid)||';' from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid join pg_namespace fn on fn.oid=p.pronamespace where not t.tgisinternal and n.nspname in ('auth','storage') and fn.nspname='public';`)
  await writeFile(resolve(folder,'custom-managed-triggers.sql'),custom)
  await writeFile('.supabase-migration/active-backup.txt',folder)
  console.log(JSON.stringify({backup_folder:folder, vault_secrets:inspection.vault_secret_count, storage_objects:inspection.storage_objects.length, managed_policies:inspection.policies.length, role_names:inspection.roles.map(r=>r.name)}))
} catch (error) { console.error(redact(error.message)); process.exitCode=1 }
