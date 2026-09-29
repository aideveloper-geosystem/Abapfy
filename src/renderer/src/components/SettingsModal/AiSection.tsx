import { FormEvent, useEffect, useRef, useState } from 'react'
import { Check, ExternalLink, KeyRound, Trash2 } from 'lucide-react'
import { AiBehaviorPanel, AiToolsPanel } from './AiPreferencesPanels'
import { supabase } from '@renderer/lib/supabaseClient'
import { useAuthStore } from '@renderer/store/authStore'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { AI_PROVIDERS, type AiProviderId } from '@renderer/lib/aiProviders'
import { CLAUDE_EFFORT_LABELS_PT } from '@renderer/lib/aiClient'
import { useAiModelsStore, type ManagedAiModel } from '@renderer/store/aiModelsStore'
import './SettingsSections.css'

interface AccessUser { user_id: string; display_name: string; email: string }
interface KeyStatus { provider: AiProviderId; updated_at: string }
type AiTab = 'providers' | 'behavior' | 'tools' | 'catalog'

export function AiSection(): JSX.Element {
  const { role, user } = useAuthStore()
  const canManage = role === 'MASTER' || role === 'ADMIN'
  const { apiKeys, defaultProvider, defaultModel, setDefaultModel, aiPreferences, load: loadSettings } = useSettingsStore()
  const [tab, setTab] = useState<AiTab>('providers')
  const [users, setUsers] = useState<AccessUser[]>([])
  const [targetId, setTargetId] = useState(user?.id ?? '')
  const [keys, setKeys] = useState<KeyStatus[]>([])
  const [drafts, setDrafts] = useState<Record<AiProviderId, string>>({ openai: '', gemini: '', claude: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { models, blocks, load: loadModels, save: saveModel, remove: removeModel, setBlocked } = useAiModelsStore()
  const [modelDraft, setModelDraft] = useState<ManagedAiModel>({ provider: 'openai', model_id: '', label: '', description: '', enabled: true })
  const [editingModel, setEditingModel] = useState(false)
  const ownTarget = targetId === user?.id
  const targetRef = useRef(targetId)
  targetRef.current = targetId

  useEffect(() => {
    if (!canManage) return
    void supabase.rpc('list_ai_access_users').then(({ data, error: cause }) => {
      if (cause) setError(cause.message)
      else setUsers((data ?? []) as AccessUser[])
    })
  }, [canManage])

  useEffect(() => {
    if (!canManage) void loadSettings()
  }, [canManage, loadSettings])

  useEffect(() => { void loadModels() }, [loadModels])

  async function refresh(target: string): Promise<void> {
    const keyResult = await supabase.rpc('list_ai_key_status', { p_user_id: target })
    const cause = keyResult.error
    if (cause) throw cause
    if (target !== targetRef.current) return
    setKeys((keyResult.data ?? []) as KeyStatus[])
  }

  useEffect(() => {
    if (!canManage || !targetId) return
    setKeys([]); setDrafts({ openai: '', gemini: '', claude: '' })
    void refresh(targetId).catch((cause) => setError((cause as Error).message))
  }, [canManage, targetId])

  async function act(task: () => Promise<void>): Promise<void> {
    setBusy(true); setError(null)
    try {
      await task()
      await refresh(targetId)
      await loadModels()
      if (ownTarget) await loadSettings()
    } catch (cause) { setError((cause as Error).message) }
    finally { setBusy(false) }
  }

  async function saveKey(event: FormEvent, provider: AiProviderId): Promise<void> {
    event.preventDefault()
    const value = drafts[provider].trim()
    if (!value) return
    await act(async () => {
      const { error: cause } = await supabase.rpc('set_ai_api_key', {
        p_user_id: targetId, p_provider: provider, p_api_key: value
      })
      if (cause) throw cause
      setDrafts((old) => ({ ...old, [provider]: '' }))
    })
  }

  async function addModel(event: FormEvent): Promise<void> {
    event.preventDefault()
    const model = { ...modelDraft, model_id: modelDraft.model_id.trim(), label: modelDraft.label.trim(), description: modelDraft.description.trim() }
    if (!model.model_id || !model.label) return
    await act(async () => { await saveModel(model); setModelDraft({ provider: model.provider, model_id: '', label: '', description: '', enabled: true }); setEditingModel(false) })
  }

  // Resumo sempre do próprio usuário, mesmo quando um admin gerencia outra conta.
  const connectedCount = AI_PROVIDERS.filter((provider) => apiKeys[provider.id]?.configured).length
  const defaultModelLabel = models.find((model) => model.provider === defaultProvider && model.model_id === defaultModel)?.label
    ?? defaultModel ?? 'Nenhum'
  const paidTools = [aiPreferences.webSearch && 'Pesquisa web', aiPreferences.webFetch && 'Leitura de links'].filter(Boolean)
  const tabs: { id: AiTab; label: string }[] = [
    { id: 'providers', label: 'Provedores e modelos' },
    { id: 'behavior', label: 'Comportamento' },
    { id: 'tools', label: 'Ferramentas' },
    ...(canManage ? [{ id: 'catalog' as const, label: 'Catálogo' }] : [])
  ]

  return <div className="settings-section settings-section-ai">
    <header className="settings-section-header">
      <h2>Inteligência Artificial</h2>
      <p>Provedores, modelo padrão, como o Claude raciocina e quais ferramentas pagas ele pode usar. Integrações MCP ficam na aba MCP.</p>
    </header>
    <div className="ai-summary">
      <div className="ai-summary-tile">
        <span className="ai-summary-label">Modelo padrão</span>
        <strong>{defaultModelLabel}</strong>
        <small>{AI_PROVIDERS.find((provider) => provider.id === defaultProvider)?.name ?? 'Escolha em Provedores'}</small>
      </div>
      <div className="ai-summary-tile">
        <span className="ai-summary-label">Provedores</span>
        <strong>{connectedCount} de {AI_PROVIDERS.length}</strong>
        <small>conectados</small>
      </div>
      <div className="ai-summary-tile">
        <span className="ai-summary-label">Effort padrão (Claude)</span>
        <strong>{CLAUDE_EFFORT_LABELS_PT[aiPreferences.defaultEffort]}</strong>
        <small>{aiPreferences.showThinking ? 'Raciocínio visível' : 'Raciocínio oculto'}</small>
      </div>
      <div className={`ai-summary-tile ${paidTools.length ? 'ai-summary-tile-paid' : ''}`}>
        <span className="ai-summary-label">Ferramentas pagas</span>
        <strong>{paidTools.length ? `${paidTools.length} ativa${paidTools.length > 1 ? 's' : ''}` : 'Desligadas'}</strong>
        <small>{paidTools.length ? paidTools.join(' · ') : 'Sem custo extra por uso'}</small>
      </div>
    </div>
    <nav className="ai-tabs" role="tablist">
      {tabs.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id}
        className={`ai-tab ${tab === item.id ? 'ai-tab-active' : ''}`} onClick={() => setTab(item.id)}>{item.label}</button>)}
    </nav>
    {(tab === 'providers' || tab === 'catalog') && <>
      {canManage && <label className="settings-field-label ai-target-user">{tab === 'catalog' ? 'Bloqueios do usuário' : 'Chaves do usuário'}
        <select className="ai-provider-input" value={targetId} disabled={busy} onChange={(event) => setTargetId(event.target.value)}>
          {user && !users.some((item) => item.user_id === user.id) && <option value={user.id}>{user.email}</option>}
          {users.map((item) => <option key={item.user_id} value={item.user_id}>{item.display_name} · {item.email}</option>)}
        </select>
      </label>}
      {error && <div className="mcp-error" role="alert">{error}</div>}
    </>}
    {tab === 'providers' && <>
    <div className="ai-provider-list">{AI_PROVIDERS.map((provider) => {
      const key = canManage ? keys.find((item) => item.provider === provider.id) : null
      const configured = canManage ? !!key : !!apiKeys[provider.id]?.configured
      const updatedAt = canManage ? key?.updated_at : apiKeys[provider.id]?.updatedAt
      return <div key={provider.id} className="ai-provider-card">
        <div className="ai-provider-header"><div className="ai-provider-title"><KeyRound size={15} /><span>{provider.name}</span></div>
          <span className={`ai-provider-status ${configured ? 'ai-provider-status-on' : ''}`}>{configured ? 'Conectado' : 'Não configurado'}</span></div>
        {canManage && <form className="ai-provider-form" onSubmit={(event) => void saveKey(event, provider.id)}>
          <input type="password" className="ai-provider-input" placeholder={configured ? 'Substituir chave' : provider.keyPlaceholder}
            value={drafts[provider.id]} onChange={(event) => setDrafts((old) => ({ ...old, [provider.id]: event.target.value }))} autoComplete="off" />
          <button type="submit" className="ai-provider-save" disabled={busy || !drafts[provider.id].trim()}>Salvar</button>
          {configured && <button type="button" className="ai-provider-remove" title="Remover chave" disabled={busy}
            onClick={() => void act(async () => { const { error: cause } = await supabase.rpc('remove_ai_api_key', { p_user_id: targetId, p_provider: provider.id }); if (cause) throw cause })}><Trash2 size={14} /></button>}
        </form>}
        <div className="ai-provider-meta"><a className="ai-provider-help" href={provider.keyHelpUrl} target="_blank" rel="noreferrer">{provider.keyHint} <ExternalLink size={11} /></a>
          {updatedAt && <span className="ai-provider-updated">Atualizada em {new Date(updatedAt).toLocaleString('pt-BR')}</span>}</div>
        {ownTarget && configured && <div className="ai-model-chips">{models.filter((model) => model.provider === provider.id && model.enabled && !blocks.some((block) => block.user_id === user?.id && block.provider === model.provider && block.model_id === model.model_id)).map((model) => {
          const selected = defaultProvider === provider.id && defaultModel === model.model_id
          return <button key={model.model_id} type="button" className={`ai-model-chip ${selected ? 'ai-model-chip-active' : ''}`}
            title={model.description} onClick={() => void setDefaultModel(provider.id, model.model_id).catch((cause) => setError((cause as Error).message))}>{selected && <Check size={12} />}{model.label}</button>
        })}</div>}
      </div>
    })}</div>
    </>}
    {tab === 'behavior' && <AiBehaviorPanel />}
    {tab === 'tools' && <AiToolsPanel />}
    {tab === 'catalog' && <>
    {canManage && <div className="ai-integrations-panel ai-integrations-panel-flat">
      <p className="settings-muted">Modelos desativados ficam indisponíveis para todos. O bloqueio por usuário impede a seleção individual.</p>
      <form className="ai-model-management-form" onSubmit={(event) => void addModel(event)}>
        <select className="ai-provider-input" value={modelDraft.provider} disabled={editingModel} onChange={(event) => setModelDraft((draft) => ({ ...draft, provider: event.target.value as AiProviderId }))}>
          {AI_PROVIDERS.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
        </select>
        <input className="ai-provider-input" placeholder="ID exato da API" value={modelDraft.model_id} disabled={editingModel} onChange={(event) => setModelDraft((draft) => ({ ...draft, model_id: event.target.value }))} />
        <input className="ai-provider-input" placeholder="Nome exibido" value={modelDraft.label} onChange={(event) => setModelDraft((draft) => ({ ...draft, label: event.target.value }))} />
        <input className="ai-provider-input" placeholder="Descrição" value={modelDraft.description} onChange={(event) => setModelDraft((draft) => ({ ...draft, description: event.target.value }))} />
        <button type="submit" className="ai-provider-save" disabled={busy || !modelDraft.model_id.trim() || !modelDraft.label.trim()}>{editingModel ? 'Salvar modelo' : 'Adicionar modelo'}</button>
        {editingModel && <button type="button" className="ai-provider-save" onClick={() => { setEditingModel(false); setModelDraft({ provider: 'openai', model_id: '', label: '', description: '', enabled: true }) }}>Cancelar</button>}
      </form>
      {models.map((model) => {
        const blocked = blocks.some((block) => block.user_id === targetId && block.provider === model.provider && block.model_id === model.model_id)
        return <div key={`${model.provider}:${model.model_id}`} className="ai-model-management-row">
          <span><strong>{model.label}</strong> · {AI_PROVIDERS.find((item) => item.id === model.provider)?.name}<small>{model.model_id}</small></span>
          <label><input type="checkbox" checked={model.enabled} disabled={busy} onChange={() => void act(() => saveModel({ ...model, enabled: !model.enabled }))} /> Ativo</label>
          <label><input type="checkbox" checked={blocked} disabled={busy || !targetId} onChange={() => void act(() => setBlocked(targetId, model.provider, model.model_id, !blocked))} /> Bloquear para usuário</label>
          <button type="button" className="ai-provider-save" disabled={busy} onClick={() => { setModelDraft(model); setEditingModel(true) }}>Editar</button>
          <button type="button" className="ai-provider-remove" title="Remover modelo" disabled={busy} onClick={() => void act(() => removeModel(model.provider, model.model_id))}><Trash2 size={14} /></button>
        </div>
      })}
    </div>}
    </>}
  </div>
}
