import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { TitleBar } from '@renderer/components/TitleBar'
import { McpConfirmationBanner } from '@renderer/components/McpConfirmationBanner'
import { UpdateToast } from '@renderer/components/UpdateToast'
import { SplashScreen } from '@renderer/screens/SplashScreen'
import { AuthScreen } from '@renderer/screens/AuthScreen'
import { PasswordRecoveryScreen } from '@renderer/screens/PasswordRecoveryScreen'
import { HomeScreen } from '@renderer/screens/HomeScreen'
import { WorkspaceGateScreen } from '@renderer/screens/WorkspaceGateScreen'
import { useAuthStore } from '@renderer/store/authStore'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { useSkillsStore } from '@renderer/store/skillsStore'
import { useAgentsStore } from '@renderer/store/agentsStore'
import { useChatStore } from '@renderer/store/chatStore'
import { useUsageStore } from '@renderer/store/usageStore'
import { useMcpStore } from '@renderer/store/mcpStore'
import { useEstimativaParametrosStore } from '@renderer/store/estimativaParametrosStore'
import { useTasksStore } from '@renderer/store/tasksStore'
import { useClientsStore } from '@renderer/store/clientsStore'
import { useWorkspaceStore } from '@renderer/store/workspaceStore'

function App(): JSX.Element {
  const init = useAuthStore((state) => state.init)
  const status = useAuthStore((state) => state.status)
  const { loadSettings, resetSettings } = useSettingsStore((state) => ({
    loadSettings: state.load,
    resetSettings: state.reset
  }))
  const { loadSkills, resetSkills } = useSkillsStore((state) => ({
    loadSkills: state.load,
    resetSkills: state.reset
  }))
  const { loadAgents, resetAgents } = useAgentsStore((state) => ({
    loadAgents: state.load,
    resetAgents: state.reset
  }))
  const { loadChats, resetChats } = useChatStore((state) => ({
    loadChats: state.load,
    resetChats: state.reset
  }))
  const resetUsage = useUsageStore((state) => state.reset)
  const resetClients = useClientsStore((state) => state.reset)
  const { loadWorkspace, resetWorkspace, workspaceStatus, hasWorkspace, workspaceLegacy } = useWorkspaceStore((state) => ({
    loadWorkspace: state.load,
    resetWorkspace: state.reset,
    workspaceStatus: state.status,
    hasWorkspace: state.workspace !== null,
    workspaceLegacy: state.legacy
  }))
  const { loadMcp, resetMcp } = useMcpStore((state) => ({
    loadMcp: state.load,
    resetMcp: state.reset
  }))
  const { loadTasks, resetTasks } = useTasksStore((state) => ({
    loadTasks: state.load,
    resetTasks: state.reset
  }))

  useEffect(() => {
    init()
  }, [init])

  useEffect(() => {
    if (status === 'authenticated') {
      void loadWorkspace()
      loadSettings()
      loadSkills()
      loadAgents()
      loadChats()
      loadMcp()
      loadTasks()
    } else if (status === 'unauthenticated') {
      void window.api.mcp.closeAll()
      resetSettings()
      resetSkills()
      resetAgents()
      resetChats()
      resetUsage()
      resetMcp()
      resetTasks()
      resetClients()
      resetWorkspace()
      useEstimativaParametrosStore.getState().reset()
    }
  }, [
    status,
    loadSettings,
    resetSettings,
    loadSkills,
    resetSkills,
    loadAgents,
    resetAgents,
    loadChats,
    resetChats,
    resetUsage,
    loadMcp,
    resetMcp,
    loadTasks,
    resetTasks,
    resetClients,
    loadWorkspace,
    resetWorkspace
  ])

  // Signed-in users must belong to a workspace (create one or get approved) before using the app.
  // Before migration 041 (legacy schema) the gate is skipped so the app keeps working.
  const needsWorkspace = workspaceStatus === 'ready' && !workspaceLegacy && !hasWorkspace
  const workspaceLoading = workspaceStatus === 'idle' || workspaceStatus === 'loading'

  return (
    <div className="app-shell">
      <TitleBar />
      <McpConfirmationBanner />
      <UpdateToast />
      <div className="app-content">
        <Routes>
          <Route path="/" element={<SplashScreen />} />
          <Route
            path="/auth"
            element={status === 'authenticated' ? <Navigate to="/dashboard" replace /> : <AuthScreen />}
          />
          <Route path="/reset-password" element={<PasswordRecoveryScreen />} />
          <Route
            path="/dashboard"
            element={
              status === 'authenticated' ? (
                needsWorkspace ? (
                  <WorkspaceGateScreen />
                ) : workspaceLoading ? (
                  <div className="app-loading" role="status" aria-label="Carregando workspace" />
                ) : (
                  <HomeScreen />
                )
              ) : (
                <Navigate to={status === 'unauthenticated' ? '/auth' : '/'} replace />
              )
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  )
}

export default App
