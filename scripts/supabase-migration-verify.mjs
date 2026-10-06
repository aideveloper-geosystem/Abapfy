import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { jsonQuery, literal, identifier, redact } from './supabase-migration-access.mjs'

try {
  const folder = (await readFile('.supabase-migration/active-backup.txt','utf8')).trim()
  const tables = await jsonQuery('SOURCE', `select json_agg(json_build_object('schema',schemaname,'table',tablename) order by schemaname,tablename) from pg_tables where schemaname in ('public','auth') and not (schemaname='auth' and tablename='schema_migrations');`)
  const countsSql = 'select json_agg(row_to_json(summary)) from ('+tables.map(t=>`select ${literal(t.schema+'.'+t.table)} as name, count(*) as rows, md5(coalesce(string_agg(row_to_json(t)::text, E'\n' order by row_to_json(t)::text),'')) as checksum from ${identifier(t.schema)}.${identifier(t.table)} t`).join(' UNION ALL ')+') summary;'
  const source = await jsonQuery('SOURCE',countsSql)
  const target = await jsonQuery('TARGET',countsSql)
  const mismatches = source.filter((s,i)=>s.rows!==target[i].rows || s.checksum!==target[i].checksum)
  const structureSql = `select json_build_object(
    'policies',(select json_agg(row_to_json(p) order by schemaname,tablename,policyname) from pg_policies p where schemaname in ('public','auth','storage')),
    'tables',(select json_agg(json_build_object('name',c.relname,'rls',c.relrowsecurity,'forced',c.relforcerowsecurity) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'),
    'functions',(select json_agg(json_build_object('name',p.oid::regprocedure::text,'definition',md5(pg_get_functiondef(p.oid)),'owner',pg_get_userbyid(p.proowner),'acl',(select json_agg(json_build_object('grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable) order by case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,a.privilege_type) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a)) order by p.oid::regprocedure::text) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname<>'rls_auto_enable'),
    'triggers',(select json_agg(pg_get_triggerdef(t.oid) order by n.nspname,c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid join pg_namespace fn on fn.oid=p.pronamespace where not t.tgisinternal and (n.nspname='public' or (n.nspname in ('auth','storage') and fn.nspname='public'))),
    'constraints',(select json_agg(json_build_object('table',c.conrelid::regclass::text,'name',c.conname,'definition',pg_get_constraintdef(c.oid),'validated',c.convalidated) order by c.conrelid::regclass::text,c.conname) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public'),
    'grants',(select json_agg(row_to_json(g) order by table_name,grantee,privilege_type) from information_schema.table_privileges g where table_schema='public'),
    'sequences',(select json_agg(json_build_object('name',sequencename,'last_value',last_value,'increment',increment_by,'start',start_value) order by sequencename) from pg_sequences where schemaname='public'),
    'publications',(select json_agg(row_to_json(p) order by pubname,schemaname,tablename) from pg_publication_tables p),
    'storage',(select json_agg(json_build_object('id',id,'bucket',bucket_id,'path',name,'owner',owner,'owner_id',owner_id,'size',metadata->>'size') order by bucket_id,name) from storage.objects),
    'providers',(select json_agg(distinct provider) from auth.identities)
  );`
  const sourceStructure = await jsonQuery('SOURCE',structureSql)
  const targetStructure = await jsonQuery('TARGET',structureSql)
  const structureMismatches = Object.keys(sourceStructure).filter(k=>JSON.stringify(sourceStructure[k])!==JSON.stringify(targetStructure[k]))
  const report = {verified_at:new Date().toISOString(),tables_checked:tables.length,public_tables:tables.filter(t=>t.schema==='public').length,source,target,data_mismatches:mismatches,structure_mismatches:structureMismatches,providers:sourceStructure.providers}
  await writeFile(resolve(folder,'verification.json'),JSON.stringify(report,null,2))
  console.log(JSON.stringify({tables_checked:tables.length,public_tables:report.public_tables,data_mismatch_names:mismatches.map(m=>m.name),structure_mismatches:structureMismatches,providers:report.providers}))
  if (mismatches.length || structureMismatches.length) process.exitCode=1
} catch(error) { console.error(redact(error.message)); process.exitCode=1 }
