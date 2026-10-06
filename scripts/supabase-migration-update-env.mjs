import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { config, redact } from './supabase-migration-access.mjs'

try {
  const url = config.TARGET_SUPABASE_URL
  const anon = config.TARGET_ANON_KEY
  const service = config.TARGET_SERVICE_ROLE_KEY
  if (!anon || !service) throw new Error('Missing TARGET_ANON_KEY or TARGET_SERVICE_ROLE_KEY')
  if (!anon.startsWith('sb_publishable_')) {
    if (anon.split('.').length !== 3) throw new Error('TARGET_ANON_KEY must be a public publishable or anon key')
    const payload = JSON.parse(Buffer.from(anon.split('.')[1], 'base64url').toString('utf8'))
    if (payload.role !== 'anon' || payload.ref !== config.TARGET_PROJECT_REF) throw new Error('The anon key must belong to the destination project')
  }
  const publicClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const adminClient = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  const publicRead = await publicClient.from('profiles').select('id', { count: 'exact', head: true })
  if (publicRead.error) throw new Error('Public API validation: ' + publicRead.error.message)
  const adminRead = await adminClient.from('profiles').select('id', { count: 'exact', head: true })
  if (adminRead.error) throw new Error('Server API validation: ' + adminRead.error.message)
  const updates = [
    ['.env', { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: anon }],
    ['Admin/.env.local', { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service }],
    ['external/.env.local', { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service }]
  ]
  const backup = resolve('.supabase-migration', 'env-before-step2-' + new Date().toISOString().replaceAll(':', '-'))
  await mkdir(backup, { recursive: true })
  const prepared = []
  for (const [file, values] of updates) {
    let text = await readFile(file, 'utf8')
    await writeFile(resolve(backup, file.replaceAll('/', '__')), text)
    for (const [key, value] of Object.entries(values)) {
      const pattern = new RegExp('^' + key + '=.*$', 'gm')
      if (pattern.test(text)) text = text.replace(pattern, () => `${key}=${value}`)
      else text += `\n${key}=${value}\n`
    }
    prepared.push([file, text])
  }
  for (const [file, text] of prepared) await writeFile(file, text)
  const report = { updated_at: new Date().toISOString(), project_ref: config.TARGET_PROJECT_REF, files: updates.map(([file]) => file), public_api_valid: true, server_api_valid: true, anonymous_visible_profiles: publicRead.count, server_profiles: adminRead.count }
  await writeFile('.supabase-migration/env-switch-report.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
} catch (error) {
  let message = redact(error.message)
  if (config.TARGET_ANON_KEY) message = message.split(config.TARGET_ANON_KEY).join('[REDACTED]')
  console.error(message)
  process.exitCode = 1
}
