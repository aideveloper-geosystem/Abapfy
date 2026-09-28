import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { TitleBar } from '@renderer/components/TitleBar'
import { McpConfirmationBanner } from '@renderer/components/McpConfirmationBanner'
import { SplashScreen } from '@renderer/screens/SplashScreen'
import { AuthScreen } from '@renderer/screens/AuthScreen'
import { PasswordRecoveryScreen } from '@renderer/screens/PasswordRecoveryScreen'
import { HomeScreen } from '@renderer/screens/HomeScreen'
import { useAuthStore } from '@renderer/store/authStore'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { useSkillsStore } from '@renderer/store/skillsStore'
import { useAgentsStore } from '@renderer/store/agentsStore'
import { useChatStore } from '@renderer/store/chatStore'
import { useUsageStore } from '@renderer/store/usageStore'
import { useMcpStore } from '@renderer/store/mcpStore'
import { useTasksStore } from '@renderer/store/tasksStore'
import { useClientsStore } from '@renderer/store/clientsStore'

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
    resetClients
  ])

  return (
    <div className="app-shell">
      <TitleBar />
      <McpConfirmationBanner />
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
                <HomeScreen />
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
