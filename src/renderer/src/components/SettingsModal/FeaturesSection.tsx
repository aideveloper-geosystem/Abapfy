import { useEffect, useState } from 'react'
import { useAuthStore } from '@renderer/store/authStore'
import { useLocalFeaturesStore } from '@renderer/store/localFeaturesStore'
import { CompactionSettings } from '../CompactionSettings'
import './SettingsSections.css'
import './FeaturesSection.css'
export function FeaturesSection(): JSX.Element {
  const userId = useAuthStore((state) => state.user?.id)
  const { status, error, load, apply } = useLocalFeaturesStore()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => {
    if (userId) void load(userId)
  }, [userId, load])
  return (
    <div className="settings-section local-features">
      <header className="settings-section-header">
        <h2>Features</h2>
        <p>Personalize a compactação de contexto da sua conta.</p>
      </header>
      {(notice || error) && (
        <p role="alert" className="local-feature-notice">
          {notice || error}
        </p>
      )}
      {!status ? (
        <p>Carregando preferências…</p>
      ) : (
        <CompactionSettings
          value={status.settings.compaction}
          disabled={busy}
          onSave={async (value) => {
            if (!userId) return
            setBusy(true)
            setNotice(null)
            try {
              apply(userId, await window.api.localFeatures.setCompaction(userId, value))
            } catch (error) {
              setNotice((error as Error).message)
            } finally {
              setBusy(false)
            }
          }}
        />
      )}
    </div>
  )
}
