import { supabase } from './supabaseClient'
import { efDocxFileName, generateEfDocx, type EfDocxData } from './efDocx'
import { readEfTemplate, efDocxText, type EfTemplateSnapshot } from './efTemplate'

export interface PreparedEfTemplate {
  fileId: string | null
  label: string
  snapshot?: EfTemplateSnapshot
}
export interface EfDocumentJob {
  fileId: string
  clientId: string
  moduleId: string
  folderId: string | null
  userId: string
  destinationLabel: string
  templateFileId: string | null
  templateLabel: string
  templateRevision?: string
  fileName: string
  state: 'pending' | 'saved' | 'error'
  error?: string
  openError?: string
  outputDigest?: string
}
interface DriveFile {
  id: string
  client_id: string
  module_id: string
  folder_id: string | null
  name: string
  storage_path: string | null
  content: string
}
const MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
export const efStoragePath = (job: EfDocumentJob): string =>
  `${job.clientId}/${job.moduleId}/${job.fileId}/original.docx`

async function downloadTemplate(file: {
  id: string
  storage_path: string | null
  name?: string
}): Promise<EfTemplateSnapshot> {
  if (!file.storage_path)
    throw new Error(
      'O modelo EF precisa ter o arquivo Word original no drive. Envie o arquivo novamente.'
    )
  const { data, error } = await supabase.storage.from('client-files').download(file.storage_path)
  if (error || !data)
    throw new Error(
      `Não foi possível ler o modelo EF do cliente: ${error?.message ?? 'arquivo indisponível'}`
    )
  return readEfTemplate(await data.arrayBuffer())
}
export function isEfModule(name: string): boolean {
  return /^(EF|EFs)$/i.test(name.trim())
}

export async function prepareClientEfTemplate(clientId: string): Promise<PreparedEfTemplate> {
  const { data: modules, error: moduleError } = await supabase
    .from('client_modules')
    .select('id, name')
    .eq('client_id', clientId)
  if (moduleError) throw new Error(`Consulta do módulo EFs: ${moduleError.message}`)
  const efModules = modules?.filter((module) => isEfModule(module.name)) ?? []
  if (!efModules.length) throw new Error('Crie o módulo EFs do cliente e envie default.docx ou base.docx na raiz.')
  if (efModules.length > 1)
    throw new Error('Há mais de um módulo EF/EFs neste cliente. Mantenha somente um módulo de modelos.')
  const module = efModules[0]
  for (const name of ['default.docx', 'base.docx']) {
    const { data: files, error } = await supabase
      .from('client_files')
      .select('id, storage_path')
      .eq('client_id', clientId)
      .eq('module_id', module.id)
      .is('folder_id', null)
      .is('deleted_at', null)
      .ilike('name', name)
      .limit(2)
    if (error) throw new Error(`Consulta do ${name}: ${error.message}`)
    if (!files?.length) continue
    if (files.length > 1) throw new Error(`Há mais de um ${name} na raiz do módulo ${module.name}. Mantenha somente o modelo correto.`)
    return {
      fileId: files[0].id,
      label: `Cliente / ${module.name} / ${name}`,
      snapshot: await downloadTemplate(files[0])
    }
  }
  throw new Error(`Envie default.docx ou base.docx na raiz do módulo ${module.name} do cliente antes de gerar a EF.`)
}
export async function templateForEfJob(job: EfDocumentJob): Promise<PreparedEfTemplate> {
  if (!job.templateFileId) throw new Error('Esta EF antiga não possui modelo no drive. Gere uma nova EF usando default.docx ou base.docx no módulo EFs.')
  const { data, error } = await supabase
    .from('client_files')
    .select('id, storage_path')
    .eq('id', job.templateFileId)
    .eq('client_id', job.clientId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error || !data)
    throw new Error('O modelo original desta EF não está mais disponível no drive.')
  const snapshot = await downloadTemplate(data)
  if (snapshot.revision !== job.templateRevision)
    throw new Error('O modelo original foi alterado. Gere uma nova EF para usar a nova versão.')
  return { fileId: data.id, label: job.templateLabel, snapshot }
}
export async function findSavedEf(job: EfDocumentJob): Promise<DriveFile | null> {
  const { data, error } = await supabase
    .from('client_files')
    .select('id, client_id, module_id, folder_id, name, storage_path, content')
    .eq('id', job.fileId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw new Error(`Consulta da EF salva: ${error.message}`)
  if (
    data &&
    (data.client_id !== job.clientId ||
      data.module_id !== job.moduleId ||
      data.storage_path !== efStoragePath(job))
  )
    throw new Error('O arquivo registrado não corresponde ao destino desta EF.')
  return data
}
export async function downloadSavedEf(job: EfDocumentJob): Promise<Blob> {
  const file = await findSavedEf(job)
  if (!file?.storage_path) throw new Error('A EF ainda não foi salva no drive.')
  const { data, error } = await supabase.storage.from('client-files').download(file.storage_path)
  if (error || !data)
    throw new Error(
      `Não foi possível carregar a EF salva: ${error?.message ?? 'arquivo indisponível'}`
    )
  return data
}
export async function saveEfToDrive(
  job: EfDocumentJob,
  blob: Blob,
  content: string,
  signal?: AbortSignal
): Promise<void> {
  signal?.throwIfAborted()
  if (await findSavedEf(job)) return // Stable file ID: rerenders/retries do not create another document.
  if (blob.size > 20 * 1024 * 1024)
    throw new Error('A EF gerada ultrapassa o limite de 20 MB do drive.')
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || auth.user?.id !== job.userId)
    throw new Error('A sessão mudou. Entre novamente antes de salvar a EF.')
  if (job.folderId) {
    const { data, error } = await supabase
      .from('client_folders')
      .select('id')
      .eq('id', job.folderId)
      .eq('client_id', job.clientId)
      .eq('module_id', job.moduleId)
      .maybeSingle()
    if (error || !data)
      throw new Error('A pasta de destino da EF não está mais disponível neste cliente/módulo.')
  }
  const storagePath = efStoragePath(job)
  const { data: allowed, error: permissionError } = await supabase.rpc(
    'can_upload_client_file_path',
    { p_path: storagePath }
  )
  if (permissionError || !allowed)
    throw new Error(
      `Não foi possível autorizar o salvamento no drive: ${permissionError?.message ?? 'acesso negado'}`
    )
  const storage = supabase.storage.from('client-files')
  signal?.throwIfAborted()
  const { error: uploadError } = await storage.upload(storagePath, blob, {
    upsert: false,
    contentType: MIME
  })
  if (uploadError) {
    // A previous upload may have succeeded before a network failure. Reuse
    // only the identical binary at this job's immutable UUID path.
    const { data: previous, error } = await storage.download(storagePath)
    if (error || !previous || previous.size !== blob.size)
      throw new Error(`Envio da EF: ${uploadError.message}`)
    const [left, right] = await Promise.all([previous.arrayBuffer(), blob.arrayBuffer()])
    const a = new Uint8Array(left),
      b = new Uint8Array(right)
    if (!a.every((byte, index) => byte === b[index]))
      throw new Error(
        'O caminho desta EF já contém outro arquivo. O arquivo existente foi preservado.'
      )
  }
  const { error: insertError } = await supabase
    .from('client_files')
    .insert({
      id: job.fileId,
      client_id: job.clientId,
      module_id: job.moduleId,
      folder_id: job.folderId,
      storage_path: storagePath,
      name: job.fileName,
      content,
      mime_type: MIME,
      size_bytes: blob.size,
      user_id: job.userId
    })
  if (insertError) {
    // Never delete the binary after an ambiguous insert: the row might have
    // committed. A retry can recover the same file without duplicating it.
    if (!(await findSavedEf(job)))
      throw new Error(
        `O arquivo foi enviado, mas o registro no drive não foi confirmado: ${insertError.message}. Tente salvar novamente.`
      )
  }
}
async function blobDigest(blob: Blob): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
export async function completeEfDocument(
  data: EfDocxData,
  job: EfDocumentJob,
  prepared?: PreparedEfTemplate,
  signal?: AbortSignal
): Promise<EfDocumentJob> {
  let current = job
  try {
    signal?.throwIfAborted()
    if (!(await findSavedEf(job))) {
      let blob: Blob | undefined
      if (job.outputDigest) {
        const { data: uploaded } = await supabase.storage
          .from('client-files')
          .download(efStoragePath(job))
        if (uploaded) {
          if ((await blobDigest(uploaded)) !== job.outputDigest)
            throw new Error(
              'O arquivo enviado anteriormente não corresponde a esta EF. O arquivo existente foi preservado.'
            )
          blob = uploaded
        }
      }
      if (!blob) {
        const template = prepared ?? (await templateForEfJob(job))
        signal?.throwIfAborted()
        blob = await generateEfDocx(data, template.snapshot)
      }
      current = { ...job, outputDigest: await blobDigest(blob) }
      await saveEfToDrive(
        current,
        blob,
        efDocxText(await blob.arrayBuffer()).slice(0, 120_000),
        signal
      )
    }
    return { ...current, fileName: efDocxFileName(data), state: 'saved', error: undefined }
  } catch (error) {
    return { ...current, state: 'error', error: (error as Error).message }
  }
}
export async function openSavedEf(job: EfDocumentJob): Promise<void> {
  const blob = await downloadSavedEf(job)
  await window.api.documents.openDocx(new Uint8Array(await blob.arrayBuffer()), job.fileName)
}
