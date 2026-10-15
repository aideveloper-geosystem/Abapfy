import { supabase } from './supabaseClient'

export interface AbapArtifact { name: string; content: string }
export interface AbapDestination { userId: string; clientId: string; moduleId: string; folderId: string | null; chatId: string; messageId: string }

/** Save only closed, explicitly ABAP fences from completed responses. */
export function extractAbapArtifacts(response: string): AbapArtifact[] {
  const artifacts: AbapArtifact[] = []
  const seen = new Set<string>()
  const fence = /^(`{3,}|~{3,})[ \t]*(?:abap|sap-abap)(?:[ \t]+([^\r\n]*))?[ \t]*\r?\n([\s\S]*?)^\1[ \t]*$/gim
  for (const match of response.matchAll(fence)) {
    const content = match[3].replace(/\r\n/g, '\n').trim()
    if (!content || seen.has(content)) continue
    seen.add(content)
    const declared = content.match(/^\s*(?:REPORT|PROGRAM|CLASS|FUNCTION(?:-POOL)?|INTERFACE)\s+([a-z0-9_/]+)/im)?.[1]
    const hinted = match[2]?.match(/(?:^|[=\s"'])(([a-z0-9_-]+)\.abap)(?:$|[\s"'])/i)?.[2]
    const stem = (hinted || declared || `codigo_${artifacts.length + 1}`).replace(/[^a-z0-9_-]/gi, '_').slice(0, 100)
    artifacts.push({ name: `${stem}.abap`, content: content + '\n' })
  }
  return artifacts
}

async function artifactId(scope: AbapDestination, artifact: AbapArtifact, index: number): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([scope, index, artifact])))
  const hex = Array.from(new Uint8Array(digest)).map((v) => v.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

export async function saveAbapArtifacts(scope: AbapDestination, artifacts: AbapArtifact[], signal?: AbortSignal,
  onSaved?: (name: string) => void): Promise<void> {
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || auth.user?.id !== scope.userId) throw new Error('A sessão mudou antes do salvamento ABAP.')
  if (scope.folderId) {
    const { data, error } = await supabase.from('client_folders').select('id').eq('id', scope.folderId)
      .eq('client_id', scope.clientId).eq('module_id', scope.moduleId).maybeSingle()
    if (error || !data) throw new Error('A pasta de destino ABAP não pertence a este cliente/módulo ou foi removida.')
  }
  for (const [index, artifact] of artifacts.entries()) {
    signal?.throwIfAborted()
    const id = await artifactId(scope, artifact, index)
    const storagePath = `${scope.clientId}/${scope.moduleId}/${id}/original.abap`
    const { data: previous, error: lookupError } = await supabase.from('client_files').select('id').eq('id', id).maybeSingle()
    if (lookupError) throw new Error(lookupError.message)
    if (previous) { onSaved?.(artifact.name); continue }
    const { data: allowed, error: permissionError } = await supabase.rpc('can_upload_client_file_path', { p_path: storagePath })
    if (permissionError || !allowed) throw new Error('Sem permissão para salvar código no drive do cliente.')
    const blob = new Blob([artifact.content], { type: 'text/plain;charset=utf-8' })
    if (blob.size > 20 * 1024 * 1024) throw new Error('Código ABAP excede o limite de 20 MB.')
    const storage = supabase.storage.from('client-files')
    const { error: uploadError } = await storage.upload(storagePath, blob, { upsert: false, contentType: 'text/plain' })
    if (uploadError) {
      const { data: existing, error } = await storage.download(storagePath)
      if (error || !existing || await existing.text() !== artifact.content) throw new Error(uploadError.message)
    }
    signal?.throwIfAborted()
    const { error } = await supabase.from('client_files').insert({ id, user_id: scope.userId,
      client_id: scope.clientId, module_id: scope.moduleId, folder_id: scope.folderId,
      name: artifact.name, content: artifact.content, mime_type: 'text/plain', size_bytes: blob.size, storage_path: storagePath })
    if (error) {
      const { data: recovered } = await supabase.from('client_files').select('id').eq('id', id).maybeSingle()
      if (!recovered) throw new Error(error.message)
    }
    onSaved?.(artifact.name)
  }
}
