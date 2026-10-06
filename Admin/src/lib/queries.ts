import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { buildPricingIndex, estimateCostUsd, type ModelPricingRow } from '@/lib/pricing'

const WINDOW_DAYS = 90

function daysAgoIso(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(0, 0, 0, 0)
  return date.toISOString()
}

export async function getPricingRows(): Promise<ModelPricingRow[]> {
  const supabase = createSupabaseAdminClient()
  const { data } = await supabase
    .from('model_pricing')
    .select('*')
    .order('provider', { ascending: true })
    .order('label', { ascending: true })
  return (data ?? []) as ModelPricingRow[]
}

interface ChatRow {
  id: string
  user_id: string
  model: string | null
  provider: string | null
}

interface AssistantMessageRow {
  id: string
  chat_id: string
  tokens_input: number | null
  tokens_output: number | null
  created_at: string
}

/** Carrega chats + mensagens do assistente dos últimos WINDOW_DAYS — base pra todo cálculo de uso/custo do dashboard. */
async function loadRecentActivity(): Promise<{ chats: ChatRow[]; messages: AssistantMessageRow[] }> {
  const supabase = createSupabaseAdminClient()
  const cutoff = daysAgoIso(WINDOW_DAYS)

  const [{ data: chats }, { data: messages }] = await Promise.all([
    supabase.from('chats').select('id, user_id, model, provider').gte('updated_at', cutoff),
    supabase
      .from('chat_messages')
      .select('id, chat_id, tokens_input, tokens_output, created_at')
      .eq('role', 'assistant')
      .gte('created_at', cutoff)
  ])

  return { chats: (chats ?? []) as ChatRow[], messages: (messages ?? []) as AssistantMessageRow[] }
}

export interface OverviewStats {
  totalUsers: number
  totalChats: number
  totalMessages90d: number
  totalTokensInput90d: number
  totalTokensOutput90d: number
  estimatedCostUsd90d: number
  unpricedMessages90d: number
  activeUsers7d: number
  activeUsers30d: number
  requestsPerDay: { date: string; requests: number }[]
  tokensPerDay: { date: string; input: number; output: number }[]
  modelBreakdown: { model: string; provider: string; messages: number; tokens: number; costUsd: number }[]
  topUsers: { userId: string; nome: string; messages: number; tokens: number; costUsd: number }[]
}

export async function getOverviewStats(): Promise<OverviewStats> {
  const supabase = createSupabaseAdminClient()
  const [{ count: totalUsers }, { count: totalChats }, pricingRows, { chats, messages }] =
    await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('chats').select('id', { count: 'exact', head: true }),
      getPricingRows(),
      loadRecentActivity()
    ])

  const pricing = buildPricingIndex(pricingRows)
  const chatById = new Map(chats.map((chat) => [chat.id, chat]))

  const requestsByDay = new Map<string, number>()
  const tokensByDay = new Map<string, { input: number; output: number }>()
  const modelStats = new Map<string, { provider: string; messages: number; tokens: number; costUsd: number }>()
  const userStats = new Map<string, { messages: number; tokens: number; costUsd: number }>()
  const activeUsers7d = new Set<string>()
  const activeUsers30d = new Set<string>()

  let totalTokensInput = 0
  let totalTokensOutput = 0
  let estimatedCostUsd = 0
  let unpricedMessages = 0

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000

  for (const message of messages) {
    const chat = chatById.get(message.chat_id)
    const tokensIn = message.tokens_input ?? 0
    const tokensOut = message.tokens_output ?? 0
    totalTokensInput += tokensIn
    totalTokensOutput += tokensOut

    const dayKey = message.created_at.slice(0, 10)
    requestsByDay.set(dayKey, (requestsByDay.get(dayKey) ?? 0) + 1)
    const dayTokens = tokensByDay.get(dayKey) ?? { input: 0, output: 0 }
    dayTokens.input += tokensIn
    dayTokens.output += tokensOut
    tokensByDay.set(dayKey, dayTokens)

    const messageTime = new Date(message.created_at).getTime()
    if (chat) {
      if (messageTime >= sevenDaysAgo) activeUsers7d.add(chat.user_id)
      if (messageTime >= thirtyDaysAgo) activeUsers30d.add(chat.user_id)
    }

    const cost = chat ? estimateCostUsd(chat.model, tokensIn, tokensOut, pricing) : null
    if (cost === null) unpricedMessages += 1
    else estimatedCostUsd += cost

    if (chat?.model) {
      const key = chat.model
      const entry = modelStats.get(key) ?? { provider: chat.provider ?? 'desconhecido', messages: 0, tokens: 0, costUsd: 0 }
      entry.messages += 1
      entry.tokens += tokensIn + tokensOut
      entry.costUsd += cost ?? 0
      modelStats.set(key, entry)
    }

    if (chat) {
      const entry = userStats.get(chat.user_id) ?? { messages: 0, tokens: 0, costUsd: 0 }
      entry.messages += 1
      entry.tokens += tokensIn + tokensOut
      entry.costUsd += cost ?? 0
      userStats.set(chat.user_id, entry)
    }
  }

  const topUserIds = [...userStats.entries()]
    .sort((a, b) => b[1].tokens - a[1].tokens)
    .slice(0, 8)
    .map(([id]) => id)

  const { data: topProfiles } = topUserIds.length
    ? await supabase.from('profiles').select('id, nome').in('id', topUserIds)
    : { data: [] as { id: string; nome: string }[] }
  const nameById = new Map((topProfiles ?? []).map((p) => [p.id, p.nome]))

  const requestsPerDay = [...requestsByDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, requests]) => ({ date, requests }))

  const tokensPerDay = [...tokensByDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, tokens]) => ({ date, ...tokens }))

  const modelBreakdown = [...modelStats.entries()]
    .map(([model, stats]) => ({ model, ...stats }))
    .sort((a, b) => b.tokens - a.tokens)

  const topUsers = topUserIds.map((id) => ({
    userId: id,
    nome: nameById.get(id) ?? '(sem nome)',
    ...userStats.get(id)!
  }))

  return {
    totalUsers: totalUsers ?? 0,
    totalChats: totalChats ?? 0,
    totalMessages90d: messages.length,
    totalTokensInput90d: totalTokensInput,
    totalTokensOutput90d: totalTokensOutput,
    estimatedCostUsd90d: estimatedCostUsd,
    unpricedMessages90d: unpricedMessages,
    activeUsers7d: activeUsers7d.size,
    activeUsers30d: activeUsers30d.size,
    requestsPerDay,
    tokensPerDay,
    modelBreakdown,
    topUsers
  }
}

export interface UserUsageRow {
  id: string
  nome: string
  cargo: string | null
  empresa: string | null
  createdAt: string
  chats: number
  messages: number
  tokens: number
  costUsd: number
  lastActiveAt: string | null
  providersConfigured: string[]
}

export async function getUsersWithUsage(): Promise<UserUsageRow[]> {
  const supabase = createSupabaseAdminClient()
  const [{ data: profiles }, { data: keys }, pricingRows, { chats, messages }] = await Promise.all([
    supabase.from('profiles').select('id, nome, cargo, empresa, created_at').order('created_at', { ascending: false }),
    supabase.from('ai_api_keys').select('user_id, provider'),
    getPricingRows(),
    loadRecentActivity()
  ])

  const pricing = buildPricingIndex(pricingRows)
  const chatById = new Map(chats.map((chat) => [chat.id, chat]))
  const providersByUser = new Map<string, string[]>()
  ;(keys ?? []).forEach((row) => {
    const list = providersByUser.get(row.user_id) ?? []
    list.push(row.provider)
    providersByUser.set(row.user_id, list)
  })

  const chatsByUser = new Map<string, number>()
  chats.forEach((chat) => chatsByUser.set(chat.user_id, (chatsByUser.get(chat.user_id) ?? 0) + 1))

  const usageByUser = new Map<string, { messages: number; tokens: number; costUsd: number; lastActiveAt: string | null }>()
  for (const message of messages) {
    const chat = chatById.get(message.chat_id)
    if (!chat) continue
    const tokensIn = message.tokens_input ?? 0
    const tokensOut = message.tokens_output ?? 0
    const cost = estimateCostUsd(chat.model, tokensIn, tokensOut, pricing) ?? 0
    const entry = usageByUser.get(chat.user_id) ?? { messages: 0, tokens: 0, costUsd: 0, lastActiveAt: null }
    entry.messages += 1
    entry.tokens += tokensIn + tokensOut
    entry.costUsd += cost
    if (!entry.lastActiveAt || message.created_at > entry.lastActiveAt) entry.lastActiveAt = message.created_at
    usageByUser.set(chat.user_id, entry)
  }

  return (profiles ?? []).map((profile) => {
    const usage = usageByUser.get(profile.id)
    return {
      id: profile.id,
      nome: profile.nome,
      cargo: profile.cargo,
      empresa: profile.empresa,
      createdAt: profile.created_at,
      chats: chatsByUser.get(profile.id) ?? 0,
      messages: usage?.messages ?? 0,
      tokens: usage?.tokens ?? 0,
      costUsd: usage?.costUsd ?? 0,
      lastActiveAt: usage?.lastActiveAt ?? null,
      providersConfigured: providersByUser.get(profile.id) ?? []
    }
  })
}
