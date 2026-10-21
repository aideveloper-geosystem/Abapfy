import { useEffect, useState } from 'react'
import { Plus, Save, Trash2, PlugZap } from 'lucide-react'
import { useAuthStore } from '@renderer/store/authStore'
import { useAgentsStore } from '@renderer/store/agentsStore'
import { supabase } from '@renderer/lib/supabaseClient'
import {
  sapAdtConnectionSchema,
  type SapAdtConnection,
  type SapAdtConnectionView
} from '../../../../shared/sapAdt'
import { McpSection } from './McpSection'
import './SettingsSections.css'
import './IntegrationsSection.css'

function newConnection(): SapAdtConnection {
  return {
    id: crypto.randomUUID(),
    name: '',
    baseUrl: '',
    username: '',
    client: '100',
    language: 'PT',
    environment: 'development',
    enabled: false,
    allowHttp: false,
    allowSource: true,
    allowTables: true,
    allowWrite: false,
    allowCreate: false,
    allowActivate: false,
    allowQuality: false,
    allowTransports: false,
    allowTransportRelease: false,
    allowDebug: false,
    maxRows: 20,
    tables: [],
    agents: [],
    caCertificate: ''
  }
}
async function token(): Promise<string> {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) throw new Error('Entre novamente para configurar as integrações.')
  return data.session.access_token
}
function message(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(
    /^Error invoking remote method '[^']+': (?:Error: )?/,
    ''
  )
}

export function IntegrationsSection(): JSX.Element {
  const [tab, setTab] = useState<'sap' | 'mcp'>('sap')
  const userId = useAuthStore((state) => state.user?.id)
  return (
    <div className="integrations-container">
      <div className="integration-tabs" role="tablist" aria-label="Tipo de integração">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'sap'}
          onClick={() => setTab('sap')}
        >
          SAP · ADT
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'mcp'}
          onClick={() => setTab('mcp')}
        >
          Servidores MCP
        </button>
      </div>
      {tab === 'sap' ? <SapAdtSection key={userId} /> : <McpSection />}
    </div>
  )
}
function SapAdtSection(): JSX.Element {
  const { user } = useAuthStore()
  const agents = useAgentsStore((s) => s.agents)
  const [connections, setConnections] = useState<SapAdtConnectionView[]>([])
  const [draft, setDraft] = useState<SapAdtConnection | null>(null)
  const [password, setPassword] = useState('')
  const [tables, setTables] = useState('')
  const [busy, setBusy] = useState(true)
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    setConnections([])
    setDraft(null)
    setPassword('')
    setNotice('')
    setBusy(true)
    if (!window.api.sapAdt) {
      setNotice('Reinicie o Abapfy para carregar a integração SAP ADT.')
      setFailed(true)
      setBusy(false)
      return
    }
    void token()
      .then((t) => window.api.sapAdt.list(t))
      .then((rows) => {
        if (active) setConnections(rows)
      })
      .catch((error) => {
        if (active) {
          setNotice(message(error))
          setFailed(true)
        }
      })
      .finally(() => {
        if (active) setBusy(false)
      })
    return () => {
      active = false
    }
  }, [user?.id])
  function select(row: SapAdtConnectionView): void {
    const { hasPassword: _password, ...value } = row
    setDraft(value)
    setTables(value.tables.join(', '))
    setPassword('')
    setNotice(_password ? '' : 'Informe a senha SAP antes de testar a conexão.')
  }
  async function action(fn: (t: string) => Promise<void>): Promise<void> {
    setBusy(true)
    setNotice('')
    setFailed(false)
    try {
      await fn(await token())
    } catch (error) {
      setNotice(message(error))
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  async function save(): Promise<void> {
    if (!draft) return
    const parsed = sapAdtConnectionSchema.safeParse({
      ...draft,
      tables: tables.split(/[,;\s]+/).filter(Boolean)
    })
    if (!parsed.success) {
      setFailed(true)
      setNotice(
        parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(' · ')
      )
      return
    }
    await action(async (t) => {
      const rows = await window.api.sapAdt.save(t, parsed.data, password || undefined)
      setConnections(rows)
      const row = rows.find((r) => r.id === draft.id)
      if (row) select(row)
      setNotice(
        'Conexão e permissões salvas neste computador. Use Testar conexão para verificar o SAP.'
      )
    })
  }
  const update = (patch: Partial<SapAdtConnection>): void => {
    setDraft((current) => (current ? { ...current, ...patch } : current))
    setNotice('')
  }
  const saved = connections.find((row) => row.id === draft?.id)
  return (
    <div className="settings-section settings-section-mcp sap-adt-section">
      <header className="settings-section-header">
        <h2>Integrações · SAP</h2>
        <p>Acesso direto por ADT para os agentes, sem depender do VS Code.</p>
      </header>
      <div className="sap-context-explainer">
        <p>
          Cadastre o servidor SAP com /sap/bc/adt ativo e acesso pela rede ou VPN. Configure
          leitura, edição, criação, ativação, qualidade, requests e debug para os agentes
          autorizados.
        </p>
        <p>
          As conexões pertencem à sua conta neste computador. A senha fica protegida pelo cofre do
          sistema. Código e registros consultados podem ser enviados ao provedor de IA da conversa.
          Selecione a conexão no campo <strong>Ambiente SAP</strong> do chat quando precisar do
          acesso. Cada mensagem utiliza somente a conexão selecionada.
        </p>
      </div>
      <div className="mcp-card-actions">
        <button
          type="button"
          className="settings-action"
          disabled={busy}
          onClick={() => {
            setDraft(newConnection())
            setTables('')
            setPassword('')
            setNotice('')
          }}
        >
          <Plus size={14} /> Nova conexão
        </button>
      </div>
      {!busy && !connections.length && (
        <p className="settings-muted">Nenhuma conexão SAP cadastrada nesta conta e computador.</p>
      )}
      <div className="sap-adt-connections">
        {connections.map((row) => (
          <button
            type="button"
            disabled={busy}
            key={row.id}
            aria-pressed={draft?.id === row.id}
            onClick={() => select(row)}
          >
            <strong>{row.name}</strong>
            <span>
              {row.client} ·{' '}
              {row.environment === 'production'
                ? 'Produção'
                : row.environment === 'quality'
                  ? 'Qualidade'
                  : 'Desenvolvimento'}{' '}
              · {row.enabled ? 'Habilitada' : 'Desativada'}
            </span>
          </button>
        ))}
      </div>
      {draft && (
        <form
          className="sap-adt-form"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <fieldset disabled={busy}>
            <legend>Conexão SAP</legend>
            <div className="sap-adt-grid">
              <label>
                Nome
                <input
                  value={draft.name}
                  onChange={(e) => update({ name: e.target.value })}
                  placeholder="SAP Desenvolvimento"
                  maxLength={80}
                />
              </label>
              <label>
                Ambiente
                <select
                  value={draft.environment}
                  onChange={(e) =>
                    update({ environment: e.target.value as SapAdtConnection['environment'] })
                  }
                >
                  <option value="development">Desenvolvimento</option>
                  <option value="quality">Qualidade</option>
                  <option value="production">Produção</option>
                </select>
              </label>
              <label className="sap-adt-full">
                URL do servidor
                <input
                  type="url"
                  value={draft.baseUrl}
                  onChange={(e) => update({ baseUrl: e.target.value })}
                  placeholder="https://sap.empresa.com:44300"
                  maxLength={2048}
                />
              </label>
              <label>
                Usuário SAP
                <input
                  value={draft.username}
                  autoComplete="off"
                  onChange={(e) => update({ username: e.target.value })}
                  maxLength={100}
                />
              </label>
              <label>
                Mandante
                <input
                  value={draft.client}
                  inputMode="numeric"
                  onChange={(e) => update({ client: e.target.value })}
                  maxLength={3}
                />
              </label>
              <label>
                Idioma
                <input
                  value={draft.language}
                  onChange={(e) => update({ language: e.target.value.toUpperCase() })}
                  maxLength={2}
                />
              </label>
            </div>
            <label className="sap-adt-check">
              <input
                type="checkbox"
                checked={draft.allowHttp}
                onChange={(e) => update({ allowHttp: e.target.checked })}
              />{' '}
              Permitir HTTP sem criptografia para este servidor
            </label>
            <details>
              <summary>Certificado da empresa</summary>
              <label>
                CA adicional em formato PEM
                <textarea
                  rows={4}
                  value={draft.caCertificate}
                  onChange={(e) => update({ caCertificate: e.target.value })}
                  placeholder="-----BEGIN CERTIFICATE-----"
                  maxLength={64000}
                />
              </label>
            </details>
          </fieldset>
          <label>
            Senha SAP
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={
                saved?.hasPassword
                  ? 'Senha protegida já cadastrada; deixe vazio para manter'
                  : 'Informe sua senha SAP'
              }
              maxLength={2000}
            />
          </label>
          <fieldset disabled={busy}>
            <legend>Permissões dos agentes</legend>
            <label className="sap-adt-check">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) => update({ enabled: e.target.checked })}
              />{' '}
              Habilitar esta conexão para os agentes selecionados
            </label>
            <label className="sap-adt-check">
              <input
                type="checkbox"
                checked={draft.allowSource}
                onChange={(e) => update({ allowSource: e.target.checked })}
              />{' '}
              Permitir leitura de código ABAP ativo
            </label>
            <label className="sap-adt-check">
              <input
                type="checkbox"
                checked={draft.allowTables}
                onChange={(e) => update({ allowTables: e.target.checked })}
              />{' '}
              Permitir consulta de tabelas com aprovação a cada chamada
            </label>
            {draft.allowTables && (
              <div className="sap-adt-grid">
                <label>
                  Restringir tabelas (opcional)
                  <input
                    value={tables}
                    onChange={(e) => setTables(e.target.value)}
                    placeholder="Vazio = qualquer tabela autorizada pelo SAP"
                  />
                  <span className="settings-muted">
                    Deixe vazio para permitir qualquer tabela solicitada. Para restringir, informe
                    nomes exatos separados por vírgula.
                  </span>
                </label>
                <label>
                  Máximo de registros
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={draft.maxRows}
                    onChange={(e) => update({ maxRows: Number(e.target.value) })}
                  />
                </label>
              </div>
            )}
            <div className="sap-adt-advanced-permissions">
              <h4>Ferramentas de desenvolvimento</h4>
              {(
                [
                  ['allowQuality', 'Estrutura, where-used, sintaxe, ABAP Unit e ATC'],
                  ['allowWrite', 'Editar fonte ABAP sob lock, com revisão e verificação'],
                  ['allowCreate', 'Criar objetos ABAP em pacote e request aprovados'],
                  ['allowActivate', 'Ativar objetos (altera a versão executável)'],
                  ['allowTransports', 'Consultar e gerenciar requests e tarefas'],
                  [
                    'allowTransportRelease',
                    'Liberar requests e tarefas (exige gerenciamento de requests)'
                  ],
                  ['allowDebug', 'Debugger interativo do próprio usuário SAP']
                ] as const
              ).map(([field, description]) => (
                <label className="sap-adt-check" key={field}>
                  <input
                    type="checkbox"
                    checked={Boolean(draft[field])}
                    onChange={(event) => update({ [field]: event.target.checked })}
                  />
                  {description}
                </label>
              ))}
              <p className="settings-muted">
                As novas permissões começam desativadas. Escrita e ativação exigem leitura da versão
                correspondente e aprovação específica. Debug pode pausar e continuar programas; ao
                parar ou expirar, tenta desanexar e limpar seus breakpoints. A classificação de
                ambiente é informada pelo administrador.
              </p>
            </div>
            <div className="mcp-agent-grid">
              {agents
                .filter((agent) => agent.enabled)
                .map((agent) => {
                  const checked = draft.agents.some(
                    (item) => item.source === agent.source && item.id === agent.id
                  )
                  return (
                    <label className="mcp-agent-option" key={`${agent.source}:${agent.id}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          update({
                            agents: checked
                              ? draft.agents.filter(
                                  (item) => !(item.source === agent.source && item.id === agent.id)
                                )
                              : [...draft.agents, { source: agent.source, id: agent.id }]
                          })
                        }
                      />
                      {agent.name}
                    </label>
                  )
                })}
            </div>
            {!draft.agents.length && (
              <p className="settings-muted">
                Selecione pelo menos um agente para disponibilizar as ferramentas.
              </p>
            )}
          </fieldset>
          <div className="mcp-card-actions">
            <button type="submit" className="settings-action" disabled={busy}>
              <Save size={14} /> Salvar conexão
            </button>
            {saved && (
              <button
                type="button"
                className="settings-action"
                disabled={busy}
                onClick={() =>
                  void action(async (t) => {
                    const result = await window.api.sapAdt.test(t, saved.id)
                    setNotice(result.message)
                  })
                }
              >
                <PlugZap size={14} /> Testar conexão salva
              </button>
            )}
            {saved && (
              <button
                type="button"
                className="settings-action"
                disabled={busy}
                onClick={() =>
                  void action(async (t) => {
                    const result = await window.api.sapAdt.stopDebug(t, saved.id)
                    setNotice(
                      result.stopped
                        ? 'Debugger encerrado; sessão e breakpoints desta conexão foram limpos.'
                        : result.warnings.join(' ')
                    )
                  })
                }
              >
                Encerrar debug desta conexão
              </button>
            )}
            {saved && (
              <button
                type="button"
                className="settings-action"
                disabled={busy}
                onClick={() =>
                  void action(async (t) => {
                    setConnections(await window.api.sapAdt.remove(t, saved.id))
                    setDraft(null)
                    setPassword('')
                    setNotice('Conexão removida deste computador.')
                  })
                }
              >
                <Trash2 size={14} /> Remover
              </button>
            )}
          </div>
          {saved && (
            <p className="settings-muted">
              O teste usa os dados salvos. Salve as alterações antes de testar.
            </p>
          )}
        </form>
      )}
      {busy && <p role="status">Processando integração…</p>}
      {notice && (
        <p
          role={failed ? 'alert' : 'status'}
          className={failed ? 'mcp-error' : 'sap-adt-notice'}
        >
          {notice}
        </p>
      )}
    </div>
  )
}
