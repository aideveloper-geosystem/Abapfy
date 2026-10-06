import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { config, query, literal, redact } from './supabase-migration-access.mjs'

try {
  const folder = (await readFile('.supabase-migration/active-backup.txt','utf8')).trim()
  await readFile(resolve(folder,'database-restored.json'))
  const inspection = JSON.parse(await readFile(resolve(folder,'inspection.json'),'utf8'))
  const source = createClient(config.SOURCE_SUPABASE_URL,config.SOURCE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
  const target = createClient(config.TARGET_SUPABASE_URL,config.TARGET_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
  const objectsFolder = resolve(folder,'storage-bytes')
  await mkdir(objectsFolder,{recursive:true})
  const manifest = []
  for (const bucket of inspection.storage_buckets) {
    const {error} = await target.storage.createBucket(bucket.id,{public:bucket.public,fileSizeLimit:bucket.file_size_limit,allowedMimeTypes:bucket.allowed_mime_types})
    if (error) throw new Error('Create bucket: '+error.message)
  }
  // The DB inventory supplies every object, without API pagination or folder ambiguity.
  for (const [index,object] of inspection.storage_objects.entries()) {
    const {data,error} = await source.storage.from(object.bucket_id).download(object.name)
    if (error) throw new Error(`Source download ${index+1}: ${error.message}`)
    const bytes = Buffer.from(await data.arrayBuffer())
    if (object.metadata?.size != null && Number(object.metadata.size)!==bytes.length) throw new Error('Source object size changed')
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    await writeFile(resolve(objectsFolder,`object-${index+1}.bin`),bytes)
    const result = await target.storage.from(object.bucket_id).upload(object.name,bytes,{upsert:false,contentType:object.metadata?.mimetype ?? data.type,cacheControl:String(object.metadata?.cacheControl ?? '3600').replace(/^max-age=/,''),metadata:object.user_metadata ?? undefined})
    if (result.error) throw new Error(`Target upload ${index+1}: ${result.error.message}`)
    const check = await target.storage.from(object.bucket_id).download(object.name)
    if (check.error) throw new Error(`Target download ${index+1}: ${check.error.message}`)
    const targetBytes = Buffer.from(await check.data.arrayBuffer())
    if (createHash('sha256').update(targetBytes).digest('hex')!==sha256) throw new Error('Storage content checksum mismatch')
    manifest.push({bucket:object.bucket_id,path:object.name,id:object.id,bytes:bytes.length,sha256,verified:true})
    await writeFile(resolve(folder,'storage-manifest.json'),JSON.stringify(manifest,null,2))
    console.log(JSON.stringify({file:index+1,total:inspection.storage_objects.length,bytes:bytes.length,sha256_verified:true}))
  }
  const nullable = (value) => value == null ? 'NULL' : literal(value)
  const updates = inspection.storage_objects.map(o=>`UPDATE storage.objects SET id=${literal(o.id)}::uuid, owner=${nullable(o.owner)}::uuid, owner_id=${nullable(o.owner_id)}, created_at=${literal(o.created_at)}::timestamptz, updated_at=${literal(o.updated_at)}::timestamptz, last_accessed_at=${nullable(o.last_accessed_at)}::timestamptz, user_metadata=${nullable(JSON.stringify(o.user_metadata ?? null))}::jsonb WHERE bucket_id=${literal(o.bucket_id)} AND name=${literal(o.name)};`).join('\n')
  await query('TARGET','BEGIN;\n'+updates+'\nCOMMIT;')
  await writeFile(resolve(folder,'storage-restored.json'),JSON.stringify({restored_at:new Date().toISOString(),files:manifest.length,bytes:manifest.reduce((n,o)=>n+o.bytes,0),all_sha256_verified:true},null,2))
  console.log('Storage copy complete; object IDs, ownership and timestamps preserved.')
} catch(error) { console.error(redact(error.message)); process.exitCode=1 }
