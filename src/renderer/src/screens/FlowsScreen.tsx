import { useEffect, useRef, useState } from 'react'
import { Copy, Plus, Search, Trash2, Workflow } from 'lucide-react'
import { useAuthStore } from '@renderer/store/authStore'
import { useAdvancedFlowStore } from '@renderer/store/advancedFlowStore'
import { DEFAULT_ADVANCED_FLOW, type AdvancedFlow } from '../../../shared/advancedFlow'
import { AdvancedFlowSection } from '@renderer/components/SettingsModal/AdvancedFlowSection'
import './FlowsScreen.css'

export function FlowsScreen(): JSX.Element {
  const drafts = useRef(new Map<string, AdvancedFlow>())
  const userId = useAuthStore((s) => s.user?.id)
  const {
    userId: owner,
    flows,
    selectedId,
    error,
    load,
    save,
    select,
    remove
  } = useAdvancedFlowStore()
  const [query, setQuery] = useState(''),
    [notice, setNotice] = useState(''),
    [deleting, setDeleting] = useState<string | null>(null)
  useEffect(() => {
    drafts.current.clear()
    if (userId) load(userId)
  }, [userId, load])
  const visible =
    owner === userId
      ? flows.filter((f) => f.config.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
      : []
  const act = (fn: () => void) => {
    try {
      fn()
      setNotice('')
    } catch (e) {
      setNotice((e as Error).message)
    }
  }
  return (
    <div className="flows-screen">
      <aside className="flows-library">
        <header>
          <span className="flows-library-icon">
            <Workflow size={22} />
          </span>
          <div>
            <h1>Fluxos</h1>
            <p>Equipes e automações de IA</p>
          </div>
        </header>
        <button
          className="settings-action flow-save"
          type="button"
          disabled={!userId || Boolean(error)}
          onClick={() =>
            act(() =>
              save(
                userId!,
                {
                  ...structuredClone(DEFAULT_ADVANCED_FLOW),
                  name: `Novo fluxo ${flows.length + 1}`
                },
                crypto.randomUUID()
              )
            )
          }
        >
          <Plus size={15} /> Novo fluxo
        </button>
        <label className="flows-search">
          <Search size={15} />
          <input
            aria-label="Pesquisar fluxos"
            placeholder="Pesquisar fluxos"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="flows-list">
          {visible.map((flow) => (
            <article key={flow.id} className={flow.id === selectedId ? 'is-selected' : ''}>
              <button
                className="flows-select"
                type="button"
                aria-pressed={flow.id === selectedId}
                onClick={() => act(() => select(userId!, flow.id))}
              >
                <Workflow size={16} />
                <span>
                  <strong>{flow.config.name}</strong>
                  <small>
                    {flow.config.agents.length} especialistas ·{' '}
                    {flow.config.stages.length
                      ? `${flow.config.stages.length} etapas`
                      : 'Delegação livre'}{' '}
                    · {flow.config.enabled ? 'Disponível' : 'Rascunho'}
                  </small>
                </span>
              </button>
              <div className="flows-row-actions">
                <button
                  type="button"
                  aria-label={`Duplicar ${flow.config.name}`}
                  onClick={() =>
                    act(() =>
                      save(
                        userId!,
                        {
                          ...structuredClone(flow.config),
                          name: `${flow.config.name.slice(0, 88)} · cópia`,
                          enabled: false
                        },
                        crypto.randomUUID()
                      )
                    )
                  }
                >
                  <Copy size={14} />
                </button>
                <button
                  type="button"
                  aria-label={`Excluir ${flow.config.name}`}
                  onClick={() => setDeleting(flow.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              {deleting === flow.id && (
                <div className="flows-delete-confirm">
                  <p>Excluir este fluxo salvo?</p>
                  <button
                    type="button"
                    onClick={() =>
                      act(() => {
                        remove(userId!, flow.id)
                        setDeleting(null)
                      })
                    }
                  >
                    Excluir
                  </button>
                  <button type="button" onClick={() => setDeleting(null)}>
                    Cancelar
                  </button>
                </div>
              )}
            </article>
          ))}
          {!visible.length && (
            <p className="flows-empty-list">
              {query ? 'Nenhum fluxo encontrado.' : 'Crie seu primeiro fluxo.'}
            </p>
          )}
        </div>
        <p className="flows-local-note">
          Biblioteca local desta conta e computador. Selecione o fluxo no chat para executar.
        </p>
      </aside>
      <main className="flows-editor">
        {(error || notice) && (
          <p role="alert" className="mcp-error">
            {error || notice}
          </p>
        )}
        {owner === userId && selectedId && flows.some((f) => f.id === selectedId) ? (
          <AdvancedFlowSection
            key={selectedId}
            initialDraft={drafts.current.get(selectedId)}
            onDraftChange={(draft) => drafts.current.set(selectedId, draft)}
          />
        ) : (
          <div className="flows-welcome">
            <Workflow size={40} />
            <h2>Um fluxo para cada trabalho</h2>
            <p>
              Monte equipes, organize etapas e escolha os hooks. Seus fluxos ficam disponíveis no
              seletor do chat.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
