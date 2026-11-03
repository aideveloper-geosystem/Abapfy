import { useEffect, useState } from 'react'
import { Bot, Check, GitBranch, Plus, Trash2, Workflow } from 'lucide-react'
import { useAuthStore } from '@renderer/store/authStore'
import { useAiModelsStore, type ManagedAiModel } from '@renderer/store/aiModelsStore'
import { useAdvancedFlowStore } from '@renderer/store/advancedFlowStore'
import { FlowTokenNotice } from '../FlowTokenNotice'
import { FLOW_HOOK_PRESETS, addFlowHookPreset } from '../../../../shared/flowHookPresets'
import {
  HOOK_ACTIONS,
  HOOK_EVENTS,
  type AdvancedFlow,
  type FlowAgent,
  type FlowHook
} from '../../../../shared/advancedFlow'
import './SettingsSections.css'
import './AdvancedFlowSection.css'

type ModelChoice = AdvancedFlow['orchestrator']
function ModelFields({
  value,
  models,
  onChange,
  label
}: {
  value: Pick<ModelChoice, 'provider' | 'model' | 'effort'>
  models: ManagedAiModel[]
  onChange: (patch: Partial<ModelChoice>) => void
  label: string
}): JSX.Element {
  const selected = `${value.provider}:${value.model}`
  const missing = value.model && !models.some((m) => `${m.provider}:${m.model_id}` === selected)
  return (
    <div className="flow-model-fields">
      <label className="settings-field-label">
        Modelo
        <select
          aria-label={`Modelo ${label}`}
          value={value.model ? selected : ''}
          onChange={(e) => {
            const item = models.find((m) => `${m.provider}:${m.model_id}` === e.target.value)
            onChange({ provider: item?.provider ?? value.provider, model: item?.model_id ?? '' })
          }}
        >
          <option value="">Selecionar modelo disponível</option>
          {missing && (
            <option value={selected} disabled>
              {value.model} · indisponível
            </option>
          )}
          {models.map((m) => (
            <option key={`${m.provider}:${m.model_id}`} value={`${m.provider}:${m.model_id}`}>
              {m.label} · {m.provider}
            </option>
          ))}
        </select>
      </label>
      <label className="settings-field-label">
        Esforço Claude
        <select
          aria-label={`Esforço ${label}`}
          value={value.effort}
          disabled={value.provider !== 'claude'}
          onChange={(e) => onChange({ effort: e.target.value as ModelChoice['effort'] })}
        >
          <option value="low">Baixo</option>
          <option value="medium">Médio</option>
          <option value="high">Alto</option>
          <option value="max">Máximo</option>
        </select>
      </label>
    </div>
  )
}
export function AdvancedFlowSection({
  initialDraft,
  onDraftChange
}: {
  initialDraft?: AdvancedFlow
  onDraftChange?: (draft: AdvancedFlow) => void
} = {}): JSX.Element {
  const [tab, setTab] = useState<'overview' | 'stages' | 'team' | 'hooks' | 'limits'>('overview')
  const userId = useAuthStore((s) => s.user?.id)
  const { userId: owner, config, error, load, save } = useAdvancedFlowStore()
  const { models: catalog, blocks, load: loadModels } = useAiModelsStore()
  const [draft, setDraft] = useState<AdvancedFlow>(() => structuredClone(initialDraft ?? config))
  const [notice, setNotice] = useState('')
  const [failure, setFailure] = useState('')
  useEffect(() => {
    if (userId) load(userId)
    void loadModels()
  }, [userId, load, loadModels])
  useEffect(() => {
    if (owner === userId) {
      setDraft(structuredClone(initialDraft ?? config))
      setNotice('')
      setFailure('')
    }
  }, [config, owner, userId])
  const models = catalog.filter(
    (m) =>
      m.enabled &&
      !blocks.some(
        (b) => b.user_id === userId && b.provider === m.provider && b.model_id === m.model_id
      )
  )
  const dirty = JSON.stringify(draft) !== JSON.stringify(config)
  const patch = (value: Partial<AdvancedFlow>) => {
    const next = { ...draft, ...value }
    setDraft(next)
    onDraftChange?.(next)
    setNotice('')
    setFailure('')
  }
  const agentPatch = (id: string, value: Partial<FlowAgent>) =>
    patch({ agents: draft.agents.map((a) => (a.id === id ? { ...a, ...value } : a)) })
  const hookPatch = (id: string, value: Partial<FlowHook>) =>
    patch({ hooks: draft.hooks.map((h) => (h.id === id ? { ...h, ...value } : h)) })
  function example(): void {
    const find = (family: string) =>
      models.find(
        (m) => m.provider === 'claude' && /claude/i.test(m.model_id) && m.model_id.includes(family)
      )
    const opus = find('opus'),
      sonnet = find('sonnet'),
      haiku = find('haiku')
    patch({
      enabled: false,
      stages: [],
      orchestrator: { ...draft.orchestrator, provider: 'claude', model: opus?.model_id ?? '' },
      agents: [
        {
          id: crypto.randomUUID(),
          name: 'Especialista SAP',
          provider: 'claude',
          model: sonnet?.model_id ?? '',
          effort: 'medium',
          enabled: Boolean(sonnet),
          tools: 'read',
          instructions:
            'Investigue os objetos SAP da subtarefa. Leia fontes e dados, apresente referências exatas e separe o que foi verificado das pendências.'
        },
        {
          id: crypto.randomUUID(),
          name: 'Organizador de evidências',
          provider: 'claude',
          model: haiku?.model_id ?? '',
          effort: 'low',
          enabled: Boolean(haiku),
          tools: 'none',
          instructions:
            'Organize e classifique somente as evidências fornecidas na subtarefa. Não invente campos, objetos ou conclusões técnicas.'
        }
      ]
    })
  }
  return (
    <div className="settings-section flow-settings">
      <div className="flow-editor-body">
        <header className="settings-section-header">
          <span className="flow-eyebrow">Avançado</span>
          <h2>{draft.name}</h2>
          <p>Organize a equipe, as etapas e as regras deste fluxo.</p>
        </header>
        <nav className="flow-editor-tabs" aria-label="Seções do fluxo">
          {(
            [
              ['overview', 'Orquestrador'],
              ['stages', 'Etapas'],
              ['team', 'Equipe'],
              ['hooks', 'Hooks'],
              ['limits', 'Limites']
            ] as const
          ).map(([id, label]) => (
            <button type="button" key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="flow-editor-section" hidden={tab !== 'overview'}>
          <section className={`flow-enable-card ${draft.enabled ? 'is-enabled' : ''}`}>
            <span className="flow-enable-icon">
              <Workflow size={24} />
            </span>
            <div>
              <h3>Disponível no chat</h3>
              <p>
                Marque este fluxo como disponível e selecione-o no chat quando quiser usar. O modo
                padrão continua disponível.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-label="Disponibilizar este fluxo no chat"
              aria-describedby="flow-editor-token-warning"
              aria-checked={draft.enabled}
              className="flow-switch"
              onClick={() => patch({ enabled: !draft.enabled })}
            >
              <span />
            </button>
          </section>
          <FlowTokenNotice id="flow-editor-token-warning" />
          <div className="flow-path" aria-label="Etapas do fluxo">
            <span>Seu pedido</span>
            <span aria-hidden="true">→</span>
            <span>
              <Bot size={14} /> Orquestrador
            </span>
            <span aria-hidden="true">⇄</span>
            <span>
              <GitBranch size={14} /> Subagentes
            </span>
            <span aria-hidden="true">→</span>
            <span>Resposta</span>
          </div>
          <div className="flow-section-heading">
            <div>
              <h3>Orquestrador</h3>
              <p>Planeja o trabalho, delega e consolida a resposta final.</p>
            </div>
            <button className="settings-action" type="button" onClick={example}>
              Preencher exemplo Opus + Sonnet / Haiku
            </button>
          </div>
          <section className="flow-card">
            <label className="settings-field-label">
              Nome do fluxo
              <input
                maxLength={100}
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </label>
            <ModelFields
              label="do orquestrador"
              value={draft.orchestrator}
              models={models}
              onChange={(value) => patch({ orchestrator: { ...draft.orchestrator, ...value } })}
            />
            <label className="settings-field-label">
              Acesso do orquestrador às ferramentas
              <select
                aria-label="Ferramentas do orquestrador"
                value={draft.orchestrator.tools}
                onChange={(e) =>
                  patch({
                    orchestrator: {
                      ...draft.orchestrator,
                      tools: e.target.value as FlowAgent['tools']
                    }
                  })
                }
              >
                <option value="none">Somente coordenar · delegar aos especialistas</option>
                <option value="read">
                  Coordenar e consultar · somente leitura de arquivos e ADT
                </option>
                <option value="inherit">
                  Ferramentas da sessão · inclui alterações autorizadas
                </option>
              </select>
            </label>
            <label className="settings-field-label">
              Instruções do orquestrador
              <textarea
                rows={4}
                maxLength={12000}
                value={draft.orchestrator.instructions}
                onChange={(e) =>
                  patch({ orchestrator: { ...draft.orchestrator, instructions: e.target.value } })
                }
              />
            </label>
          </section>
        </div>
        <div className="flow-editor-section" hidden={tab !== 'stages'}>
          <div className="flow-section-heading">
            <div>
              <h3>Etapas de execução</h3>
              <p>
                Executadas de cima para baixo. Especialistas da mesma etapa podem trabalhar em
                paralelo.
              </p>
            </div>
            <button
              type="button"
              className="settings-action"
              disabled={draft.stages.length >= 20 || !draft.agents.some((a) => a.enabled)}
              onClick={() =>
                patch({
                  stages: [
                    ...draft.stages,
                    {
                      id: crypto.randomUUID(),
                      name: 'Nova etapa',
                      instructions:
                        'Investigue esta parte do pedido e retorne evidências e pendências.',
                      agentIds: [draft.agents.find((a) => a.enabled)!.id],
                      enabled: true
                    }
                  ]
                })
              }
            >
              <Plus size={14} /> Adicionar etapa
            </button>
          </div>
          {!draft.stages.length && (
            <div className="flow-empty">
              <strong>Delegação livre pelo orquestrador</strong>
              <p>
                Adicione etapas para definir uma sequência fixa. Sem etapas, o orquestrador decide
                quando delegar.
              </p>
            </div>
          )}
          {draft.stages.map((stage, index) => (
            <section className="flow-card" key={stage.id}>
              <div className="flow-card-heading">
                <span className="flow-number">{index + 1}</span>
                <label className="flow-agent-name">
                  Nome da etapa
                  <input
                    value={stage.name}
                    maxLength={100}
                    onChange={(e) =>
                      patch({
                        stages: draft.stages.map((s) =>
                          s.id === stage.id ? { ...s, name: e.target.value } : s
                        )
                      })
                    }
                  />
                </label>
                <label className="flow-check">
                  <input
                    type="checkbox"
                    checked={stage.enabled}
                    onChange={(e) =>
                      patch({
                        stages: draft.stages.map((s) =>
                          s.id === stage.id ? { ...s, enabled: e.target.checked } : s
                        )
                      })
                    }
                  />{' '}
                  Ativa
                </label>
                <button
                  className="flow-delete"
                  type="button"
                  aria-label={'Remover etapa ' + stage.name}
                  onClick={() => patch({ stages: draft.stages.filter((s) => s.id !== stage.id) })}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <label className="settings-field-label">
                Objetivo e instruções
                <textarea
                  rows={3}
                  value={stage.instructions}
                  maxLength={6000}
                  onChange={(e) =>
                    patch({
                      stages: draft.stages.map((s) =>
                        s.id === stage.id ? { ...s, instructions: e.target.value } : s
                      )
                    })
                  }
                />
              </label>
              <div className="flow-stage-members">
                <strong>Especialistas desta etapa</strong>
                {draft.agents
                  .filter((a) => a.enabled)
                  .map((a) => (
                    <label className="flow-check" key={a.id}>
                      <input
                        type="checkbox"
                        checked={stage.agentIds.includes(a.id)}
                        onChange={(e) =>
                          patch({
                            stages: draft.stages.map((s) =>
                              s.id === stage.id
                                ? {
                                    ...s,
                                    agentIds: e.target.checked
                                      ? [...s.agentIds, a.id]
                                      : s.agentIds.filter((id) => id !== a.id)
                                  }
                                : s
                            )
                          })
                        }
                      />
                      {a.name}
                    </label>
                  ))}
              </div>
              <div className="flow-stage-order">
                <span>
                  {stage.agentIds.length > 1
                    ? 'Execução paralela dentro da etapa'
                    : 'Execução individual'}
                </span>
                {[-1, 1].map((direction) => (
                  <button
                    key={direction}
                    type="button"
                    className="settings-action"
                    disabled={index + direction < 0 || index + direction >= draft.stages.length}
                    onClick={() => {
                      const stages = [...draft.stages]
                      ;[stages[index], stages[index + direction]] = [
                        stages[index + direction],
                        stages[index]
                      ]
                      patch({ stages })
                    }}
                  >
                    {direction === -1 ? 'Subir' : 'Descer'}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
        <div className="flow-editor-section" hidden={tab !== 'team'}>
          <div className="flow-section-heading">
            <div>
              <h3>
                Subagentes <small>{draft.agents.length}/8</small>
              </h3>
              <p>Cada especialista recebe uma subtarefa em contexto próprio.</p>
            </div>
            <button
              type="button"
              className="settings-action"
              disabled={draft.agents.length >= 8}
              onClick={() =>
                patch({
                  agents: [
                    ...draft.agents,
                    {
                      id: crypto.randomUUID(),
                      name: 'Novo especialista',
                      instructions:
                        'Execute a subtarefa e retorne conclusões, evidências e pendências.',
                      provider: 'claude',
                      model: '',
                      effort: 'medium',
                      enabled: false,
                      tools: 'read'
                    }
                  ]
                })
              }
            >
              <Plus size={14} /> Adicionar subagente
            </button>
          </div>
          {!draft.agents.length && (
            <div className="flow-empty">
              <GitBranch size={24} />
              <strong>Sua equipe começa aqui</strong>
              <p>Adicione um especialista ou preencha o exemplo e ajuste os modelos.</p>
            </div>
          )}
          {draft.agents.map((a, index) => (
            <section className="flow-card" key={a.id} aria-label={`Subagente ${index + 1}`}>
              <div className="flow-card-heading">
                <span className="flow-number">{String(index + 1).padStart(2, '0')}</span>
                <label className="flow-agent-name">
                  Nome
                  <input
                    aria-label={`Nome do subagente ${index + 1}`}
                    maxLength={80}
                    value={a.name}
                    onChange={(e) => agentPatch(a.id, { name: e.target.value })}
                  />
                </label>
                <label className="flow-check">
                  <input
                    type="checkbox"
                    checked={a.enabled}
                    onChange={(e) => agentPatch(a.id, { enabled: e.target.checked })}
                  />{' '}
                  Ativo
                </label>
                <button
                  type="button"
                  className="flow-delete"
                  aria-label={`Remover ${a.name}`}
                  onClick={() =>
                    patch({
                      agents: draft.agents.filter((item) => item.id !== a.id),
                      stages: draft.stages
                        .map((s) => ({
                          ...s,
                          agentIds: s.agentIds.filter((id) => id !== a.id),
                          enabled: s.agentIds.filter((id) => id !== a.id).length ? s.enabled : false
                        }))
                        .filter((s) => s.agentIds.length)
                    })
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <ModelFields
                label={`do subagente ${index + 1}`}
                value={a}
                models={models}
                onChange={(value) => agentPatch(a.id, value)}
              />
              <label className="settings-field-label">
                Instruções e especialidade
                <textarea
                  aria-label={`Instruções do subagente ${index + 1}`}
                  rows={3}
                  maxLength={12000}
                  value={a.instructions}
                  onChange={(e) => agentPatch(a.id, { instructions: e.target.value })}
                />
              </label>
              <label className="settings-field-label">
                Acesso às ferramentas
                <select
                  aria-label={`Ferramentas do subagente ${index + 1}`}
                  value={a.tools}
                  onChange={(e) =>
                    agentPatch(a.id, { tools: e.target.value as FlowAgent['tools'] })
                  }
                >
                  <option value="none">Sem ferramentas · trabalhar com o contexto recebido</option>
                  <option value="read">Somente leitura · arquivos e ADT</option>
                  <option value="inherit">
                    Ferramentas da sessão · inclui alterações autorizadas
                  </option>
                </select>
              </label>
            </section>
          ))}
        </div>
        <div className="flow-editor-section" hidden={tab !== 'hooks'}>
          <div className="flow-section-heading">
            <div>
              <h3>
                Hooks <small>{draft.hooks.length}/20</small>
              </h3>
              <p>Ações internas executadas nos eventos que você escolher.</p>
            </div>
            <button
              type="button"
              className="settings-action"
              disabled={draft.hooks.length >= 20}
              onClick={() =>
                patch({
                  hooks: [
                    ...draft.hooks,
                    {
                      id: crypto.randomUUID(),
                      name: 'Registrar etapa',
                      enabled: true,
                      event: 'after_delegate',
                      action: 'checkpoint',
                      instructions: ''
                    }
                  ]
                })
              }
            >
              <Plus size={14} /> Adicionar hook
            </button>
          </div>
          <section className="flow-hook-library" aria-label="Hooks prontos">
            <div className="flow-hook-library-heading">
              <h4>Hooks prontos para usar</h4>
              <p>Adicione ao fluxo e personalize abaixo. As alterações precisam ser salvas.</p>
            </div>
            <div className="flow-hook-preset-grid">
              {FLOW_HOOK_PRESETS.map((preset) => {
                const added = draft.hooks.some((hook) => hook.id === `preset-${preset.id}`)
                return (
                  <article className="flow-hook-preset" key={preset.id}>
                    <span className="flow-hook-preset-event">{HOOK_EVENTS[preset.hook.event]}</span>
                    <h5>{preset.hook.name}</h5>
                    <p>{preset.description}</p>
                    {preset.hook.instructions && (
                      <details>
                        <summary>Ver instruções</summary>
                        <p>{preset.hook.instructions}</p>
                      </details>
                    )}
                    <button
                      type="button"
                      className="settings-action"
                      disabled={added || draft.hooks.length >= 20}
                      aria-label={`${added ? 'Adicionado' : 'Adicionar'}: ${preset.hook.name}`}
                      onClick={() => patch({ hooks: addFlowHookPreset(draft.hooks, preset.id) })}
                    >
                      {added ? <Check size={14} /> : <Plus size={14} />}
                      {added ? 'Adicionado' : 'Usar este hook'}
                    </button>
                  </article>
                )
              })}
            </div>
          </section>
          {!draft.hooks.length && (
            <div className="flow-empty compact">
              <p>
                Nenhum hook configurado. Escolha um hook pronto acima ou adicione um personalizado.
              </p>
            </div>
          )}
          {draft.hooks.map((h, index) => (
            <section className="flow-card" key={h.id} aria-label={`Hook ${index + 1}`}>
              <div className="flow-card-heading">
                <label className="flow-agent-name">
                  Nome
                  <input
                    aria-label={`Nome do hook ${index + 1}`}
                    maxLength={80}
                    value={h.name}
                    onChange={(e) => hookPatch(h.id, { name: e.target.value })}
                  />
                </label>
                <label className="flow-check">
                  <input
                    type="checkbox"
                    checked={h.enabled}
                    onChange={(e) => hookPatch(h.id, { enabled: e.target.checked })}
                  />{' '}
                  Ativo
                </label>
                <button
                  type="button"
                  className="flow-delete"
                  aria-label={`Remover hook ${h.name}`}
                  onClick={() => patch({ hooks: draft.hooks.filter((item) => item.id !== h.id) })}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="flow-model-fields">
                <label className="settings-field-label">
                  Quando
                  <select
                    aria-label={`Evento do hook ${index + 1}`}
                    value={h.event}
                    onChange={(e) =>
                      hookPatch(h.id, {
                        event: e.target.value as FlowHook['event'],
                        action: 'checkpoint'
                      })
                    }
                  >
                    {Object.entries(HOOK_EVENTS).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="settings-field-label">
                  Ação
                  <select
                    aria-label={`Ação do hook ${index + 1}`}
                    value={h.action}
                    onChange={(e) =>
                      hookPatch(h.id, { action: e.target.value as FlowHook['action'] })
                    }
                  >
                    {Object.entries(HOOK_ACTIONS)
                      .filter(
                        ([id]) =>
                          id === 'checkpoint' ||
                          (id === 'instructions' && h.event !== 'after_edit') ||
                          (id === 'syntax_check' && h.event === 'after_edit') ||
                          (id === 'require_evidence' && h.event === 'before_answer')
                      )
                      .map(([id, label]) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              {h.action === 'instructions' && (
                <label className="settings-field-label">
                  Instruções
                  <textarea
                    aria-label={`Instruções do hook ${index + 1}`}
                    rows={3}
                    maxLength={6000}
                    value={h.instructions}
                    onChange={(e) => hookPatch(h.id, { instructions: e.target.value })}
                  />
                </label>
              )}
              {h.action === 'require_evidence' && (
                <p className="settings-muted">
                  Exige ao menos uma leitura bem-sucedida de fonte, arquivo ou dados nesta execução.
                  Não verifica cada afirmação da resposta.
                </p>
              )}
              {h.action === 'syntax_check' && (
                <p className="settings-muted">
                  Exige a permissão Qualidade no ADT e confere a validação da fonte inativa após
                  salvar.
                </p>
              )}
            </section>
          ))}
        </div>
        <div className="flow-editor-section" hidden={tab !== 'limits'}>
          <div className="flow-section-heading">
            <div>
              <h3>Limites de execução</h3>
              <p>Defina o tamanho da equipe e a duração de cada execução.</p>
            </div>
          </div>
          <section className="flow-card flow-limits">
            {(
              [
                ['maxParallel', 'Subagentes em paralelo', 1, 4],
                ['maxDelegations', 'Delegações por execução', 1, 20],
                ['maxRounds', 'Rodadas por agente', 2, 64],
                ['maxOutputTokens', 'Tokens de saída por chamada', 1024, 32000],
                ['timeoutMinutes', 'Tempo máximo (minutos)', 1, 10]
              ] as const
            ).map(([field, label, min, max]) => (
              <label key={field} className="settings-field-label">
                {label}
                <input
                  type="number"
                  min={min}
                  max={max}
                  value={draft[field]}
                  onChange={(e) => patch({ [field]: Number(e.target.value) })}
                />
              </label>
            ))}
          </section>
        </div>
        <p className="settings-muted">
          Salvo nesta conta e neste computador. Cada participante usa sua própria chamada à API. O
          consumo aparece nas atividades do chat. Subagentes não criam outros subagentes.
        </p>
      </div>
      <footer className="flow-save-bar">
        <span role="status">
          {failure || error ? (
            <span className="mcp-error">{failure || error}</span>
          ) : notice ? (
            <>
              <Check size={14} /> {notice}
            </>
          ) : dirty ? (
            'Alterações não salvas'
          ) : (
            'Configuração salva'
          )}
        </span>
        <button
          type="button"
          className="settings-action"
          disabled={!dirty}
          onClick={() => {
            setDraft(structuredClone(config))
            onDraftChange?.(structuredClone(config))
            setFailure('')
            setNotice('')
          }}
        >
          Descartar
        </button>
        <button
          type="button"
          className="settings-action flow-save"
          disabled={!dirty || !userId || owner !== userId}
          onClick={() => {
            try {
              save(userId!, draft)
              setNotice('Configuração salva. Selecione o fluxo no chat para executar.')
              setFailure('')
            } catch (cause) {
              const value = cause as { issues?: { message: string }[]; message?: string }
              setFailure(value.issues?.[0]?.message ?? value.message ?? 'Não foi possível salvar.')
            }
          }}
        >
          Salvar configuração
        </button>
      </footer>
    </div>
  )
}
