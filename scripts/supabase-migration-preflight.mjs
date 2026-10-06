import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const config = {}
for (const line of (await readFile('.env.supabase-migration.local', 'utf8')).split(/\r?\n/)) {
  const match = line.match(/^([A-Z_]+)=(.*)$/)
  if (!match) continue
  let value = match[2].trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
  config[match[1]] = value
}
const secrets = Object.entries(config).filter(([key]) => /PASSWORD|KEY/.test(key)).map(([, value]) => value).filter(Boolean)
const redact = (text) => secrets.reduce((result, secret) => result.split(secret).join('[REDACTED]'), String(text))
const sql = `begin transaction read only;
select json_build_object(
 'version', current_setting('server_version'),
 'database_bytes', pg_database_size(current_database()),
 'public_tables', (select coalesce(json_agg(tablename order by tablename), '[]'::json) from pg_tables where schemaname='public'),
 'auth_users', (select count(*) from auth.users),
 'auth_identities', (select count(*) from auth.identities),
 'storage_objects', (select count(*) from storage.objects),
 'buckets', (select coalesce(json_agg(json_build_object('id',id,'public',public,'file_size_limit',file_size_limit,'allowed_mime_types',allowed_mime_types)), '[]'::json) from storage.buckets),
 'extensions', (select json_agg(json_build_object('name',extname,'version',extversion,'schema',n.nspname)) from pg_extension e join pg_namespace n on n.oid=e.extnamespace),
 'optional_schemas', (select coalesce(json_agg(nspname), '[]'::json) from pg_namespace where nspname in ('vault','cron','net','supabase_migrations')),
 'custom_managed_triggers', (select coalesce(json_agg(json_build_object('schema',n.nspname,'table',c.relname,'trigger',t.tgname,'function_schema',fn.nspname,'function',p.proname)), '[]'::json) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid join pg_namespace fn on fn.oid=p.pronamespace where not t.tgisinternal and n.nspname in ('auth','storage') and fn.nspname='public')
);
commit;`

await mkdir('.supabase-migration', { recursive: true })
for (const side of ['SOURCE', 'TARGET']) {
  const required = ['DB_HOST','DB_PORT','DB_NAME','DB_USER','DB_PASSWORD','SUPABASE_URL','SERVICE_ROLE_KEY']
  const missing = required.filter((name) => !config[`${side}_${name}`])
  if (missing.length) { console.log(JSON.stringify({ side, missing })); process.exitCode = 1; continue }
  const report = { side, project_ref: config[`${side}_PROJECT_REF`] }
  try {
    const output = await new Promise((accept, reject) => {
      const child = spawn('psql', ['-X','-w','-A','-t','-v','ON_ERROR_STOP=1'], {
        env: { ...process.env, PGHOST: config[`${side}_DB_HOST`], PGPORT: config[`${side}_DB_PORT`], PGDATABASE: config[`${side}_DB_NAME`], PGUSER: config[`${side}_DB_USER`], PGPASSWORD: config[`${side}_DB_PASSWORD`], PGSSLMODE: 'require', PGCONNECT_TIMEOUT: '15', PGOPTIONS: '-c statement_timeout=60000' },
        windowsHide: true, stdio: ['pipe','pipe','pipe']
      })
      let stdout = '', stderr = ''
      child.stdout.on('data', (chunk) => { stdout += chunk })
      child.stderr.on('data', (chunk) => { stderr += chunk })
      child.on('error', reject)
      child.on('close', (code) => code === 0 ? accept(stdout) : reject(new Error(redact(stderr))))
      child.stdin.end(sql)
    })
    report.database = JSON.parse(output.split(/\r?\n/).find((line) => line.startsWith('{')))
  } catch (error) { report.database_error = redact(error.message); process.exitCode = 1 }
  try {
    const key = config[`${side}_SERVICE_ROLE_KEY`]
    const response = await fetch(`${config[`${side}_SUPABASE_URL`]}/storage/v1/bucket`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20000) })
    if (!response.ok) throw new Error(`Storage HTTP ${response.status}`)
    const buckets = await response.json()
    if (!Array.isArray(buckets)) throw new Error('Unexpected Storage response')
    report.storage_api = { accessible: true, buckets: buckets.map(({ id, public: isPublic }) => ({ id, public: isPublic })) }
  } catch (error) { report.storage_error = redact(error.message); process.exitCode = 1 }
  await writeFile(resolve('.supabase-migration', `${side.toLowerCase()}-preflight.json`), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
}
