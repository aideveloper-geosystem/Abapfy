import { writeFile } from 'node:fs/promises'
import { config, redact } from './supabase-migration-access.mjs'
const settings = {}
try {
  for (const side of ['SOURCE','TARGET']) {
    const key = config[`${side}_SERVICE_ROLE_KEY`]
    const response = await fetch(`${config[`${side}_SUPABASE_URL`]}/auth/v1/settings`,{headers:{apikey:key,Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(20000)})
    if (!response.ok) throw new Error(`${side} Auth settings HTTP ${response.status}`)
    const data = await response.json()
    settings[side] = {external:data.external,disable_signup:data.disable_signup,mailer_autoconfirm:data.mailer_autoconfirm,phone_autoconfirm:data.phone_autoconfirm}
  }
  await writeFile('.supabase-migration/auth-settings-comparison.json',JSON.stringify(settings,null,2))
  console.log(JSON.stringify(settings))
} catch(error) { console.error(redact(error.message)); process.exitCode=1 }
