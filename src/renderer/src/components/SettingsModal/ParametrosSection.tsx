import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
  useEstimativaParametrosStore,
  type ClienteParametro,
  type EstimativaParametro
} from '@renderer/store/estimativaParametrosStore'
import { useAuthStore } from '@renderer/store/authStore'
import './ParametrosSection.css'

type Tab = 'clientes' | 'estimativas'

const CLIENTE_FIELDS: { key: keyof Omit<ClienteParametro, 'id' | 'empresa'>; label: string }[] = [
  { key: 'levantamento', label: 'Levantamento' },
  { key: 'implProposal', label: 'Impl. Proposta' },
  { key: 'espFunc', label: 'Esp. Funcional' },
  { key: 'espTec', label: 'Esp. Técnica' },
  { key: 'codific', label: 'Codificação' },
  { key: 'traducaoEn', label: 'Tradução EN' },
  { key: 'traducaoEs', label: 'Tradução ES' },
  { key: 'testeUnitario', label: 'Teste Unitário' },
  { key: 'testeQas', label: 'Teste QAS' },
  { key: 'bppPt', label: 'BPP PT' },
  { key: 'bppEn', label: 'BPP EN' },
  { key: 'bppEs', label: 'BPP ES' },
  { key: 'testeVolume', label: 'Teste Volume' },
  { key: 'homologacao', label: 'Homologação' },
  { key: 'accessControl', label: 'Access Control' },
  { key: 'homologacao2', label: 'Homologação 2' },
  { key: 'goLive', label: 'Go Live' },
  { key: 'documentacao', label: 'Documentação' },
  { key: 'gerencia', label: 'Gerência' }
]

const TIPOS = [
  'RFC',
  'Inbound',
  'Outbound',
  'On-Line',
  'Formulário',
  'Relatórios',
  'Tabela',
  'Workflow',
  'Ampliação'
]
const OBJETOS = ['Novo', 'Alteração']
const COMPLEXIDADES = ['Muito Baixa', 'Baixa', 'Media', 'Alta', 'Muito Alta']

function ClienteCard({
  cliente,
  onSave,
  onDelete
}: {
  cliente: ClienteParametro
  onSave: (patch: Partial<ClienteParametro>) => void
  onDelete: () => void
}): JSX.Element {
  const canEdit = useAuthStore((s) => s.role === 'ADMIN' || s.role === 'MASTER')
  const [draft, setDraft] = useState(cliente)

  useEffect(() => setDraft(cliente), [cliente])

  return (
    <div className="parametros-cliente-card">
      <header className="parametros-cliente-header">
        <input
          readOnly={!canEdit}
          className="parametros-cliente-name"
          value={draft.empresa}
          onChange={(event) => setDraft({ ...draft, empresa: event.target.value })}
          onBlur={() => canEdit && draft.empresa.trim() && onSave({ empresa: draft.empresa.trim() })}
        />
        <button disabled={!canEdit} type="button" className="parametros-icon-btn" onClick={onDelete} title="Remover cliente">
          <Trash2 size={14} strokeWidth={1.75} />
        </button>
      </header>
      <div className="parametros-cliente-grid">
        {CLIENTE_FIELDS.map(({ key, label }) => (
          <label key={key} className="parametros-field">
            <span>{label}</span>
            <input
              readOnly={!canEdit}
              type="number"
              step="0.01"
              value={draft[key]}
              onChange={(event) =>
                setDraft({ ...draft, [key]: Number(event.target.value) } as ClienteParametro)
              }
              onBlur={() => canEdit && onSave({ [key]: draft[key] } as Partial<ClienteParametro>)}
            />
          </label>
        ))}
      </div>
    </div>
  )
}

function ClientesTab(): JSX.Element {
  const canEdit = useAuthStore((s) => s.role === 'ADMIN' || s.role === 'MASTER')
  const { clientes, upsertCliente, deleteCliente } = useEstimativaParametrosStore((state) => ({
    clientes: state.clientes,
    upsertCliente: state.upsertCliente,
    deleteCliente: state.deleteCliente
  }))

  function handleAdd(): void {
    upsertCliente({
      empresa: 'Novo Cliente',
      levantamento: 1,
      espFunc: 1,
      espTec: 1,
      codific: 1,
      testeUnitario: 1,
      testeQas: 1,
      accessControl: 1,
      homologacao2: 1,
      goLive: 1,
      documentacao: 1,
      gerencia: 1
    })
  }

  return (
    <div className="parametros-list">
      {clientes.map((cliente) => (
        <ClienteCard
          key={cliente.id}
          cliente={cliente}
          onSave={(patch) => upsertCliente({ ...cliente, ...patch })}
          onDelete={() => deleteCliente(cliente.id)}
        />
      ))}
      <button disabled={!canEdit} type="button" className="parametros-add-btn" onClick={handleAdd}>
        <Plus size={14} strokeWidth={2} />
        Adicionar cliente
      </button>
    </div>
  )
}

function EstimativasTab(): JSX.Element {
  const { estimativas, upsertEstimativa, deleteEstimativa } = useEstimativaParametrosStore(
    (state) => ({
      estimativas: state.estimativas,
      upsertEstimativa: state.upsertEstimativa,
      deleteEstimativa: state.deleteEstimativa
    })
  )
  const [drafts, setDrafts] = useState<Record<string, EstimativaParametro>>({})

  useEffect(() => {
    setDrafts(Object.fromEntries(estimativas.map((item) => [item.id, item])))
  }, [estimativas])

  function updateDraft(id: string, patch: Partial<EstimativaParametro>): void {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  function handleAdd(): void {
    upsertEstimativa({
      tipo: TIPOS[0],
      objeto: OBJETOS[0],
      complexidade: COMPLEXIDADES[0],
      analiseEf: 0,
      espec: 0,
      codific: 0,
      testes: 0
    })
  }

  return (
    <div className="parametros-table-wrap">
      <table className="parametros-table">
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Objeto</th>
            <th>Complexidade</th>
            <th>Análise EF</th>
            <th>Espec.</th>
            <th>Codific.</th>
            <th>Testes</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {estimativas.map((item) => {
            const draft = drafts[item.id] ?? item
            const save = (patch: Partial<EstimativaParametro>): void => {
              void upsertEstimativa({ ...draft, ...patch })
            }
            return (
              <tr key={item.id}>
                <td>
                  <select
                    value={draft.tipo}
                    onChange={(event) => {
                      updateDraft(item.id, { tipo: event.target.value })
                      save({ tipo: event.target.value })
                    }}
                  >
                    {TIPOS.map((tipo) => (
                      <option key={tipo} value={tipo}>
                        {tipo}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    value={draft.objeto}
                    onChange={(event) => {
                      updateDraft(item.id, { objeto: event.target.value })
                      save({ objeto: event.target.value })
                    }}
                  >
                    {OBJETOS.map((objeto) => (
                      <option key={objeto} value={objeto}>
                        {objeto}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    value={draft.complexidade}
                    onChange={(event) => {
                      updateDraft(item.id, { complexidade: event.target.value })
                      save({ complexidade: event.target.value })
                    }}
                  >
                    {COMPLEXIDADES.map((complexidade) => (
                      <option key={complexidade} value={complexidade}>
                        {complexidade}
                      </option>
                    ))}
                  </select>
                </td>
                {(['analiseEf', 'espec', 'codific', 'testes'] as const).map((field) => (
                  <td key={field}>
                    <input
                      type="number"
                      step="0.5"
                      className="parametros-table-input"
                      value={draft[field]}
                      onChange={(event) => updateDraft(item.id, { [field]: Number(event.target.value) })}
                      onBlur={() => save({ [field]: draft[field] })}
                    />
                  </td>
                ))}
                <td>
                  <button
                    type="button"
                    className="parametros-icon-btn"
                    onClick={() => deleteEstimativa(item.id)}
                    title="Remover"
                  >
                    <Trash2 size={13} strokeWidth={1.75} />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <button type="button" className="parametros-add-btn" onClick={handleAdd}>
        <Plus size={14} strokeWidth={2} />
        Adicionar combinação
      </button>
    </div>
  )
}

export function ParametrosSection(): JSX.Element {
  const [tab, setTab] = useState<Tab>('clientes')
  const { loaded, load, error } = useEstimativaParametrosStore((state) => ({
    error: state.error,
    loaded: state.loaded,
    load: state.load
  }))

  useEffect(() => {
    if (!loaded) load()
  }, [loaded, load])

  return (
    <div className="settings-section parametros-section">
      <header className="settings-section-header">
        <h2>Parâmetros</h2>
        <p>
          Fatores de produtividade por cliente e horas-base por tipo/objeto/complexidade,
          consultados em tempo real pelo agente Estimador de Esforço ABAP.
        </p>
      </header>

      {error && <p role="alert">{error}</p>}
      <div className="parametros-tabs">
        <button
          type="button"
          className={`parametros-tab ${tab === 'clientes' ? 'parametros-tab-active' : ''}`}
          onClick={() => setTab('clientes')}
        >
          Clientes
        </button>
        <button
          type="button"
          className={`parametros-tab ${tab === 'estimativas' ? 'parametros-tab-active' : ''}`}
          onClick={() => setTab('estimativas')}
        >
          Estimativas
        </button>
      </div>

      {tab === 'clientes' && <p>Parâmetros compartilhados. Somente administradores e master podem editar.</p>}
      {tab === 'clientes' ? <ClientesTab /> : <EstimativasTab />}
    </div>
  )
}
