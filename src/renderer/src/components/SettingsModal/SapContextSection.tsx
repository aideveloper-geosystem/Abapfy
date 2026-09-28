import { useEffect, useState } from 'react'
import { Camera, RefreshCw } from 'lucide-react'
import { useAuthStore } from '@renderer/store/authStore'
import type { SapGuiCapture, SapGuiScan, SapGuiSettings } from '../../../../preload/index.d'
import './SettingsSections.css'

const emptySettings: SapGuiSettings = { version: 1, enabled: false, sessionId: null, sessionIdentity: null, controlMode: 'off' }

export function SapContextSection(): JSX.Element {
  const userId = useAuthStore((state) => state.user?.id)
  const [settings, setSettings] = useState<SapGuiSettings>(emptySettings)
  const [scan, setScan] = useState<SapGuiScan | null>(null)
  const [preview, setPreview] = useState<SapGuiCapture | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [controlAvailability, setControlAvailability] = useState<string | null>(null)

  useEffect(() => {
    setSettings(emptySettings)
    setScan(null)
    setPreview(null)
    setNotice(null)
    setControlAvailability(null)
    if (!userId) return
    let active = true
    if (typeof window.api.sapGui.control !== 'function' || typeof window.api.sapGui.controlStatus !== 'function') {
      setControlAvailability('O controle SAP exige reiniciar o Abapfy para carregar a ponte atualizada.')
    } else {
      void window.api.sapGui.controlStatus().then((status) => {
        if (active && status?.version !== 2) setControlAvailability('O controle SAP exige reiniciar o Abapfy para carregar a ponte atualizada.')
      }).catch(() => {
        if (active) setControlAvailability('O controle SAP exige reiniciar o Abapfy para atualizar o processo principal.')
      })
    }
    void window.api.sapGui.readSettings(userId).then(async (value) => {
      if (!active) return
      setSettings(value)
      if (value.enabled) {
        const found = await window.api.sapGui.listSessions()
        if (active) setScan(found)
      }
    }).catch((error: Error) => { if (active) setNotice(error.message) })
    return () => { active = false }
  }, [userId])

  async function refresh(): Promise<void> {
    setBusy(true); setNotice(null); setPreview(null)
    try {
      const found = await window.api.sapGui.listSessions()
      setScan(found)
      setNotice(found.message)
    } catch (error) { setNotice((error as Error).message) }
    finally { setBusy(false) }
  }

  async function save(next: SapGuiSettings): Promise<void> {
    if (!userId) return
    setBusy(true); setNotice(null); setPreview(null)
    try {
      const saved = await window.api.sapGui.saveSettings(userId, next.enabled ? next : { ...next, controlMode: 'off' })
      setSettings(saved)
      setNotice(saved.enabled
        ? `Contexto SAP salvo neste computador. Controle: ${saved.controlMode === 'off' ? 'desativado' : saved.controlMode === 'ask' ? 'autorizar cada ação' : 'ações básicas permitidas'}.`
        : 'Captura visual e controle desativados.')
      if (saved.enabled && !scan) setScan(await window.api.sapGui.listSessions())
    } catch (error) { setNotice((error as Error).message) }
    finally { setBusy(false) }
  }

  async function capturePreview(): Promise<void> {
    if (!userId) return
    setBusy(true); setNotice(null)
    try { setPreview(await window.api.sapGui.snapshot(userId)) }
    catch (error) { setNotice((error as Error).message) }
    finally { setBusy(false) }
  }

  return <div className="settings-section sap-context-section">
    <header className="settings-section-header"><h2>Contexto SAP</h2><p>Escolha uma janela SAP GUI e controle a captura visual enviada ao agente.</p></header>
    <div className="sap-context-explainer">
      <p>O Abapfy detecta janelas do processo SAP GUI neste Windows. Quando ativado, captura apenas a janela escolhida a cada mensagem e envia a imagem ao provedor de IA selecionado.</p>
      <p>A imagem pode conter dados visíveis na tela. Use a prévia para conferir a janela antes de conversar.</p>
    </div>
    <label className="sap-gui-toggle"><input type="checkbox" checked={settings.enabled} disabled={busy || !userId} onChange={(event) => void save({ ...settings, enabled: event.target.checked })} /> Permitir contexto visual da janela SAP no chat</label>
    {settings.enabled && <>
      <div className="sap-gui-session-row">
        <select className="ai-provider-input" value={settings.sessionId ?? ''} disabled={busy} onChange={(event) => {
          const selected = scan?.windows.find((window) => window.id === event.target.value)
          void save({ ...settings, sessionId: selected?.id ?? null, sessionIdentity: selected ? String(selected.processId) : null, controlMode: 'off' })
        }}>
          <option value="">Escolha uma janela SAP GUI</option>
          {scan?.windows.map((window) => <option key={window.id} value={window.id}>{window.title} · {window.processName}</option>)}
        </select>
        <button type="button" className="ai-provider-save sap-gui-refresh" disabled={busy} onClick={() => void refresh()}><RefreshCw size={14} /> Atualizar</button>
      </div>
      {scan && <p className="sap-gui-diagnostic" role="status">{scan.message} Processos SAP GUI: {scan.processCount}.</p>}
      {settings.sessionId && !scan?.windows.some((window) => window.id === settings.sessionId) && <p>A janela salva não está disponível. Atualize e escolha outra janela.</p>}
      <button type="button" className="ai-provider-save sap-gui-refresh" disabled={busy || !settings.sessionId} onClick={() => void capturePreview()}><Camera size={14} /> Testar captura</button>
      <div className="sap-context-explainer">
        <h3>Controle da janela SAP</h3>
        <p>O agente pode clicar, digitar até 4.000 caracteres por ação e usar teclas básicas na janela escolhida. Cada ação é verificada contra o processo e a janela selecionados. A execução só ocorre com a janela SAP em primeiro plano. O resultado é conferido por nova captura.</p>
        <label htmlFor="sap-control-mode">Autorização de ações</label>
        <select id="sap-control-mode" className="ai-provider-input" value={settings.controlMode ?? 'off'} disabled={busy || !settings.sessionId || Boolean(controlAvailability)} onChange={(event) => void save({ ...settings, controlMode: event.target.value as SapGuiSettings['controlMode'] })}>
          <option value="off">Desativado — somente leitura</option>
          <option value="ask">Perguntar antes de cada ação</option>
          <option value="always">Permitir ações básicas automaticamente</option>
        </select>
        {controlAvailability && <p role="status" className="sap-gui-diagnostic">{controlAvailability}</p>}
        <p>No modo automático, Enter, texto com quebra de linha e cliques na parte superior da janela ainda exigem confirmação. Salvar ou executar programas não está disponível como comando direto; revise o resultado antes de usar essas funções.</p>
      </div>
      {preview && <div className="sap-context-preview"><p>Prévia da janela escolhida · {preview.width} × {preview.height}</p><img src={preview.imageDataUrl} alt={`Captura da janela ${preview.window.title}`} /></div>}
    </>}
    {notice && <p role="status" className="sap-gui-notice">{notice}</p>}
  </div>
}
