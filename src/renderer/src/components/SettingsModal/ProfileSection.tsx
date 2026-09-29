import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, CalendarDays, MessageSquareText, Sparkles } from 'lucide-react'
import { useAuthStore } from '@renderer/store/authStore'
import { useChatStore } from '@renderer/store/chatStore'
import { useUsageStore } from '@renderer/store/usageStore'
import { computeUsageStats, type UsagePeriod } from '@renderer/lib/usage'
import { formatCount, formatTokenCount } from '@renderer/lib/format'
import './ProfileSection.css'

const PERIODS: { id: UsagePeriod; label: string }[] = [
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: 'all', label: 'Todo o período' }
]

function heatLevel(count: number): number {
  if (count === 0) return 0
  if (count <= 2) return 1
  if (count <= 5) return 2
  if (count <= 10) return 3
  return 4
}

export function ProfileSection(): JSX.Element {
  const [period, setPeriod] = useState<UsagePeriod>('all')
  const chatLoadStarted = useRef(false)
  const { user, profile, role } = useAuthStore((state) => ({ user: state.user, profile: state.profile, role: state.role }))
  const { chats, messages, loaded, loading, load } = useUsageStore((state) => ({
    chats: state.chats, messages: state.messages, loaded: state.loaded, loading: state.loading, load: state.load
  }))
  const { recentChats, chatsLoaded, loadChats } = useChatStore((state) => ({
    recentChats: state.recentChats, chatsLoaded: state.loaded, loadChats: state.load
  }))

  useEffect(() => {
    if (!loaded && !loading) void load()
    if (!chatsLoaded && !chatLoadStarted.current) {
      chatLoadStarted.current = true
      void loadChats()
    }
  }, [loaded, loading, load, chatsLoaded, loadChats])

  const stats = useMemo(() => computeUsageStats(chats, messages, period), [chats, messages, period])
  const displayName = profile?.nome?.trim() || user?.email?.split('@')[0] || 'Usuário'
  const initials = displayName.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
  const heatmapWeeks = Array.from({ length: stats.heatmap.length / 7 }, (_, index) => stats.heatmap.slice(index * 7, index * 7 + 7))
  const recent = recentChats.filter((chat) => chat.userId === user?.id).slice(0, 5)

  return (
    <div className="settings-profile">
      <header className="settings-profile-heading">
        <span className="settings-eyebrow">Sua conta</span>
        <h2>Perfil</h2>
        <p>Um resumo da sua atividade e dos modelos usados no Abapfy.</p>
      </header>

      <section className="settings-profile-hero" aria-label="Dados do perfil">
        <div className="settings-profile-avatar" aria-hidden="true">{initials || 'U'}</div>
        <div className="settings-profile-identity">
          <h3>{displayName}</h3>
          <span>{user?.email}</span>
          <div className="settings-profile-badges">
            {role && <span>{role}</span>}
            {profile?.cargo && <span>{profile.cargo}</span>}
            {profile?.empresa && <span>{profile.empresa}</span>}
          </div>
        </div>
      </section>

      <div className="settings-profile-section-heading">
        <div><span className="settings-eyebrow">Visão geral</span><h3>Status de uso</h3></div>
        <div className="settings-profile-period" aria-label="Período das métricas">
          {PERIODS.map((item) => <button key={item.id} type="button" className={period === item.id ? 'active' : ''} aria-pressed={period === item.id} onClick={() => setPeriod(item.id)}>{item.label}</button>)}
        </div>
      </div>
      <div className="settings-profile-metrics">
        <div><strong>{loaded ? formatTokenCount(stats.totalTokens) : '—'}</strong><span>Tokens registrados</span></div>
        <div><strong>{loaded ? formatCount(stats.sessions) : '—'}</strong><span>Chats com atividade</span></div>
        <div><strong>{loaded ? formatCount(stats.messages) : '—'}</strong><span>Mensagens</span></div>
        <div><strong>{loaded ? `${stats.currentStreak} dias` : '—'}</strong><span>Sequência atual</span></div>
        <div><strong>{loaded ? `${stats.longestStreak} dias` : '—'}</strong><span>Maior sequência</span></div>
      </div>
      <p className="settings-profile-note">Tokens correspondem aos registros de uso disponíveis nas conversas. O gráfico mostra mensagens por dia.</p>

      <section className="settings-profile-activity" aria-label="Atividade recente">
        <div className="settings-profile-section-heading"><div><span className="settings-eyebrow">Ritmo de trabalho</span><h3>Atividade recente</h3></div><Activity size={18} aria-hidden="true" /></div>
        <div className="settings-profile-heatmap" role="img" aria-label="Atividade diária de mensagens nas últimas 15 semanas">
          {heatmapWeeks.map((week, weekIndex) => <div className="settings-profile-heatmap-week" key={weekIndex}>
            {week.map((day) => <span key={day.date} className={`settings-profile-heat-${heatLevel(day.count)}`} title={`${new Date(`${day.date}T12:00:00`).toLocaleDateString('pt-BR')}: ${day.count} mensagens`} />)}
          </div>)}
        </div>
        <div className="settings-profile-heatmap-legend"><span>Menos atividade</span><i /><i className="settings-profile-heat-1" /><i className="settings-profile-heat-2" /><i className="settings-profile-heat-3" /><i className="settings-profile-heat-4" /><span>Mais atividade</span></div>
      </section>

      <div className="settings-profile-bottom">
        <section className="settings-profile-panel">
          <div className="settings-profile-panel-title"><MessageSquareText size={17} /><h3>Chats recentes</h3></div>
          {recent.length ? <ul>{recent.map((chat) => <li key={chat.id}><span title={chat.title}>{chat.title}</span><time dateTime={chat.updatedAt}>{new Date(chat.updatedAt).toLocaleDateString('pt-BR')}</time></li>)}</ul> : <p>Nenhuma conversa recente.</p>}
        </section>
        <section className="settings-profile-panel">
          <div className="settings-profile-panel-title"><Sparkles size={17} /><h3>Modelos mais usados</h3></div>
          {stats.modelBreakdown.length ? <ul>{stats.modelBreakdown.slice(0, 5).map((model) => <li key={model.model}><span title={model.model}>{model.model}</span><span>{formatCount(model.messages)} mensagens</span></li>)}</ul> : <p>Nenhum modelo registrado neste período.</p>}
        </section>
      </div>
      <div className="settings-profile-footer"><CalendarDays size={15} /><span>Dados da conta conectada, atualizados a partir das conversas salvas.</span></div>
    </div>
  )
}
