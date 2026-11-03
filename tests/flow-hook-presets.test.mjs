import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-typescript.mjs'

const { FLOW_HOOK_PRESETS: presets, addFlowHookPreset } = loadTs('src/shared/flowHookPresets.ts')
const { flowHookSchema, DEFAULT_ADVANCED_FLOW } = loadTs('src/shared/advancedFlow.ts')

test('ready hooks have unique identities, valid actions and do not enable anything by default', () => {
  assert.equal(presets.length, 8)
  assert.equal(new Set(presets.map((preset) => preset.id)).size, presets.length)
  assert.equal(DEFAULT_ADVANCED_FLOW.hooks.length, 0)
  assert.equal(DEFAULT_ADVANCED_FLOW.enabled, false)
  for (const preset of presets) {
    const [hook] = addFlowHookPreset([], preset.id)
    assert.equal(flowHookSchema.safeParse(hook).success, true)
    assert.ok(preset.description.length > 0)
  }
})

test('adding a ready hook copies it, preserves customizations and avoids duplicates', () => {
  const original = []
  const hooks = addFlowHookPreset(original, 'review-answer')
  hooks[0].name = 'Minha revisão'
  hooks[0].instructions = 'Instruções do cliente'
  hooks[0].enabled = false
  assert.equal(original.length, 0)
  const again = addFlowHookPreset(hooks, 'review-answer')
  assert.equal(again.length, 1)
  assert.equal(again[0].instructions, 'Instruções do cliente')
  assert.equal(again[0].enabled, false)
  const fresh = addFlowHookPreset([], 'review-answer')
  assert.equal(fresh[0].name, 'Revisar evidências e pendências')
  assert.notEqual(fresh[0].instructions, hooks[0].instructions)
  assert.equal(addFlowHookPreset([], 'review-answer').length, 1)
})

test('the catalog respects the hook limit and rejects nonexistent presets', () => {
  const hooks = Array.from({ length: 20 }, (_, index) => ({
    id: 'custom-' + index,
    name: 'Meu hook',
    enabled: false,
    event: 'after_delegate',
    action: 'checkpoint',
    instructions: ''
  }))
  assert.throws(() => addFlowHookPreset(hooks, 'record-worker'), /20 hooks/)
  assert.equal(hooks.length, 20)
  assert.throws(() => addFlowHookPreset([], 'nonexistent'), /não encontrado/)
})
