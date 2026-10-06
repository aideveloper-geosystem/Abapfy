import { readFile,writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { query,redact } from './supabase-migration-access.mjs'
try {
  const folder=(await readFile('.supabase-migration/active-backup.txt','utf8')).trim()
  const sql=await query('SOURCE',`with functions as (
    select p.*,format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) as signature
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname<>'rls_auto_enable'
  ) select 'REVOKE ALL ON FUNCTION '||f.signature||' FROM PUBLIC, anon, authenticated, service_role;'||E'\n'||(
    select string_agg('GRANT '||a.privilege_type||' ON FUNCTION '||f.signature||' TO '||case when a.grantee=0 then 'PUBLIC' else quote_ident(pg_get_userbyid(a.grantee)) end||case when a.is_grantable then ' WITH GRANT OPTION' else '' end||';',E'\n' order by a.grantee)
    from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a
  ) from functions f order by f.signature;`)
  await writeFile(resolve(folder,'exact-function-permissions.sql'),sql)
  await query('TARGET','BEGIN;\n'+sql+'\nCOMMIT;')
  console.log('Source function execution privileges restored exactly.')
} catch(error) { console.error(redact(error.message));process.exitCode=1 }
