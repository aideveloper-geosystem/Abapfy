import { useEffect, useState } from 'react'
import { Database, Loader2 } from 'lucide-react'
import { supabase } from '@renderer/lib/supabaseClient'
import { useAuthStore } from '@renderer/store/authStore'
import type { LocalFeatureStatus } from '../../../../shared/localFeatures'
import './FeaturesSection.css'

export function CatalogAdministration(): JSX.Element {
  const { user, role } = useAuthStore()
  const [status, setStatus] = useState<LocalFeatureStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => {
    if (!user || (role !== 'MASTER' && role !== 'ADMIN')) return
    let active = true
    const refresh = (): void => {
      void window.api.localFeatures
        .status(user.id)
        .then((value) => {
          if (active) setStatus(value)
        })
        .catch((error: Error) => {
          if (active) setNotice(error.message)
        })
    }
    refresh()
    const timer = setInterval(refresh, 2500)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [user, role])
  if (!user || (role !== 'MASTER' && role !== 'ADMIN')) return <></>
  async function action(operation: (token: string) => Promise<unknown>): Promise<void> {
    if (!user || busy) return
    setBusy(true)
    setNotice(null)
    try {
      const { data } = await supabase.auth.getSession()
      if (data.session?.user.id !== user.id || !data.session.access_token)
        throw new Error('Entre novamente na conta administrativa.')
      const result = await operation(data.session.access_token)
      if (result && typeof result === 'object' && 'directory' in result)
        setNotice(
          `Pacote preparado em ${result.directory}. Arquivo: ${'archive' in result ? result.archive : ''}. SHA-256: ${'sha256' in result ? result.sha256 : ''}. Publique o arquivo para o fluxo de releases.`
        )
      setStatus(await window.api.localFeatures.status(user.id))
    } catch (error) {
      setNotice((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const locked = busy || Boolean(status?.indexing)
  return (
    <section className="local-features local-feature-card">
      <div className="local-feature-heading">
        <Database size={20} />
        <div>
          <h3>Embeddings · publicação do catálogo SAP</h3>
          <p>
            Importe e indexe uma vez. A atualização distribui a base, o índice e o modelo prontos
            para todos.
          </p>
        </div>
      </div>
      {notice && (
        <p role="status" className="local-feature-notice">
          {notice}
        </p>
      )}
      {!status && !notice && (
        <p className="local-feature-state">Carregando catálogo de embeddings…</p>
      )}
      {status && (
        <>
          <p className="local-feature-state">
            {status.catalogCount.toLocaleString('pt-BR')} objetos ·{' '}
            {status.indexedCount.toLocaleString('pt-BR')} indexados
          </p>
          {(['embeddingExecutable', 'embeddingModel', 'embeddingVulkanExecutable'] as const).map(
            (field) => (
              <div key={field} className="local-feature-file">
                <div>
                  <strong>
                    {
                      {
                        embeddingExecutable: 'Runtime CPU para distribuição',
                        embeddingModel: 'Modelo EmbeddingGemma 2 · GGUF',
                        embeddingVulkanExecutable: 'Runtime Vulkan opcional para indexação'
                      }[field]
                    }
                  </strong>
                  <span title={status.settings[field]}>
                    {status.settings[field] || 'Não configurado'}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() =>
                    void action((token) =>
                      window.api.localFeatures.pickRuntimeFile(user.id, field, token)
                    )
                  }
                >
                  Selecionar
                </button>
              </div>
            )
          )}
          <div className="local-feature-file">
            <strong>Processar indexação em</strong>
            <select
              aria-label="Processar indexação em"
              disabled={locked}
              value={status.settings.embeddingBackend}
              onChange={(event) =>
                void action((token) =>
                  window.api.localFeatures.setEmbeddingBackend(
                    user.id,
                    event.target.value as 'cpu' | 'vulkan',
                    token
                  )
                )
              }
            >
              <option value="cpu">CPU</option>
              <option value="vulkan">GPU Vulkan</option>
            </select>
          </div>
          <div className="local-feature-actions">
            <button
              type="button"
              disabled={locked}
              onClick={() =>
                void action((token) => window.api.localFeatures.importCatalog(user.id, token))
              }
            >
              Importar BASE_BADI
            </button>
            <button
              type="button"
              disabled={locked || !status.catalogCount || !status.embeddingReady}
              onClick={() =>
                void action((token) => window.api.localFeatures.indexCatalog(user.id, token))
              }
            >
              {status.indexing && <Loader2 size={14} className="context-spin" />}Indexar
            </button>
            {status.indexing && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void action((token) => window.api.localFeatures.cancelIndex(user.id, token))
                }
              >
                Interromper
              </button>
            )}
            <button
              type="button"
              disabled={
                locked || !status.catalogCount || status.indexedCount !== status.catalogCount
              }
              onClick={() =>
                void action((token) => window.api.localFeatures.publishCatalog(user.id, token))
              }
            >
              Preparar pacote da atualização
            </button>
          </div>
          {status.indexing && <progress max={status.catalogCount} value={status.indexedCount} />}
          {status.indexError && (
            <p role="alert" className="local-feature-notice">
              {status.indexError}
            </p>
          )}
        </>
      )}
      <p className="local-feature-hint">
        Os usuários recebem o pacote pelo instalador e pesquisam automaticamente, sem indexação ou
        configuração. O pacote inclui runtime CPU para funcionar sem GPU dedicada.
      </p>
    </section>
  )
}
