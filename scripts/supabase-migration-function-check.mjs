import { writeFile } from 'node:fs/promises'
import { jsonQuery } from './supabase-migration-access.mjs'
const sql = `select json_agg(json_build_object('name',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text) order by p.oid::regprocedure::text) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname<>'rls_auto_enable';`
const source = await jsonQuery('SOURCE',sql)
const target = await jsonQuery('TARGET',sql)
const differences = source.flatMap(s=>{
  const t=target.find(t=>t.name===s.name)
  if(!t) return [{name:s.name,missing:true}]
  const fields=Object.keys(s).filter(k=>s[k]!==t[k])
  return fields.length ? [{name:s.name,fields,line_endings_only:s.definition.replaceAll('\r\n','\n')===t.definition.replaceAll('\r\n','\n'),source_owner:s.owner,target_owner:t.owner,source_acl:s.acl,target_acl:t.acl}] : []
})
await writeFile('.supabase-migration/function-differences.json',JSON.stringify(differences,null,2))
console.log(JSON.stringify(differences))
