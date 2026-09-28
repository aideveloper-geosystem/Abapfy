import { useEffect, useState } from 'react'
import { ExternalLink, FolderOpen, Plus, Save, Trash2 } from 'lucide-react'
import { supabase } from '@renderer/lib/supabaseClient'
import { MCP_PRESETS, type McpPreset } from '@renderer/lib/mcpPresets'
import { useAgentsStore } from '@renderer/store/agentsStore'
import { useAuthStore } from '@renderer/store/authStore'
import { effectiveMcpServer, useMcpStore, type McpBindingItem, type McpServerItem, type McpTransport } from '@renderer/store/mcpStore'
import type { McpLocalServerConfig, McpPromptInfo, McpResourceInfo, McpToolInfo } from '../../../../preload/index.d'
import './SettingsSections.css'

interface AccessUser { user_id: string; display_name: string; email: string }
interface Draft { name: string; description: string; endpoint: string; args: string }
interface LocalDraft { profile: string; cwd: string; env: string; headers: string }
interface NewServer extends Draft { transport: McpTransport }
const emptyServer: NewServer = { name: '', description: '', transport: 'streamable_http', endpoint: '', args: '' }
const lines = (value: string): string[] => value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
const slugOf = (value: string): string => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function parseMap(value: string): Record<string, string> {
  if (!value.trim()) return {}
  const parsed: unknown = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.values(parsed).some((item) => typeof item !== 'string')) throw new Error('Use um objeto JSON com valores de texto.')
  return parsed as Record<string, string>
}
function parseArguments(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value || '{}')
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Argumentos devem ser um objeto JSON.')
  return parsed as Record<string, unknown>
}
function validateUrl(value: string): void {
  const url = new URL(value)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error('Use HTTPS para servidores remotos; HTTP é permitido apenas em localhost.')
  }
}
function normalizeReferences(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key,
    value.replace(/\$\{(?:input|env):([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name: string) => `\${${name.toUpperCase()}}`)
  ]))
}
function draftOf(server: McpServerItem): Draft {
  return { name: server.name, description: server.description, endpoint: server.transport === 'stdio' ? server.command ?? '' : server.url ?? '', args: server.args.join('\n') }
}
function localOf(config: McpLocalServerConfig | undefined, transport: McpTransport): LocalDraft {
  return { profile: config?.profile ?? '', cwd: transport === 'stdio' ? config?.cwd ?? '' : '', env: JSON.stringify(config?.env ?? {}, null, 2), headers: JSON.stringify(config?.headers ?? {}, null, 2) }
}
function mapServer(row: Record<string, unknown>): McpServerItem {
  const url = row.slug === 'sap-docs' && row.url === 'http://mcp-sap-docs.marianzeis.de/mcp'
    ? 'https://mcp-sap-docs.marianzeis.de/mcp' : row.url as string | null
  return { id: String(row.id), slug: String(row.slug), name: String(row.name), description: String(row.description ?? ''), transport: row.transport as McpTransport, url, command: row.command as string | null, args: Array.isArray(row.args) ? row.args as string[] : [], enabled: Boolean(row.enabled) }
}
function mapBinding(row: Record<string, unknown>): McpBindingItem {
  return { id: String(row.id), serverId: String(row.server_id), agentSource: row.agent_source as 'default' | 'custom', agentId: String(row.agent_id), enabled: Boolean(row.enabled) }
}

export function McpSection(): JSX.Element {
  const { user, role } = useAuthStore()
  const canManage = role === 'MASTER' || role === 'ADMIN'
  const own = useMcpStore()
  const loadOwn = useMcpStore((state) => state.load)
  const agents = useAgentsStore((state) => state.agents)
  const [users, setUsers] = useState<AccessUser[]>([])
  const [targetId, setTargetId] = useState(user?.id ?? '')
  const [remoteServers, setRemoteServers] = useState<McpServerItem[]>([])
  const [remoteBindings, setRemoteBindings] = useState<McpBindingItem[]>([])
  const [remoteAgents, setRemoteAgents] = useState<{ id: string; name: string }[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [locals, setLocals] = useState<Record<string, LocalDraft>>({})
  const [newServer, setNewServer] = useState<NewServer>(emptyServer)
  const [importJson, setImportJson] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [testStatus, setTestStatus] = useState<Record<string, string>>({})
  const [toolCatalog, setToolCatalog] = useState<Record<string, McpToolInfo[]>>({})
  const [resourceCatalog, setResourceCatalog] = useState<Record<string, McpResourceInfo[]>>({})
  const [promptCatalog, setPromptCatalog] = useState<Record<string, McpPromptInfo[]>>({})
  const [toolArgs, setToolArgs] = useState<Record<string, string>>({})
  const [toolResults, setToolResults] = useState<Record<string, string>>({})
  const isOwn = targetId === user?.id
  const servers = isOwn ? own.servers : remoteServers
  const bindings = isOwn ? own.bindings : remoteBindings
  const availableAgents = isOwn ? agents : [...agents.filter((agent) => agent.source === 'default'), ...remoteAgents.map((agent) => ({ ...agent, source: 'custom' as const }))]

  useEffect(() => { if (user?.id && !targetId) setTargetId(user.id) }, [user?.id, targetId])
  useEffect(() => {
    if (!canManage) return
    void supabase.rpc('list_ai_access_users').then(({ data, error }) => error ? setNotice(error.message) : setUsers((data ?? []) as AccessUser[]))
  }, [canManage])
  useEffect(() => { if (isOwn && user?.id) void loadOwn() }, [isOwn, user?.id, loadOwn])
  useEffect(() => {
    if (!canManage || !targetId || isOwn) return
    let active = true
    void Promise.all([
      supabase.from('mcp_servers').select('*').eq('user_id', targetId).order('created_at'),
      supabase.from('mcp_agent_bindings').select('*').eq('user_id', targetId),
      supabase.rpc('list_ai_custom_agents', { p_user_id: targetId })
    ]).then(([serverResult, bindingResult, agentResult]) => {
      if (!active) return
      const error = serverResult.error ?? bindingResult.error ?? agentResult.error
      if (error) { setNotice(error.message); return }
      setRemoteServers((serverResult.data ?? []).map(mapServer))
      setRemoteBindings((bindingResult.data ?? []).map(mapBinding))
      setRemoteAgents((agentResult.data ?? []) as { id: string; name: string }[])
    })
    return () => { active = false }
  }, [canManage, targetId, isOwn])

  async function refresh(): Promise<void> {
    if (isOwn) { await own.load(); return }
    const [serverResult, bindingResult] = await Promise.all([
      supabase.from('mcp_servers').select('*').eq('user_id', targetId).order('created_at'),
      supabase.from('mcp_agent_bindings').select('*').eq('user_id', targetId)
    ])
    const error = serverResult.error ?? bindingResult.error
    if (error) throw error
    setRemoteServers((serverResult.data ?? []).map(mapServer))
    setRemoteBindings((bindingResult.data ?? []).map(mapBinding))
  }
  async function act(task: () => Promise<void>, success: string): Promise<void> {
    setBusy(true); setNotice(null)
    try { await task(); await refresh(); setNotice(success) }
    catch (error) { setNotice((error as Error).message) }
    finally { setBusy(false) }
  }
  async function insertServer(server: Pick<McpServerItem, 'slug' | 'name' | 'description' | 'transport' | 'url' | 'command' | 'args'>): Promise<string> {
    const { data, error } = await supabase.from('mcp_servers').insert({
      user_id: targetId,
      slug: server.slug,
      name: server.name,
      description: server.description,
      transport: server.transport,
      url: server.url,
      command: server.command,
      args: server.args,
      enabled: true
    }).select('id').single()
    if (error || !data) throw error ?? new Error('Servidor não criado.')
    return String(data.id)
  }
  function addPreset(preset: McpPreset): void {
    void act(async () => {
      const id = await insertServer(preset)
      if (isOwn && preset.local && user?.id) await window.api.mcp.saveLocalServerConfig(user.id, id, preset.local)
    }, `${preset.name} adicionado.`)
  }
  function addCustom(): void {
    const slug = slugOf(newServer.name)
    if (!slug || !newServer.endpoint.trim()) { setNotice('Informe nome e URL ou comando.'); return }
    if (newServer.transport === 'streamable_http') {
      try { validateUrl(newServer.endpoint.trim()) } catch (error) { setNotice((error as Error).message); return }
    }
    void act(async () => {
      await insertServer({ slug, name: newServer.name.trim(), description: newServer.description.trim(), transport: newServer.transport,
        url: newServer.transport === 'streamable_http' ? newServer.endpoint.trim() : null,
        command: newServer.transport === 'stdio' ? newServer.endpoint.trim() : null,
        args: newServer.transport === 'stdio' ? lines(newServer.args) : [] })
      setNewServer(emptyServer)
    }, 'Servidor MCP cadastrado.')
  }
  function saveCentral(server: McpServerItem): void {
    const draft = drafts[server.id] ?? draftOf(server)
    if (server.transport === 'streamable_http') {
      try { validateUrl(draft.endpoint.trim()) } catch (error) { setNotice((error as Error).message); return }
    }
    void act(async () => {
      const { error } = await supabase.from('mcp_servers').update({ name: draft.name.trim(), description: draft.description.trim(),
        url: server.transport === 'streamable_http' ? draft.endpoint.trim() : null,
        command: server.transport === 'stdio' ? draft.endpoint.trim() : null,
        args: server.transport === 'stdio' ? lines(draft.args) : [] }).eq('id', server.id).eq('user_id', targetId)
      if (error) throw error
    }, 'Configuração administrada salva.')
  }
  function importServers(): void {
    let entries: Array<{ name: string; server: Record<string, unknown>; local: McpLocalServerConfig }>
    try {
      const document: unknown = JSON.parse(importJson)
      if (!document || typeof document !== 'object' || Array.isArray(document)) throw new Error('JSON MCP inválido.')
      const root = document as Record<string, unknown>
      const catalog = root.mcpServers ?? root.servers
      if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) throw new Error('Use um objeto mcpServers ou servers.')
      entries = Object.entries(catalog).map(([name, raw]) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Servidor ${name} inválido.`)
        const server = raw as Record<string, unknown>
        if (server.type === 'sse') throw new Error(`${name}: SSE legado não é suportado; use Streamable HTTP ou stdio.`)
        const url = typeof server.url === 'string' ? server.url.trim() : null
        const command = typeof server.command === 'string' ? server.command.trim() : null
        if (url && command) throw new Error(`${name}: informe URL ou comando, não ambos.`)
        if (!url && !command) throw new Error(`${name}: faltou URL ou comando.`)
        if (url) validateUrl(url)
        if (server.args !== undefined && (!Array.isArray(server.args) || server.args.some((item) => typeof item !== 'string'))) throw new Error(`${name}: args deve ser uma lista de textos.`)
        const local: McpLocalServerConfig = {
          env: normalizeReferences(server.env ? parseMap(JSON.stringify(server.env)) : {}),
          headers: normalizeReferences(server.headers ? parseMap(JSON.stringify(server.headers)) : {}),
          cwd: typeof server.cwd === 'string' ? server.cwd : undefined
        }
        if (!isOwn && (Object.keys(local.env ?? {}).length || Object.keys(local.headers ?? {}).length || local.cwd)) throw new Error(`${name}: parâmetros locais só podem ser importados para sua própria conta.`)
        return { name, server, local }
      })
      if (entries.length === 0 || entries.length > 20) throw new Error('Importe de 1 a 20 servidores por vez.')
    } catch (error) { setNotice((error as Error).message); return }
    void act(async () => {
      for (const { name, server, local } of entries) {
        const url = typeof server.url === 'string' ? server.url.trim() : null
        const command = typeof server.command === 'string' ? server.command.trim() : null
        const id = await insertServer({ slug: slugOf(name), name, description: typeof server.description === 'string' ? server.description : '',
          transport: url ? 'streamable_http' : 'stdio', url, command, args: Array.isArray(server.args) ? server.args as string[] : [] })
        if (isOwn && user?.id && (local.cwd || Object.keys(local.env ?? {}).length || Object.keys(local.headers ?? {}).length)) {
          await window.api.mcp.saveLocalServerConfig(user.id, id, local)
        }
      }
      setImportJson('')
    }, 'Servidores importados.')
  }
  function toggleBinding(server: McpServerItem, agentSource: 'default' | 'custom', agentId: string): void {
    const existing = bindings.find((item) => item.serverId === server.id && item.agentSource === agentSource && item.agentId === agentId)
    void act(async () => {
      const query = existing
        ? supabase.from('mcp_agent_bindings').delete().eq('id', existing.id).eq('user_id', targetId)
        : supabase.from('mcp_agent_bindings').insert({ user_id: targetId, server_id: server.id, agent_source: agentSource, agent_id: agentId })
      const { error } = await query
      if (error) throw error
    }, 'Vínculo atualizado.')
  }
  function saveLocal(server: McpServerItem): void {
    const draft = locals[server.id] ?? localOf(own.localConfig.servers[server.id], server.transport)
    if (!user?.id) return
    let config: McpLocalServerConfig
    try {
      config = { profile: server.slug === 'sap-abap' ? draft.profile.trim() || undefined : undefined,
        cwd: draft.cwd.trim() || undefined, env: parseMap(draft.env), headers: parseMap(draft.headers),
        disabledTools: own.localConfig.servers[server.id]?.disabledTools ?? [] }
    } catch (error) { setNotice((error as Error).message); return }
    void act(async () => { await window.api.mcp.saveLocalServerConfig(user.id, server.id, config) }, 'Parâmetros locais salvos.')
  }
  function test(server: McpServerItem): void {
    if (['ui5', 'cap', 'fiori'].includes(server.slug) && !own.localConfig.servers[server.id]?.cwd) {
      setTestStatus((old) => ({ ...old, [server.id]: 'Selecione e salve a pasta local do projeto antes do teste.' }))
      return
    }
    const config = effectiveMcpServer(server, own.localConfig.servers[server.id])
    setTestStatus((old) => ({ ...old, [server.id]: 'Conectando…' }))
    void (async () => {
      try {
        const tools = await window.api.mcp.listTools([config])
        const [resources, prompts] = await Promise.all([window.api.mcp.listResources([config]), window.api.mcp.listPrompts([config])])
        setToolCatalog((old) => ({ ...old, [server.id]: tools }))
        setResourceCatalog((old) => ({ ...old, [server.id]: resources }))
        setPromptCatalog((old) => ({ ...old, [server.id]: prompts }))
        setTestStatus((old) => ({ ...old, [server.id]: `${tools.length} ferramentas · ${resources.length} recursos · ${prompts.length} prompts. Teste SAP exige consulta real.` }))
      } catch (error) { setTestStatus((old) => ({ ...old, [server.id]: (error as Error).message })) }
    })()
  }
  function toggleTool(server: McpServerItem, toolName: string): void {
    if (!user?.id) return
    const current = own.localConfig.servers[server.id] ?? {}
    const disabled = new Set(current.disabledTools ?? [])
    if (disabled.has(toolName)) disabled.delete(toolName); else disabled.add(toolName)
    void act(async () => { await window.api.mcp.saveLocalServerConfig(user.id, server.id, { ...current, disabledTools: [...disabled] }) }, 'Ferramentas atualizadas.')
  }
  function queryTool(server: McpServerItem, tool: McpToolInfo): void {
    const key = `tool:${server.id}:${tool.name}`
    let args: Record<string, unknown>
    try { args = parseArguments(toolArgs[key] ?? '{}') }
    catch (error) { setToolResults((old) => ({ ...old, [key]: (error as Error).message })); return }
    setToolResults((old) => ({ ...old, [key]: 'Consultando…' }))
    void window.api.mcp.callTool(effectiveMcpServer(server, own.localConfig.servers[server.id]), tool.name, args)
      .then((result) => setToolResults((old) => ({ ...old, [key]: String(JSON.stringify(result, null, 2) ?? result).slice(0, 6000) })))
      .catch((error: Error) => setToolResults((old) => ({ ...old, [key]: error.message })))
  }
  function readResource(server: McpServerItem, resource: McpResourceInfo): void {
    const key = `resource:${server.id}:${resource.uri}`
    setToolResults((old) => ({ ...old, [key]: 'Lendo…' }))
    void window.api.mcp.readResource(effectiveMcpServer(server, own.localConfig.servers[server.id]), resource.uri)
      .then((result) => setToolResults((old) => ({ ...old, [key]: String(JSON.stringify(result, null, 2) ?? result).slice(0, 6000) })))
      .catch((error: Error) => setToolResults((old) => ({ ...old, [key]: error.message })))
  }
  function readPrompt(server: McpServerItem, prompt: McpPromptInfo): void {
    const key = `prompt:${server.id}:${prompt.name}`
    let args: Record<string, string>
    try { args = parseMap(toolArgs[key] ?? '{}') }
    catch (error) { setToolResults((old) => ({ ...old, [key]: (error as Error).message })); return }
    setToolResults((old) => ({ ...old, [key]: 'Carregando…' }))
    void window.api.mcp.getPrompt(effectiveMcpServer(server, own.localConfig.servers[server.id]), prompt.name, args)
      .then((result) => setToolResults((old) => ({ ...old, [key]: String(JSON.stringify(result, null, 2) ?? result).slice(0, 6000) })))
      .catch((error: Error) => setToolResults((old) => ({ ...old, [key]: error.message })))
  }

  return <div className="settings-section settings-section-mcp">
    <header className="settings-section-header"><h2>Gerenciador MCP</h2><p>Servidores, permissões por agente e parâmetros de conexão por usuário.</p></header>
    {canManage && <label className="settings-field-label">Usuário<select className="ai-provider-input" value={targetId} disabled={busy} onChange={(event) => { setTargetId(event.target.value); setRemoteServers([]); setRemoteBindings([]); setRemoteAgents([]); setDrafts({}); setLocals({}); setNotice(null) }}>
      {user && !users.some((item) => item.user_id === user.id) && <option value={user.id}>{user.email}</option>}
      {users.map((item) => <option key={item.user_id} value={item.user_id}>{item.display_name} · {item.email}</option>)}
    </select></label>}
    <div className="mcp-security-note">MASTER/ADMIN gerenciam o catálogo e os vínculos. Cada conta configura sua conexão neste computador; segredos no JSON são protegidos pelo sistema operacional.</div>
    {(notice || own.error) && <div className="mcp-error" role="status">{notice ?? own.error}</div>}
    {canManage && <section className="mcp-manager-group"><h3>Adicionar do catálogo</h3><div className="mcp-preset-actions mcp-preset-grid">
      {MCP_PRESETS.map((preset) => <button type="button" key={preset.id} className="mcp-preset-button" disabled={busy || servers.some((item) => item.slug === preset.slug)} onClick={() => addPreset(preset)}><Plus size={14} />{preset.name}</button>)}
    </div><p className="settings-muted">Servidores locais podem baixar pacotes na primeira execução. Confirme o executável antes de iniciar.</p></section>}
    {canManage && <section className="mcp-manager-group"><h3>Cadastrar novo MCP</h3><div className="mcp-form-grid">
      <label className="settings-field-label">Nome<input className="ai-provider-input" value={newServer.name} onChange={(event) => setNewServer({ ...newServer, name: event.target.value })} /></label>
      <label className="settings-field-label">Transporte<select className="ai-provider-input" value={newServer.transport} onChange={(event) => setNewServer({ ...newServer, transport: event.target.value as McpTransport, endpoint: '', args: '' })}><option value="streamable_http">Streamable HTTP</option><option value="stdio">stdio</option></select></label>
      <label className="settings-field-label mcp-span">Descrição<input className="ai-provider-input" value={newServer.description} onChange={(event) => setNewServer({ ...newServer, description: event.target.value })} /></label>
      <label className="settings-field-label mcp-span">{newServer.transport === 'stdio' ? 'Executável' : 'URL MCP'}<input className="ai-provider-input" value={newServer.endpoint} onChange={(event) => setNewServer({ ...newServer, endpoint: event.target.value })} placeholder={newServer.transport === 'stdio' ? 'npx.cmd, uvx, docker…' : 'https://servidor.example/mcp'} /></label>
      {newServer.transport === 'stdio' && <label className="settings-field-label mcp-span">Argumentos, um por linha<textarea className="mcp-args-input" rows={3} value={newServer.args} onChange={(event) => setNewServer({ ...newServer, args: event.target.value })} /></label>}
    </div><button type="button" className="ai-provider-save mcp-action" disabled={busy} onClick={addCustom}><Plus size={14} /> Cadastrar</button></section>}
    {canManage && <section className="mcp-manager-group"><h3>Importar configuração MCP</h3><p className="settings-muted">Cole um JSON com mcpServers ou servers. URL/comando vão ao catálogo; cwd, env e headers da sua conta vão ao JSON local protegido. Não coloque tokens em URL ou argumentos.</p>
      <textarea className="mcp-args-input" rows={5} value={importJson} onChange={(event) => setImportJson(event.target.value)} placeholder={'{"mcpServers":{"exemplo":{"command":"npx","args":["-y","pacote-mcp"]}}}'} />
      <button type="button" className="ai-provider-save mcp-action" disabled={busy || !importJson.trim()} onClick={importServers}>Importar</button>
    </section>}
    <section className="mcp-manager-group"><h3>Servidores</h3>{servers.length === 0 && <p className="settings-muted">Nenhum MCP disponível para esta conta.</p>}
      <div className="mcp-server-list">{servers.map((server) => {
        const draft = drafts[server.id] ?? draftOf(server)
        const local = locals[server.id] ?? localOf(own.localConfig.servers[server.id], server.transport)
        const preset = MCP_PRESETS.find((item) => item.slug === server.slug)
        return <article className="mcp-server-card" key={server.id}>
          <div className="mcp-server-header"><div><strong>{server.name}</strong><span>{server.transport === 'stdio' ? 'Processo local stdio' : 'Streamable HTTP'} · {server.enabled ? 'Ativo' : 'Inativo'}</span></div>
            {canManage && <label className="mcp-enabled-label"><input type="checkbox" checked={server.enabled} disabled={busy} onChange={() => void act(async () => { const { error } = await supabase.from('mcp_servers').update({ enabled: !server.enabled }).eq('id', server.id).eq('user_id', targetId); if (error) throw error }, 'Estado atualizado.')} /> Ativo</label>}
          </div>
          {server.description && <p className="mcp-server-description">{server.description}</p>}
          {isOwn && ['ui5', 'cap', 'fiori'].includes(server.slug) && !own.localConfig.servers[server.id]?.cwd && <span className="mcp-warning">Escolha a pasta local do projeto para habilitar este MCP nas conversas.</span>}
          {preset && <a className="mcp-doc-link" href={preset.documentation} target="_blank" rel="noreferrer">Documentação <ExternalLink size={12} /></a>}
          {canManage && <details><summary>Configuração administrada</summary><div className="mcp-form-grid">
            <label className="settings-field-label">Nome<input className="ai-provider-input" value={draft.name} onChange={(event) => setDrafts({ ...drafts, [server.id]: { ...draft, name: event.target.value } })} /></label>
            <label className="settings-field-label">Descrição<input className="ai-provider-input" value={draft.description} onChange={(event) => setDrafts({ ...drafts, [server.id]: { ...draft, description: event.target.value } })} /></label>
            <label className="settings-field-label mcp-span">{server.transport === 'stdio' ? 'Executável' : 'URL'}<input className="ai-provider-input" value={draft.endpoint} onChange={(event) => setDrafts({ ...drafts, [server.id]: { ...draft, endpoint: event.target.value } })} /></label>
            {server.transport === 'stdio' && <label className="settings-field-label mcp-span">Argumentos<textarea className="mcp-args-input" rows={4} value={draft.args} onChange={(event) => setDrafts({ ...drafts, [server.id]: { ...draft, args: event.target.value } })} /></label>}
          </div><div className="mcp-card-actions"><button type="button" className="ai-provider-save mcp-action" disabled={busy} onClick={() => saveCentral(server)}><Save size={13} /> Salvar</button><button type="button" className="ai-provider-remove" title="Remover servidor" disabled={busy} onClick={() => void act(async () => { const { error } = await supabase.from('mcp_servers').delete().eq('id', server.id).eq('user_id', targetId); if (error) throw error; if (isOwn && user?.id) await window.api.mcp.saveLocalServerConfig(user.id, server.id, null) }, 'Servidor removido.')}><Trash2 size={14} /></button></div></details>}
          {canManage && <details><summary>Agentes autorizados</summary><div className="mcp-agent-grid">{availableAgents.map((agent) => <label key={`${agent.source}:${agent.id}`} className="mcp-agent-option"><input type="checkbox" disabled={busy} checked={bindings.some((item) => item.serverId === server.id && item.agentSource === agent.source && item.agentId === agent.id && item.enabled)} onChange={() => toggleBinding(server, agent.source, agent.id)} />{agent.name}</label>)}</div></details>}
          {isOwn && <details><summary>Conexão local</summary><p className="settings-muted">A URL, o executável e os argumentos são administrados. Ambiente e headers aceitam JSON. Valores sensíveis ficam criptografados no arquivo local.</p><div className="mcp-form-grid">
            {server.slug === 'sap-abap' && <label className="settings-field-label mcp-span">Perfil SAP<input className="ai-provider-input" value={local.profile} placeholder="DEV100" onChange={(event) => setLocals({ ...locals, [server.id]: { ...local, profile: event.target.value } })} /></label>}
            {server.transport === 'stdio' && <label className="settings-field-label mcp-span">Pasta do projeto<div className="mcp-picker"><input className="ai-provider-input" value={local.cwd} onChange={(event) => setLocals({ ...locals, [server.id]: { ...local, cwd: event.target.value } })} /><button type="button" className="mcp-preset-button" title="Escolher pasta" onClick={() => void window.api.mcp.pickDirectory().then((path) => { if (path) setLocals((old) => ({ ...old, [server.id]: { ...(old[server.id] ?? local), cwd: path } })) })}><FolderOpen size={14} /></button></div></label>}
            <label className="settings-field-label mcp-span">Variáveis de ambiente (JSON)<textarea className="mcp-args-input" rows={3} value={local.env} onChange={(event) => setLocals({ ...locals, [server.id]: { ...local, env: event.target.value } })} /></label>
            {server.transport === 'streamable_http' && <label className="settings-field-label mcp-span">Headers HTTP (JSON)<textarea className="mcp-args-input" rows={3} value={local.headers} onChange={(event) => setLocals({ ...locals, [server.id]: { ...local, headers: event.target.value } })} /></label>}
          </div><div className="mcp-card-actions"><button type="button" className="ai-provider-save mcp-action" disabled={busy} onClick={() => saveLocal(server)}><Save size={13} /> Salvar local</button></div></details>}
          {isOwn && <><div className="mcp-card-actions"><span className="mcp-test-status">{testStatus[server.id]}</span><button type="button" className="mcp-test-button" onClick={() => test(server)}>Testar e listar ferramentas</button></div>
            {!!toolCatalog[server.id]?.length && <details><summary>Ferramentas disponíveis ({toolCatalog[server.id].length})</summary><div className="mcp-tool-list">{toolCatalog[server.id].map((tool) => {
              const key = `tool:${server.id}:${tool.name}`
              return <div key={tool.qualifiedName} className="mcp-tool-item"><label className="mcp-agent-option"><input type="checkbox" checked={!own.localConfig.servers[server.id]?.disabledTools?.includes(tool.name)} onChange={() => toggleTool(server, tool.name)} /><span><strong>{tool.name}</strong> · {tool.requiresConfirmation ? 'exige confirmação' : 'leitura'}<small>{tool.description}</small></span></label>
                {!tool.requiresConfirmation && <div className="mcp-tool-query"><input className="ai-provider-input" aria-label={`Argumentos JSON para ${tool.name}`} placeholder="{}" value={toolArgs[key] ?? ''} onChange={(event) => setToolArgs({ ...toolArgs, [key]: event.target.value })} /><button type="button" className="mcp-preset-button" onClick={() => queryTool(server, tool)}>Consultar</button></div>}
                {toolResults[key] && <pre className="mcp-tool-result">{toolResults[key]}</pre>}
              </div>
            })}</div></details>}
            {!!resourceCatalog[server.id]?.length && <details><summary>Recursos ({resourceCatalog[server.id].length})</summary><div className="mcp-tool-list">{resourceCatalog[server.id].map((resource) => {
              const key = `resource:${server.id}:${resource.uri}`
              return <div key={key} className="mcp-tool-item"><strong>{resource.name}</strong><small>{resource.uri}</small><div className="mcp-tool-query"><button type="button" className="mcp-preset-button" onClick={() => readResource(server, resource)}>Ler recurso</button></div>{toolResults[key] && <pre className="mcp-tool-result">{toolResults[key]}</pre>}</div>
            })}</div></details>}
            {!!promptCatalog[server.id]?.length && <details><summary>Prompts ({promptCatalog[server.id].length})</summary><div className="mcp-tool-list">{promptCatalog[server.id].map((prompt) => {
              const key = `prompt:${server.id}:${prompt.name}`
              return <div key={key} className="mcp-tool-item"><strong>{prompt.name}</strong><small>{prompt.description}</small><small>Argumentos: {prompt.arguments.map((argument) => `${argument.name}${argument.required ? '*' : ''}`).join(', ') || 'nenhum'}</small><div className="mcp-tool-query"><input className="ai-provider-input" aria-label={`Argumentos JSON para ${prompt.name}`} placeholder="{}" value={toolArgs[key] ?? ''} onChange={(event) => setToolArgs({ ...toolArgs, [key]: event.target.value })} /><button type="button" className="mcp-preset-button" onClick={() => readPrompt(server, prompt)}>Carregar prompt</button></div>{toolResults[key] && <pre className="mcp-tool-result">{toolResults[key]}</pre>}</div>
            })}</div></details>}
          </>}
        </article>
      })}</div>
    </section>
  </div>
}
