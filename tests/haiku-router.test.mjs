import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-typescript.mjs'

const models = loadTs('src/renderer/src/lib/claudeModels.ts')
const agents = [{ id: 'abap', name: 'ABAP', description: 'Código ABAP' }]
const skills = Array.from({ length: 7 }, (_, i) => ({ id: 's' + i, name: 'Skill ' + i, description: 'Descrição' }))
const plain = value => JSON.parse(JSON.stringify(value))
const answer = payload => ({ stop_reason: 'end_turn', content: [
  { type: 'thinking', thinking: '{"agent_id":"wrong"}', signature: 'opaque' },
  { type: 'text', text: JSON.stringify(payload) }
] })
function fixture(data, { ok = true, reject = false } = {}) {
  const requests = []
  const api = loadTs('src/renderer/src/lib/aiClient.ts', {
    '@renderer/lib/supabaseClient': { supabase: {} },
    '@renderer/lib/claudeModels': models
  }, { fetch: async (url, request) => {
    requests.push({ url, headers: request.headers, body: JSON.parse(request.body) })
    if (reject) throw new Error('Network unavailable')
    return { ok, json: async () => data }
  } })
  return { api, requests }
}

test('both router paths read text after thinking and send supported low effort parameters', async () => {
  const f = fixture(answer({ agent_id: 'abap', skill_ids: ['s0'] }))
  assert.deepEqual(plain(await f.api.routeConversation('test-key', 'Criar relatório', agents, skills)), { agentId: 'abap', skillIds: ['s0'] })
  assert.deepEqual(plain(await f.api.routeSkills('test-key', 'Criar relatório', skills)), ['s0'])
  assert.equal(f.requests.length, 2)
  for (const { body, headers, url } of f.requests) {
    assert.equal(url, models.ANTHROPIC_API_URL)
    assert.equal(body.model, 'claude-haiku-5-5')
    assert.equal(body.output_config.effort, 'low')
    assert.equal(body.thinking.type, 'adaptive')
    assert.equal(body.max_tokens, 2048)
    assert.equal(body.messages.at(-1).role, 'user')
    assert.equal(headers['x-api-key'], 'test-key')
    assert.equal(headers['anthropic-beta'], undefined)
    for (const field of ['fallbacks', 'temperature', 'top_p', 'top_k']) assert.equal(body[field], undefined)
  }
})

test('unknown agents and skills are rejected, duplicate skills removed, selection capped at five', async () => {
  const f = fixture(answer({ agent_id: 'invented', skill_ids: ['unknown', 1, 's0', 's0', ...skills.map(s => s.id)] }))
  assert.deepEqual(plain(await f.api.routeConversation('key', 'pedido', agents, skills)), { agentId: null, skillIds: ['s0', 's1', 's2', 's3', 's4'] })
  assert.deepEqual(plain(await f.api.routeSkills('key', 'pedido', skills)), ['s0', 's1', 's2', 's3', 's4'])
})

test('refusal, truncation, malformed or empty responses and transport failures safely skip routing', async () => {
  const success = answer({ agent_id: 'abap', skill_ids: ['s0'] })
  const cases = [
    [{ ...success, stop_reason: 'refusal' }],
    [{ ...success, stop_reason: 'max_tokens' }],
    [{ stop_reason: 'end_turn', content: [{ type: 'thinking', signature: 'opaque' }] }],
    [{ stop_reason: 'end_turn', content: [{ type: 'text', text: '{bad' }] }],
    [answer(null)], [answer([])], [success, { ok: false }], [success, { reject: true }]
  ]
  for (const [data, options] of cases) {
    const f = fixture(data, options)
    assert.deepEqual(plain(await f.api.routeConversation('key', 'pedido', agents, skills)), { agentId: null, skillIds: [] })
    assert.deepEqual(plain(await f.api.routeSkills('key', 'pedido', skills)), [])
  }
})

test('empty catalogs do not make API requests', async () => {
  const f = fixture(null)
  assert.deepEqual(plain(await f.api.routeConversation('key', 'pedido', [], skills)), { agentId: null, skillIds: [] })
  assert.deepEqual(plain(await f.api.routeSkills('key', 'pedido', [])), [])
  assert.equal(f.requests.length, 0)
})

test('Haiku 5.5 supports effort without inheriting Opus and Sonnet server-side fallback', () => {
  assert.equal(models.claudeGeneration('claude-haiku-5-5'), 'haiku-5-5')
  const params = models.claudeModelParams('claude-haiku-5-5', { effort: 'high', showThinking: true, maxTokens: 300, thinkingMaxTokens: 16000 })
  assert.equal(params.output_config.effort, 'high')
  assert.equal(params.thinking.display, 'summarized')
  assert.equal(params.fallbacks, undefined)
  assert.equal(models.claudeToolLoopParams('claude-haiku-5-5', 300).max_tokens, 16000)
  assert.equal(models.claudeGeneration('claude-haiku-4-5-20251001'), 'legacy')
  assert.equal(models.claudeModelParams('claude-haiku-4-5-20251001', { maxTokens: 300, thinkingMaxTokens: 16000 }).output_config, undefined)
  assert.equal(models.claudeModelParams('claude-sonnet-5-5', { maxTokens: 300, thinkingMaxTokens: 16000 }).fallbacks, 'default')
})
