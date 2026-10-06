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
        if (active && status?.version !== 4) setControlAvailability('O controle SAP exige reiniciar o Abapfy para carregar a ponte atualizada.')
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
        ? `Contexto SAP salvo neste computador. Controle: ${saved.controlMode === 'off' ? 'desativado' : saved.controlMode === 'basic' ? 'Básico' : saved.controlMode === 'automatic' ? 'Automático' : 'Full'}.`
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
    <header className="settings-section-header"><h2>Computer use · SAP</h2><p>Escolha a janela e o modo de aprovação. O modelo principal conduz a navegação.</p></header>
    <div className="sap-context-explainer">
      <p>O Abapfy detecta janelas do processo SAP GUI neste Windows. Quando ativado, captura apenas a janela escolhida a cada mensagem e envia a imagem ao provedor de IA selecionado.</p>
      <p>O controle funciona por capturas de tela, cliques e teclas do Windows, sem depender de SAP GUI Scripting. A imagem pode conter dados visíveis na tela. Use a prévia para conferir a janela antes de conversar.</p>
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
        <p>O agente pode clicar, digitar até 4.000 caracteres por ação e usar teclas básicas na janela escolhida. Cada ação é verificada contra o processo e a janela selecionados. A execução só ocorre com a janela SAP em primeiro plano. A nova captura permite ao modelo conferir o resultado; entrada enviada não significa tarefa concluída.</p>
        <label htmlFor="sap-control-mode">Autorização de ações</label>
        <select id="sap-control-mode" className="ai-provider-input" value={settings.controlMode ?? 'off'} disabled={busy || !settings.sessionId || Boolean(controlAvailability)} onChange={(event) => void save({ ...settings, controlMode: event.target.value as SapGuiSettings['controlMode'] })}>
          <option value="off">Desativado — somente leitura</option>
          <option value="basic">Modo Básico — aprovar cada ação</option>
          <option value="automatic">Modo Automático — aprovar escritas e ações incertas</option>
          <option value="full">Modo Full — sem aprovação de ações</option>
        </select>
        {controlAvailability && <p role="status" className="sap-gui-diagnostic">{controlAvailability}</p>}
        <p>No Básico, cada clique, digitação ou tecla exige aprovação. No Automático, observar a tela e mover o foco com Tab seguem automaticamente; cliques, digitação e outras teclas exigem aprovação porque podem alterar dados. Prints não comprovam o efeito de um controle.</p>
        <p>No Full, nenhuma ação pede aprovação. Ao ativar, um alerta explica os riscos. Os limites da tarefa, a validação da janela e o botão de parar no chat continuam ativos.</p>
        {settings.controlMode === 'full' && <p className="sap-full-warning" role="status">Modo Full ativo: o agente pode alterar dados ou executar programas sem confirmação.</p>}
      </div>
      <div className="sap-context-explainer">
        <h3>Controle pelo modelo principal</h3>
        <p>O modelo selecionado no chat observa a tela, executa um passo e verifica o resultado antes de continuar. O histórico de ferramentas é preservado; apenas imagens antigas são removidas.</p>
        <p>Os cliques usam pixels da captura atual. Se a janela mudar de posição ou tamanho antes da ação, o controle para e exige uma nova captura.</p>
        <p>Digitação e execução com efeito incerto não são repetidas automaticamente. Até 24 entradas e 32 decisões por tarefa, com limite de dez minutos. Você pode parar pelo chat.</p>
      </div>
      {preview && <div className="sap-context-preview"><p>Prévia da janela escolhida · {preview.width} × {preview.height}</p><img src={preview.imageDataUrl} alt={`Captura da janela ${preview.window.title}`} /></div>}
    </>}
    {notice && <p role="status" className="sap-gui-notice">{notice}</p>}
  </div>
}
