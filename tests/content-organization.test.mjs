import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { loadTs } from './load-typescript.mjs'
const ownership = loadTs('src/renderer/src/lib/contentOwnership.ts')

test('ownership filters distinguish authors without inventing ownership for missing identities; search ignores accents', () => {
  assert.equal(ownership.matchesOwner('me', 'me', 'mine'), true)
  assert.equal(ownership.matchesOwner('other', 'me', 'mine'), false)
  assert.equal(ownership.matchesOwner(null, 'me', 'team'), false)
  assert.equal(ownership.matchesOwner(null, 'me', 'unknown'), true)
  assert.equal(ownership.matchesOwner('other', 'me', 'user:other'), true)
  assert.equal(ownership.creatorLabel(null, {}, 'me'), 'Autoria não informada')
  assert.equal(ownership.creatorLabel('other-user', {}, 'me'), 'Usuário other-us')
  assert.equal(ownership.matchesContent('JOAO transferencia', 'Transferência EWM', 'João Silva'), true)
  assert.equal(ownership.matchesContent('Maria', 'Transferência EWM', 'João Silva'), false)
})

function fixture() {
  let user = 'me', failure = null, gate = null
  const requests = []
  const rows = Array.from({ length: 101 }, (_, i) => ({ id: 'chat-' + String(i).padStart(3, '0'), title: 'Chat ' + i, user_id: i < 31 ? 'me' : 'other', module_id: 'module-1', client_id: 'client-1', project_id: null, archived: false, agent_name: 'ABAP', updated_at: new Date(Date.UTC(2026, 9, 21, 0, i)).toISOString() }))
  const supabase = { from(table) {
    const filters = [], orders = []
    let limit = Infinity, range = [0, Infinity]
    const query = {
      select() { return query }, eq(k,v) { filters.push(row => row[k] === v); return query }, neq(k,v) { filters.push(row => row[k] !== v); return query }, is(k,v) { filters.push(row => row[k] === v); return query },
      order(k, opts = {}) { orders.push([k, opts.ascending !== false]); return query }, limit(n) { limit = n; return query }, range(start,end) { range = [start,end]; return query },
      then(resolve,reject) { requests.push({ table, limit, range }); return (async () => { if (gate) await gate; const result = (table === 'chats' ? rows : []).filter(row => filters.every(fn => fn(row))).sort((a,b) => { for (const [key,asc] of orders) { const cmp = String(a[key]).localeCompare(String(b[key])); if(cmp) return asc ? cmp : -cmp } return 0 }).slice(range[0], range[1] === Infinity ? undefined : range[1] + 1).slice(0, limit); return { data: result, error: failure } })().then(resolve,reject) }
    }
    return query
  } }
  const module = loadTs('src/renderer/src/store/chatStore.ts', { '@renderer/lib/supabaseClient': { supabase }, '@renderer/store/authStore': { useAuthStore: { getState: () => ({ user: { id: user } }) } } })
  return { ...module, requests, rows, setUser: value => user = value, fail: value => failure = value, defer: value => gate = value }
}

test('sidebar loads separate recent budgets so newer team activity cannot push personal chats out', async () => {
  const f = fixture()
  await f.useChatStore.getState().load()
  const chats = f.useChatStore.getState().recentChats
  assert.equal(chats.filter(chat => chat.userId === 'me').length, 30)
  assert.equal(chats.filter(chat => chat.userId === 'other').length, 30)
  assert.equal(chats[0].userId, 'other')
  assert.equal(f.requests.filter(request => request.table === 'chats' && request.limit === 30).length, 2)
  f.fail({ message: 'RLS/network failed' })
  await f.useChatStore.getState().load()
  assert.equal(f.useChatStore.getState().recentChats.length, 60)
  assert.equal(f.useChatStore.getState().error, 'RLS/network failed')
})

test('client module paging includes older and project chats, enforces module/author scope and does not duplicate page boundary', async () => {
  const f = fixture()
  f.rows[100].project_id = 'project-1'
  const first = await f.loadModuleChatPage('client-1', 'module-1')
  const next = await f.loadModuleChatPage('client-1', 'module-1', 50)
  assert.equal(first.chats.length, 50)
  assert.equal(first.hasMore, true)
  assert.equal(first.chats[0].projectId, 'project-1')
  assert.equal(new Set([...first.chats, ...next.chats].map(chat => chat.id)).size, 100)
  const final = await f.loadModuleChatPage('client-1', 'module-1', 100)
  assert.equal(final.chats.length, 1)
  assert.equal(final.hasMore, false)
  assert.equal((await f.loadModuleChatPage('client-1','module-1',0,'mine')).chats.length,31)
  assert.equal((await f.loadModuleChatPage('client-1','module-1',0,'user:other')).chats.every(chat => chat.userId === 'other'),true)
  assert.equal((await f.loadModuleChatPage('client-1','wrong-module')).chats.length,0)
})

test('a switched account cannot install pending chat loads or receive the previous account page', async () => {
  const f = fixture()
  let release
  f.defer(new Promise(resolve => release = resolve))
  const loading = f.useChatStore.getState().load()
  const page = f.loadModuleChatPage('client-1', 'module-1')
  f.setUser('other')
  release()
  await loading
  await assert.rejects(page, /conta mudou/)
  assert.equal(f.useChatStore.getState().recentChats.length,0)
})

test('sidebar renders personal chats by default with real author/client metadata and accessible team controls', () => {
  const state = { recentChats: [{ id:'mine',title:'Meu código ABAP', userId:'me',clientId:'client-1',updatedAt:'2026-10-21T12:00:00Z' },{id:'team',title:'Código de outro usuário', userId:'other',clientId:'client-1',updatedAt:'2026-10-21T12:00:00Z'}], projects:[],projectChats:{},loaded:true,load:async()=>{} }
  const store = data => selector => selector ? selector(data) : data
  const { Sidebar } = loadTs('src/renderer/src/components/Sidebar.tsx', {
    'react-router-dom': { useNavigate:()=>()=>{} }, '@renderer/store/authStore': { useAuthStore:store({ user:{id:'me'},profile:{nome:'Paulo Oliveira'},signOut:async()=>{} }) },
    '@renderer/store/chatStore': { useChatStore:store(state) }, '@renderer/store/clientsStore': { useClientsStore:store({clients:[{id:'client-1',name:'Supergasbras'}]}) },
    '@renderer/store/chatRuntimeStore':{useChatRuntimeStore:store({runtimes:{}})}, '@renderer/lib/workPresence':{presenceLabel:()=>null}, '@renderer/components/UsageModal':{UsageModal:()=>null},
    '@renderer/lib/useAuthorNames':{useAuthorNames:()=>({me:'Paulo Oliveira',other:'Carlos Mota'})}, '@renderer/lib/contentOwnership':ownership, './Sidebar.css':{}
  })
  const html = renderToStaticMarkup(createElement(Sidebar,{workPresence:[],activeView:'chat',activeChatId:null}))
  assert.match(html,/Meu código ABAP/)
  assert.doesNotMatch(html,/Código de outro usuário/)
  assert.match(html.replace(/<[^>]*>/g, ''),/Você · Supergasbras/)
  assert.match(html,/Autoria dos chats recentes/)
  assert.match(html,/Meus chats/)
  assert.match(html,/Equipe/)
})
