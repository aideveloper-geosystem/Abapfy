import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { query, jsonQuery, run, literal, identifier, redact } from './supabase-migration-access.mjs'

try {
  const folder = (await readFile('.supabase-migration/active-backup.txt','utf8')).trim()
  const inspection = JSON.parse(await readFile(resolve(folder,'inspection.json'),'utf8'))
  const target = await jsonQuery('TARGET', `select json_build_object('tables',(select count(*) from pg_tables where schemaname='public'), 'users',(select count(*) from auth.users), 'objects',(select count(*) from storage.objects), 'roles',(select json_agg(rolname) from pg_roles), 'columns',(select json_agg(json_build_object('schema',table_schema,'table',table_name,'column',column_name,'type',udt_name)) from information_schema.columns where table_schema='auth'));`)
  if (target.tables || target.users || target.objects) throw new Error('Destination is not empty; refusing initial restore')
  const missingRoles = inspection.roles.filter(r=>!target.roles.includes(r.name))
  if (missingRoles.length) throw new Error('Role differences require review: '+missingRoles.map(r=>r.name).join(','))
  const targetColumns = new Map(target.columns.map(c=>[`${c.schema}.${c.table}.${c.column}`,c.type]))
  const mismatch = inspection.columns.filter(c=>c.schema==='auth' && c.table!=='schema_migrations' && targetColumns.get(`${c.schema}.${c.table}.${c.column}`)!==c.type)
  if (mismatch.length) throw new Error('Auth column differences require review: '+mismatch.map(c=>`${c.table}.${c.column}`).join(','))
  let schema = await readFile(resolve(folder,'public-schema.sql'),'utf8')
  schema = schema.replace(/^CREATE SCHEMA public;$/m,'CREATE SCHEMA IF NOT EXISTS public;')
  // This platform event-trigger helper exists even in an otherwise empty project.
  schema = schema.replace(/CREATE FUNCTION public\.rls_auto_enable\(\)[\s\S]*?\n\$\$;/, '')
  schema = schema.split('\n').filter(line=>!/^GRANT .* ON FUNCTION public\.rls_auto_enable\(\)/.test(line)).join('\n')
  // Managed-role defaults already belong to the new platform installation.
  const managedDefaults = schema.split('\n').filter(line=>line.startsWith('ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin '))
  schema = schema.split('\n').filter(line=>!line.startsWith('ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin ')).join('\n')
  await writeFile(resolve(folder,'restore-public-schema.sql'),schema)
  const triggers = await readFile(resolve(folder,'custom-managed-triggers.sql'),'utf8')
  const policies = inspection.policies.map(p=>`CREATE POLICY ${identifier(p.policyname)} ON ${identifier(p.schemaname)}.${identifier(p.tablename)} AS ${p.permissive} FOR ${p.cmd} TO ${p.roles.map(identifier).join(', ')}${p.qual ? ` USING (${p.qual})` : ''}${p.with_check ? ` WITH CHECK (${p.with_check})` : ''};`).join('\n')
  const publications = inspection.publications.filter(p=>p.pubname==='supabase_realtime').map(p=>`ALTER PUBLICATION supabase_realtime ADD TABLE ${identifier(p.schemaname)}.${identifier(p.tablename)};`).join('\n')
  await writeFile(resolve(folder,'restore-managed-customizations.sql'),'SET search_path=public,extensions;\n'+triggers+'\n'+policies+'\n'+publications)
  const initial = 'CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;'
  await run('TARGET','psql',['-X','-w','-q','--single-transaction','-v','ON_ERROR_STOP=1','-c',initial,'-f',resolve(folder,'restore-public-schema.sql'),'-c','SET session_replication_role=replica','-f',resolve(folder,'app-auth-data.sql'),'-c','SET session_replication_role=origin','-f',resolve(folder,'restore-managed-customizations.sql')])
  await writeFile(resolve(folder,'database-restored.json'),JSON.stringify({restored_at:new Date().toISOString(),managed_defaults_preserved_on_target:managedDefaults.length,custom_policies:inspection.policies.length,publications:inspection.publications.length},null,2))
  console.log(JSON.stringify({database_restored:true,custom_policies:inspection.policies.length,realtime_tables:inspection.publications.length}))
} catch(error) { console.error(redact(error.message)); process.exitCode=1 }
