import { isEfModule } from '@renderer/lib/efDrive'
import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { BookOpen, ChevronRight, FileText, Folder, FolderInput, FolderPlus, MessageSquarePlus, Plus, Trash2, Upload } from 'lucide-react'
import { supabase } from '@renderer/lib/supabaseClient'
import { extractTextFromFile } from '@renderer/lib/attachments'
import { useAuthStore } from '@renderer/store/authStore'
import { useClientsStore, type Client } from '@renderer/store/clientsStore'
import { useChatStore } from '@renderer/store/chatStore'
import { ProjectKnowledgeModal } from '@renderer/components/ProjectKnowledgeModal'
import type { ProjectSummary } from '@renderer/store/chatStore'
import { ClientFilePreview, type ClientFileRecord } from '@renderer/components/ClientFilePreview'
import { ClientTrash } from '@renderer/components/ClientTrash'
import { presenceLabel, type WorkPresence, type WorkScope } from '@renderer/lib/workPresence'
import './ClientsScreen.css'

interface ClientFolder {
  id: string
  name: string
  parent_id: string | null
  user_id: string
  created_at: string
}
interface Props {
  onNewChat: (clientId: string, moduleId: string, folderId?: string | null) => void
  onOpenChat: (id: string) => void
  workPresence: WorkPresence[]
  presenceError: string | null
  onActivityChange: (scope: WorkScope | null) => void
}

export function ClientsScreen({ onNewChat, onOpenChat, workPresence, presenceError, onActivityChange }: Props): JSX.Element {
  const { clients, modules, error, load, createClient, deleteClient, updateClient, createModule, updateModule } =
    useClientsStore()
  const { projects, recentChats, projectChats, loadProjectChats } = useChatStore()
  const { role, user } = useAuthStore()
  const canManage = role === 'MASTER' || role === 'ADMIN'
  const [clientId, setClientId] = useState<string | null>(null)
  const [moduleId, setModuleId] = useState<string | null>(null)
  const [files, setFiles] = useState<ClientFileRecord[]>([])
  const [folders, setFolders] = useState<ClientFolder[]>([])
  const [folderId, setFolderId] = useState<string | null>(null)
  const [showTrash, setShowTrash] = useState(false)
  const [folderName, setFolderName] = useState<string | null>(null)
  const [movingFile, setMovingFile] = useState<ClientFileRecord | null>(null)
  const [moveTarget, setMoveTarget] = useState<string>('')
  const [names, setNames] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [editingWorkbook, setEditingWorkbook] = useState(false)
  const [workbook, setWorkbook] = useState('')
  const [openedFile, setOpenedFile] = useState<ClientFileRecord | null>(null)
  const [knowledgeProject, setKnowledgeProject] = useState<ProjectSummary | null>(null)
  const [deletingClient, setDeletingClient] = useState<Client | null>(null)
  const [busy, setBusy] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [editor, setEditor] = useState<{
    mode: 'client-new' | 'client-edit' | 'module-new' | 'module-edit'
    name: string
    description: string
  } | null>(null)
  const client = clients.find((item) => item.id === clientId)
  const module = modules.find((item) => item.id === moduleId)
  const currentFolder = folders.find((item) => item.id === folderId)
  const folderPath = useMemo(() => {
    const path: ClientFolder[] = []
    let cursor = currentFolder
    while (cursor && !path.some((item) => item.id === cursor?.id)) {
      path.unshift(cursor)
      cursor = folders.find((item) => item.id === cursor?.parent_id)
    }
    return path
  }, [currentFolder, folders])
  const visibleFolders = folders.filter((item) => item.parent_id === folderId)
  const visibleFiles = files.filter((item) => item.folder_id === folderId)
  const workLabel = (items: WorkPresence[]): string | null => presenceLabel(items, user?.id ?? null)
  const folderWorkLabel = (id: string): string | null => workLabel(workPresence.filter((item) => item.clientId === clientId && item.moduleId === moduleId && item.folderId === id))
  const moduleWorkLabel = (id: string): string | null => workLabel(workPresence.filter((item) => item.clientId === clientId && item.moduleId === id))
  const chatWorkLabel = (id: string): string | null => workLabel(workPresence.filter((item) => item.chatId === id))
  const visibleProjects = useMemo(
    () => projects.filter((p) => p.clientId === clientId),
    [projects, clientId]
  )
  const visibleChats = useMemo(
    () =>
      [
        ...recentChats.filter((chat) => chat.moduleId === moduleId),
        ...visibleProjects
          .flatMap((project) => projectChats[project.id] ?? [])
          .filter((chat) => chat.moduleId === moduleId)
      ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [recentChats, visibleProjects, projectChats, moduleId]
  )

  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    onActivityChange(clientId && moduleId && !showTrash
      ? { clientId, moduleId, folderId, chatId: null }
      : null)
    return () => onActivityChange(null)
  }, [clientId, moduleId, folderId, showTrash, onActivityChange])
  useEffect(() => {
    visibleProjects.forEach((project) => {
      if (!projectChats[project.id]) void loadProjectChats(project.id)
    })
  }, [visibleProjects, projectChats, loadProjectChats])
  useEffect(() => {
    setFolderId(null)
    if (!moduleId) {
      setFiles([])
      setFolders([])
      return
    }
    let active = true
    void Promise.all([
      supabase.from('client_files').select('id, name, content, folder_id, storage_path, user_id, created_at').eq('module_id', moduleId).is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('client_folders').select('id, name, parent_id, user_id, created_at').eq('module_id', moduleId).order('name')
    ]).then(([fileResult, folderResult]) => {
      if (!active) return
      if (fileResult.error || folderResult.error) setMessage((fileResult.error ?? folderResult.error)?.message ?? 'Falha ao carregar arquivos.')
      else { setFiles(fileResult.data ?? []); setFolders(folderResult.data ?? []) }
    })
    return () => { active = false }
  }, [moduleId, showTrash])
  useEffect(() => {
    const ids = [
      ...new Set([
        ...files.map((file) => file.user_id),
        ...folders.map((folder) => folder.user_id),
        ...visibleProjects.map((p) => p.userId),
        ...visibleChats.map((c) => c.userId)
      ])
    ]
    if (!ids.length) return
    void supabase
      .from('profiles')
      .select('id, nome')
      .in('id', ids)
      .then(({ data }) => {
        setNames(Object.fromEntries((data ?? []).map((row) => [row.id, row.nome])))
      })
  }, [files, folders, visibleProjects, visibleChats])

  function openClient(selected: Client): void {
    setClientId(selected.id)
    setModuleId(null)
    setShowTrash(false)
    setWorkbook(selected.workbookMd ?? '')
    setEditingWorkbook(false)
  }
  async function act(task: () => Promise<void>): Promise<void> {
    try {
      setMessage(null)
      await task()
    } catch (cause) {
      setMessage((cause as Error).message)
    }
  }
  async function saveEditor(): Promise<void> {
    if (busy || !editor?.name.trim()) return
    setBusy(true)
    setDialogError(null)
    try {
      if (editor.mode === 'client-new') await createClient(editor.name, editor.description)
      if (editor.mode === 'client-edit' && client)
        await updateClient(client, editor.name, editor.description, client.workbookMd)
      if (editor.mode === 'module-new' && client)
        await createModule(client.id, editor.name, editor.description)
      if (editor.mode === 'module-edit' && module)
        await updateModule(module, editor.name, editor.description)
      setEditor(null)
      setMessage(null)
    } catch (cause) {
      setDialogError((cause as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function confirmDeleteClient(): Promise<void> {
    if (!deletingClient || busy) return
    setBusy(true)
    setDialogError(null)
    try {
      await deleteClient(deletingClient.id)
      setClientId(null)
      setModuleId(null)
      setShowTrash(false)
      setEditingWorkbook(false)
      setDeletingClient(null)
      setMessage(null)
    } catch (cause) {
      setDialogError((cause as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function importWorkbook(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.md')) {
      setMessage('O workbook deve ser um arquivo .md.')
      return
    }
    setWorkbook(await file.text())
    setEditingWorkbook(true)
    event.target.value = ''
  }
  async function upload(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const selected = event.target.files?.[0]
    if (!selected || !client || !module || !user) return
    try {
      if (selected.size > 20 * 1024 * 1024) throw new Error('O arquivo deve ter no máximo 20 MB.')
      if (isEfModule(module.name) && ['default.docx', 'base.docx'].includes(selected.name.toLowerCase())) {
        if (folderId) throw new Error('Envie default.docx ou base.docx na raiz do módulo EFs do cliente.')
        if (files.some((file) => file.folder_id === null && file.name.toLowerCase() === selected.name.toLowerCase())) throw new Error('Já existe um modelo com este nome. Mova o modelo anterior para a lixeira antes de enviar o novo.')
      }
      const content = await extractTextFromFile(selected)
      const id = crypto.randomUUID()
      const extension = selected.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
      const storagePath = `${client.id}/${module.id}/${id}/original.${extension}`
      const { data: pathAllowed, error: pathError } = await supabase.rpc('can_upload_client_file_path', { p_path: storagePath })
      if (pathError) throw new Error(`Validação do drive: ${pathError.message}`)
      if (!pathAllowed) throw new Error('Validação do drive: cliente, módulo ou sessão não autorizados para este caminho.')
      const { error: storageError } = await supabase.storage.from('client-files').upload(storagePath, selected, { upsert: false })
      if (storageError) throw new Error(`Storage: ${storageError.message}`)
      const { data, error: uploadError } = await supabase
        .from('client_files')
        .insert({
          id,
          client_id: client.id,
          module_id: module.id,
          folder_id: folderId,
          storage_path: storagePath,
          name: selected.name,
          content,
          mime_type: selected.type,
          size_bytes: selected.size,
          user_id: user.id
        })
        .select('id, name, content, folder_id, storage_path, user_id, created_at')
        .single()
      if (uploadError) {
        await supabase.storage.from('client-files').remove([storagePath])
        throw new Error(`Registro do arquivo: ${uploadError.message}`)
      }
      setFiles((current) => [data, ...current])
      setMessage(null)
    } catch (cause) {
      setMessage((cause as Error).message)
    }
    event.target.value = ''
  }
  async function createFolder(): Promise<void> {
    const name = folderName?.trim()
    if (!name || !client || !module || !user) return
    await act(async () => {
      const { data, error: insertError } = await supabase.from('client_folders').insert({
        client_id: client.id, module_id: module.id, parent_id: folderId, name, user_id: user.id
      }).select('id, name, parent_id, user_id, created_at').single()
      if (insertError) throw insertError
      setFolders((current) => [...current, data].sort((a, b) => a.name.localeCompare(b.name)))
      setFolderName(null)
    })
  }
  async function moveFile(): Promise<void> {
    if (!movingFile) return
    await act(async () => {
      const destination = moveTarget || null
      const { error: moveError } = await supabase.from('client_files').update({ folder_id: destination }).eq('id', movingFile.id)
      if (moveError) throw moveError
      setFiles((current) => current.map((file) => file.id === movingFile.id ? { ...file, folder_id: destination } : file))
      setMovingFile(null)
    })
  }
  async function trashFile(file: ClientFileRecord): Promise<void> {
    await act(async () => {
      const { data, error: trashError } = await supabase.from('client_files')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', file.id).is('deleted_at', null)
        .select('id').single()
      if (trashError || !data) throw trashError ?? new Error('Arquivo não encontrado.')
      setFiles((current) => current.filter((item) => item.id !== file.id))
    })
  }
  function pathForFolder(folder: ClientFolder): string {
    const path = [folder.name]
    let parent = folders.find((item) => item.id === folder.parent_id)
    while (parent && path.length <= folders.length) {
      path.unshift(parent.name)
      parent = folders.find((item) => item.id === parent?.parent_id)
    }
    return path.join(' / ')
  }
  const author = (id: string): string => names[id] ?? 'Usuário'
  const date = (value: string): string =>
    new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(value))

  return (
    <main className="clients-screen">
      <header className="clients-header">
        <div>
          <h1>Clientes</h1>
          <p>Conteúdo compartilhado por cliente e módulo</p>
        </div>
        {canManage && !client && (
          <button onClick={() => { setDialogError(null); setEditor({ mode: 'client-new', name: '', description: '' }) }}>
            <Plus size={15} /> Novo cliente
          </button>
        )}
        {client && (
          <button className={showTrash ? 'clients-trash-toggle selected' : 'clients-trash-toggle'} onClick={() => setShowTrash((current) => !current)}>
            <Trash2 size={15} /> {showTrash ? 'Voltar ao drive' : 'Lixeira'}
          </button>
        )}
        {canManage && client && (
          <button className="clients-delete" onClick={() => { setDialogError(null); setDeletingClient(client) }}>
            <Trash2 size={15} /> Excluir cliente
          </button>
        )}
      </header>
      {error && <p className="clients-error">{error}. Aplique a migração 021 no Supabase.</p>}
      {message && <p className="clients-error">{message}</p>}
      {presenceError && <p className="clients-error">Status de trabalho indisponível: {presenceError}</p>}
      <div className="clients-layout">
        <nav className="clients-tree">
          <button
            className={!client ? 'selected' : ''}
            onClick={() => {
              setClientId(null)
              setModuleId(null)
              setShowTrash(false)
            }}
          >
            Todos os clientes
          </button>
          {clients.map((item) => (
            <div key={item.id}>
              <button
                className={clientId === item.id && !moduleId ? 'selected' : ''}
                onClick={() => openClient(item)}
              >
                <Folder size={15} />
                {item.name}
              </button>
              {clientId === item.id &&
                modules
                  .filter((m) => m.clientId === item.id)
                  .map((m) => (
                    <button
                      className={`clients-module ${moduleId === m.id ? 'selected' : ''}`}
                      key={m.id}
                      onClick={() => { setModuleId(m.id); setShowTrash(false) }}
                    >
                      <FileText size={14} />
                      {m.name}
                      {moduleWorkLabel(m.id) && <small className="clients-work-badge" title={moduleWorkLabel(m.id) ?? ''}>Em uso</small>}
                    </button>
                  ))}
            </div>
          ))}
        </nav>
        <section className="clients-content">
          {client && showTrash && <ClientTrash clientId={client.id} modules={modules.filter((item) => item.clientId === client.id)} canEmpty={canManage} />}
          {!client && (
            <div className="clients-grid">
              {clients.map((item) => (
                <button className="clients-card" key={item.id} onClick={() => openClient(item)}>
                  <Folder size={22} />
                  <strong>{item.name}</strong>
                  <small>
                    {modules.filter((m) => m.clientId === item.id).length} módulos · criado{' '}
                    {date(item.createdAt)}
                  </small>
                </button>
              ))}
              {clients.length === 0 && <p>Nenhum cliente cadastrado.</p>}
            </div>
          )}
          {client && !showTrash && !module && (
            <>
              <div className="clients-content-heading">
                <h2>{client.name}</h2>
                {canManage && (
                  <button
                    onClick={() =>
                      setEditor({
                        mode: 'client-edit',
                        name: client.name,
                        description: client.description ?? ''
                      })
                    }
                  >
                    Editar cliente
                  </button>
                )}
              </div>
              <p>{client.description}</p>
              <div className="clients-section-heading">
                <h3>Workbook.md</h3>
                {canManage && (
                  <div>
                    <label className="clients-upload">
                      Importar .md
                      <input
                        type="file"
                        accept=".md,text/markdown"
                        hidden
                        onChange={(event) => void importWorkbook(event)}
                      />
                    </label>
                    <button onClick={() => setEditingWorkbook(true)}>Editar workbook</button>
                  </div>
                )}
              </div>
              {editingWorkbook ? (
                <div className="clients-workbook-editor">
                  <textarea
                    value={workbook}
                    onChange={(event) => setWorkbook(event.target.value)}
                    placeholder="Regras do cliente, versão SAP, estilo de desenvolvimento, restrições..."
                  />
                  <button
                    onClick={() =>
                      void act(async () => {
                        await updateClient(
                          client,
                          client.name,
                          client.description ?? '',
                          workbook.trim() || null
                        )
                        setEditingWorkbook(false)
                      })
                    }
                  >
                    Salvar
                  </button>
                </div>
              ) : (
                <pre className="clients-workbook">
                  {client.workbookMd ||
                    'Nenhum workbook configurado. O modelo não receberá contexto de cliente.'}
                </pre>
              )}
              <div className="clients-section-heading">
                <h3>Módulos</h3>
                {canManage && (
                  <button
                    onClick={() => setEditor({ mode: 'module-new', name: '', description: '' })}
                  >
                    <Plus size={14} /> Novo módulo
                  </button>
                )}
              </div>
              <div className="clients-grid">
                {modules
                  .filter((m) => m.clientId === client.id)
                  .map((m) => (
                    <button className="clients-card" key={m.id} onClick={() => setModuleId(m.id)}>
                      <FileText size={21} />
                      <strong>{m.name}</strong>
                      <small>{m.description || 'Abrir conteúdo'}</small>
                      {moduleWorkLabel(m.id) && <small className="clients-work-badge">{moduleWorkLabel(m.id)}</small>}
                    </button>
                  ))}
              </div>
              <h3>Projetos</h3>
              <div className="clients-list">
                {visibleProjects.map((p) => (
                  <button key={p.id} onClick={() => setKnowledgeProject(p)}>
                    <Folder size={15} />
                    <strong>{p.name}</strong>
                    <small>
                      {author(p.userId)} · {date(p.createdAt)}
                    </small>
                  </button>
                ))}
              </div>
            </>
          )}
          {client && !showTrash && module && (
            <>
              <div className="clients-content-heading">
                <div>
                  <small>{client.name}</small>
                  <h2>{module.name}</h2>
                </div>
                <div>
                  {canManage && (
                    <button
                      onClick={() =>
                        setEditor({
                          mode: 'module-edit',
                          name: module.name,
                          description: module.description ?? ''
                        })
                      }
                    >
                      Editar módulo
                    </button>
                  )}
                  <button onClick={() => onNewChat(client.id, module.id, folderId)}>
                    <MessageSquarePlus size={15} /> Novo chat
                  </button>
                </div>
              </div>
              <p>{module.description}</p>
              {isEfModule(module.name) && !folderId && <p>
                {files.some((file) => file.folder_id === null && file.name.toLowerCase() === 'default.docx')
                  ? 'Modelo EF do cliente: default.docx. Novas especificações usarão este arquivo.'
                  : files.some((file) => file.folder_id === null && file.name.toLowerCase() === 'base.docx') ? 'Modelo EF: base.docx do drive será usado enquanto default.docx estiver ausente.' : 'Envie default.docx (modelo do cliente) ou base.docx (modelo base) nesta pasta para gerar EFs.'}
              </p>}
              <div className="clients-section-heading">
                <h3>Arquivos</h3>
                <div className="clients-file-actions">
                  <button onClick={() => setFolderName('')}><FolderPlus size={14} /> Nova pasta</button>
                  <label className="clients-upload">
                    <Upload size={14} /> Enviar arquivo
                    <input
                      type="file"
                      accept=".txt,.md,.pdf,.docx,.json,.csv,.abap,.cds,.sql,.xml,.yaml,.yml"
                      hidden
                      onChange={(event) => void upload(event)}
                    />
                  </label>
                </div>
              </div>
              <nav className="clients-breadcrumbs" aria-label="Caminho da pasta">
                <button onClick={() => setFolderId(null)}>{module.name}</button>
                {folderPath.map((folder) => <span key={folder.id}><ChevronRight size={13} /><button onClick={() => setFolderId(folder.id)}>{folder.name}</button></span>)}
              </nav>
              <div className="clients-list">
                {visibleFolders.map((folder) => (
                  <button key={folder.id} onClick={() => setFolderId(folder.id)}>
                    <Folder size={16} />
                    <strong>{folder.name}</strong>
                    <small>{author(folder.user_id)} · {date(folder.created_at)}</small>
                    {folderWorkLabel(folder.id) && <span className="clients-work-badge">{folderWorkLabel(folder.id)}</span>}
                    <ChevronRight size={15} />
                  </button>
                ))}
                {visibleFiles.map((file) => (
                  <div className="clients-file-row" key={file.id}>
                    <button className="clients-file-open" onClick={() => setOpenedFile(file)}>
                      <FileText size={15} />
                      <strong>{file.name}</strong>
                      <small>{author(file.user_id)} · {date(file.created_at)}</small>
                    </button>
                    <button className="clients-file-move" title="Mover arquivo" aria-label={`Mover ${file.name}`} onClick={() => { setMovingFile(file); setMoveTarget(file.folder_id ?? '') }}><FolderInput size={15} /></button>
                    <button className="clients-file-trash" title="Mover para a lixeira" aria-label={`Remover ${file.name}`} onClick={() => void trashFile(file)}><Trash2 size={15} /></button>
                  </div>
                ))}
                {visibleFolders.length === 0 && visibleFiles.length === 0 && <p>Esta pasta está vazia.</p>}
              </div>
              <h3>Chats</h3>
              <div className="clients-list">
                {visibleChats.map((chat) => (
                  <button key={chat.id} onClick={() => onOpenChat(chat.id)}>
                    <MessageSquarePlus size={15} />
                    <strong>{chat.title}</strong>
                    <small>
                      {author(chat.userId)} · {date(chat.updatedAt)}
                    </small>
                    {chatWorkLabel(chat.id) && <span className="clients-work-badge">{chatWorkLabel(chat.id)}</span>}
                  </button>
                ))}
                {visibleChats.length === 0 && <p>Sem chats neste módulo.</p>}
              </div>
              <h3>Projetos do cliente</h3>
              <div className="clients-list">
                {visibleProjects.map((p) => (
                  <button key={p.id} onClick={() => setKnowledgeProject(p)}>
                    <BookOpen size={15} />
                    <strong>{p.name}</strong>
                    <small>
                      {author(p.userId)} · {date(p.createdAt)}
                    </small>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
      {openedFile && <ClientFilePreview file={openedFile} onClose={() => setOpenedFile(null)} />}
      {folderName !== null && createPortal(
        <div className="clients-file-overlay" onMouseDown={() => setFolderName(null)}>
          <form className="clients-editor" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void createFolder() }}>
            <h2>Nova pasta</h2>
            {message && <p className="clients-error">{message}</p>}
            <label>Nome<input autoFocus required maxLength={120} value={folderName} onChange={(event) => setFolderName(event.target.value)} /></label>
            <div><button type="button" onClick={() => setFolderName(null)}>Cancelar</button><button type="submit">Criar pasta</button></div>
          </form>
        </div>, document.body
      )}
      {movingFile && createPortal(
        <div className="clients-file-overlay" onMouseDown={() => setMovingFile(null)}>
          <form className="clients-editor" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void moveFile() }}>
            <h2>Mover {movingFile.name}</h2>
            {message && <p className="clients-error">{message}</p>}
            <label>Destino<select value={moveTarget} onChange={(event) => setMoveTarget(event.target.value)}>
              <option value="">{module?.name} / Raiz</option>
              {folders.map((folder) => <option key={folder.id} value={folder.id}>{pathForFolder(folder)}</option>)}
            </select></label>
            <div><button type="button" onClick={() => setMovingFile(null)}>Cancelar</button><button type="submit">Mover</button></div>
          </form>
        </div>, document.body
      )}
      {editor && createPortal(
        <div className="clients-file-overlay" onMouseDown={() => { if (!busy) { setEditor(null); setDialogError(null) } }}>
          <form
            className="clients-editor"
            role="dialog"
            aria-modal="true"
            aria-label={editor.mode.includes('client') ? 'Cliente' : 'Módulo'}
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault()
              void saveEditor()
            }}
          >
            <h2>{editor.mode.includes('client') ? 'Cliente' : 'Módulo'}</h2>
            {dialogError && <p className="clients-error" role="alert">{dialogError}</p>}
            <label>
              Nome
              <input
                autoFocus
                required
                disabled={busy}
                value={editor.name}
                onChange={(event) => setEditor({ ...editor, name: event.target.value })}
              />
            </label>
            <label>
              Descrição
              <textarea
                disabled={busy}
                value={editor.description}
                onChange={(event) => setEditor({ ...editor, description: event.target.value })}
              />
            </label>
            <div>
              <button type="button" disabled={busy} onClick={() => { setEditor(null); setDialogError(null) }}>
                Cancelar
              </button>
              <button type="submit" disabled={busy || !editor.name.trim()}>{busy ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </form>
        </div>, document.body
      )}
      {deletingClient && createPortal(
        <div className="clients-file-overlay" onMouseDown={() => { if (!busy) { setDeletingClient(null); setDialogError(null) } }}>
          <form className="clients-editor" role="dialog" aria-modal="true" aria-label="Excluir cliente" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void confirmDeleteClient() }}>
            <h2>Excluir {deletingClient.name}?</h2>
            <p>Esta ação é permanente e remove o cliente e seus módulos vazios. Clientes com arquivos, chats ou projetos precisam ter esse conteúdo removido ou transferido primeiro.</p>
            {dialogError && <p className="clients-error" role="alert">{dialogError}</p>}
            <div>
              <button autoFocus type="button" disabled={busy} onClick={() => { setDeletingClient(null); setDialogError(null) }}>Cancelar</button>
              <button className="clients-delete" type="submit" disabled={busy}>{busy ? 'Excluindo…' : 'Excluir cliente'}</button>
            </div>
          </form>
        </div>, document.body
      )}
      <ProjectKnowledgeModal project={knowledgeProject} onClose={() => setKnowledgeProject(null)} />
    </main>
  )
}
