import test from 'node:test'
import assert from 'node:assert/strict'
import { TextDecoder, TextEncoder } from 'node:util'
import { loadTs } from './load-typescript.mjs'
const recovery = loadTs('src/renderer/src/lib/providerRecovery.ts')
const models = loadTs('src/renderer/src/lib/claudeModels.ts')
const signal = () => new AbortController().signal
const fast = {
  ...recovery,
  recoverProvider: (fn, opts) => recovery.recoverProvider(fn, { ...opts, wait: async () => {} })
}
const assemble = loadTs(
  'src/renderer/src/lib/claudeMessage.ts',
  { './providerRecovery': fast },
  { TextDecoder }
)
const event = (value) => `event: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`
const stream = (values) =>
  new Response(values.map(event).join(''), { headers: { 'content-type': 'text/event-stream' } })
const complete = (text) => [
  {
    type: 'message_start',
    message: { usage: { input_tokens: 10, cache_read_input_tokens: 20, output_tokens: 0 } }
  },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 8 } },
  { type: 'message_stop' }
]

test('transient HTTP failures recover at the request checkpoint and honor Retry-After without replaying tools', async () => {
  let calls = 0
  const waits = [],
    events = []
  const value = await recovery.providerJson(
    async () =>
      ++calls === 1
        ? new Response(
            JSON.stringify({ error: { type: 'overloaded_error', message: 'Overloaded' } }),
            { status: 529, headers: { 'retry-after': '12' } }
          )
        : Response.json({ ok: true }),
    'Claude',
    { signal: signal(), wait: async (ms) => waits.push(ms), onRetry: (e) => events.push(e) }
  )
  assert.equal(value.ok, true)
  assert.equal(calls, 2)
  assert.deepEqual(waits, [12000])
  assert.equal(events[0].recovered, false)
  assert.equal(events.at(-1).recovered, true)
})

test('authentication, invalid requests and account quota failures do not enter automatic retries', async () => {
  for (const [status, type] of [
    [401, 'authentication_error'],
    [400, 'invalid_request_error'],
    [429, 'insufficient_quota']
  ]) {
    let calls = 0
    await assert.rejects(
      recovery.providerJson(
        async () => {
          calls++
          return new Response(JSON.stringify({ error: { type, message: 'Request denied' } }), {
            status
          })
        },
        'Provider',
        {
          signal: signal(),
          wait: async () => {
            throw Error('should not wait')
          }
        }
      )
    )
    assert.equal(calls, 1)
  }
})

test('retry exhaustion is bounded and stop cancels the retry wait immediately', async () => {
  let calls = 0
  await assert.rejects(
    recovery.recoverProvider(
      async () => {
        calls++
        throw new recovery.ProviderRequestError('busy', 529)
      },
      { signal: signal(), maxRetries: 2, wait: async () => {} }
    ),
    /busy/
  )
  assert.equal(calls, 3)
  const controller = new AbortController()
  const waiting = recovery.waitForProvider(10000, controller.signal)
  controller.abort()
  await assert.rejects(waiting, /abort/i)
  let retryCalls = 0
  const stopped = new AbortController()
  await assert.rejects(
    recovery.recoverProvider(
      async () => {
        retryCalls++
        throw new recovery.ProviderRequestError('busy', 529)
      },
      { signal: stopped.signal, onRetry: () => stopped.abort(), wait: recovery.waitForProvider }
    ),
    /abort/i
  )
  assert.equal(retryCalls, 1)
})

test('HTTP 200 SSE overloaded_error is retried; signed thinking, tool inputs and token usage survive assembly', async () => {
  let calls = 0
  const events = [],
    usage = []
  const blocks = [
    { type: 'message_start', message: { usage: { input_tokens: 7, cache_read_input_tokens: 3 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
    {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'thinking_delta', thinking: 'Conferindo a fonte' }
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'signature_delta', signature: 'signed-state' }
    },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'content_block_start',
      index: 1,
      content_block: { type: 'tool_use', id: 'tool-1', name: 'workspace_read_file', input: {} }
    },
    {
      type: 'content_block_delta',
      index: 1,
      delta: { type: 'input_json_delta', partial_json: '{"fileId":"á😀"}' }
    },
    { type: 'content_block_stop', index: 1 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 12 } },
    { type: 'message_stop' }
  ]
  const result = await assemble.claudeMessage(
    async () =>
      ++calls === 1
        ? stream([{ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }])
        : stream(blocks),
    {
      signal: signal(),
      onRetry: (e) => events.push(e),
      onUsage: (input, output) => usage.push([input, output])
    }
  )
  assert.equal(calls, 2)
  assert.equal(result.content[0].signature, 'signed-state')
  assert.equal(result.content[1].input.fileId, 'á😀')
  assert.equal(result.stop_reason, 'tool_use')
  assert.deepEqual(usage.at(-1), [10, 12])
  assert.equal(events.at(-1).recovered, true)
})

test('unexpected EOF retries instead of accepting an incomplete answer; incomplete max-token tool calls remain unexecuted data', async () => {
  let calls = 0
  const value = await assemble.claudeMessage(
    async () =>
      ++calls === 1 ? stream(complete('partial').slice(0, -1)) : stream(complete('Final á😀')),
    { signal: signal() }
  )
  assert.equal(calls, 2)
  assert.equal(value.content[0].text, 'Final á😀')
  const partial = await assemble.claudeMessage(
    async () =>
      stream([
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', id: 't', name: 'edit_source', input: {} }
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: '{"objectPath":' }
        },
        {
          type: 'message_delta',
          delta: { stop_reason: 'max_tokens' },
          usage: { output_tokens: 3 }
        },
        { type: 'message_stop' }
      ]),
    { signal: signal() }
  )
  assert.equal(partial.incompleteTool, true)
  assert.equal(partial.stop_reason, 'max_tokens')
})

test('ordinary answer streaming resumes after Overloaded without duplicating visible output', async () => {
  const requests = [],
    out = [],
    retries = []
  let count = 0
  const api = loadTs(
    'src/renderer/src/lib/aiClient.ts',
    {
      '@renderer/lib/supabaseClient': { supabase: {} },
      '@renderer/lib/claudeModels': models,
      './providerRecovery': fast
    },
    {
      TextDecoder,
      fetch: async (_url, init) => {
        requests.push(JSON.parse(init.body))
        return ++count === 1
          ? stream([
              ...complete('Olá').slice(0, 3),
              { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }
            ])
          : stream(complete(' mundo'))
      }
    }
  )
  await api.streamChat({
    provider: 'claude',
    model: 'claude-sonnet-4-6',
    apiKey: 'not-sent-in-logs',
    messages: [{ role: 'user', content: 'Responda.' }],
    signal: signal(),
    onDelta: (text) => out.push(text),
    onRetry: (e) => retries.push(e)
  })
  assert.equal(out.join(''), 'Olá mundo')
  assert.equal(requests.length, 2)
  assert.equal(requests[1].messages[1].content, 'Olá')
  assert.equal(retries.at(-1).recovered, true)
})

test('network failures resume the model request without treating ordinary application errors as transient', async () => {
  let calls = 0
  const result = await recovery.recoverProvider(
    async () => {
      if (++calls === 1) throw new TypeError('fetch failed')
      return 'ok'
    },
    { signal: signal(), wait: async () => {} }
  )
  assert.equal(result, 'ok')
  assert.equal(calls, 2)
  assert.equal(recovery.transientProviderError(new Error('invalid arguments')), false)
})
