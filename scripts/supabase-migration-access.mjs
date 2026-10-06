import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'

export const config = {}
for (const line of (await readFile('.env.supabase-migration.local', 'utf8')).split(/\r?\n/)) {
  const match = line.match(/^([A-Z_]+)=(.*)$/)
  if (!match) continue
  let value = match[2].trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
  config[match[1]] = value
}
const secrets = Object.entries(config).filter(([key]) => /PASSWORD|KEY/.test(key)).map(([, value]) => value).filter(Boolean)
export const redact = (text) => secrets.reduce((result, secret) => result.split(secret).join('[REDACTED]'), String(text))
export function run(side, binary, args, input = '') {
  return new Promise((accept, reject) => {
    const child = spawn(binary, args, { env: { ...process.env,
      PGHOST: config[`${side}_DB_HOST`], PGPORT: config[`${side}_DB_PORT`], PGDATABASE: config[`${side}_DB_NAME`],
      PGUSER: config[`${side}_DB_USER`], PGPASSWORD: config[`${side}_DB_PASSWORD`], PGSSLMODE: 'require',
      PGCONNECT_TIMEOUT: '15', PGOPTIONS: '-c statement_timeout=120000' }, windowsHide: true, stdio: ['pipe','pipe','pipe'] })
    let stdout = '', stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => code === 0 ? accept(stdout) : reject(new Error(redact(stderr))))
    child.stdin.on('error', () => {})
    child.stdin.end(input)
  })
}
export const query = (side, sql) => run(side, 'psql', ['-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1'], sql)
export async function jsonQuery(side, sql) { return JSON.parse((await query(side, sql)).trim()) }
export const literal = (value) => "'" + String(value).replaceAll("'", "''") + "'"
export const identifier = (value) => '"' + String(value).replaceAll('"', '""') + '"'
