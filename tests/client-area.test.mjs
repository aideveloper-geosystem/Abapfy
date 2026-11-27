import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-typescript.mjs'

const { agentArea, areaModule, artifactDestination } = loadTs('src/renderer/src/lib/clientArea.ts')

const modules = [
  { id: 'dtec', clientId: 'c1', name: 'DTECs' },
  { id: 'ef', clientId: 'c1', name: 'EFs' },
  { id: 'prog', clientId: 'c1', name: 'Programas' },
  { id: 'int', clientId: 'c1', name: 'Integrações' },
  { id: 'other', clientId: 'c2', name: 'Geral' }
]
const plain = (value) => value && { module: value.module.id, folderId: value.folderId }

test('the session area follows the routed agent', () => {
  assert.equal(agentArea({ source: 'default', id: 'ef_consultant' }), 'ef')
  assert.equal(agentArea({ source: 'default', id: 'dtec_consultant' }), 'dtec')
  assert.equal(agentArea({ source: 'default', id: 'code_review' }), 'programs')
  assert.equal(agentArea({ source: 'user', id: 'ef_consultant' }), 'programs')
  assert.equal(agentArea(null), 'programs')
  assert.equal(areaModule(modules, 'c1', 'ef').id, 'ef')
  assert.equal(areaModule(modules, 'c1', 'programs').id, 'prog')
  assert.equal(areaModule(modules, 'c2', 'ef').id, 'other')
  assert.equal(areaModule(modules, 'unknown', 'ef'), null)
})

test('generated files are saved in their own area', () => {
  assert.deepEqual(plain(artifactDestination(modules, 'c1', 'programs', null)), { module: 'prog', folderId: null })
  assert.deepEqual(plain(artifactDestination(modules, 'c1', 'ef', null)), { module: 'ef', folderId: null })
  // a folder of the right area is respected
  assert.deepEqual(plain(artifactDestination(modules, 'c1', 'programs', { id: 'f1', moduleId: 'prog' })), { module: 'prog', folderId: 'f1' })
  assert.deepEqual(plain(artifactDestination(modules, 'c1', 'ef', { id: 'f2', moduleId: 'ef' })), { module: 'ef', folderId: 'f2' })
  // code never lands among EFs or DTECs, and an EF never lands among programs
  assert.deepEqual(plain(artifactDestination(modules, 'c1', 'programs', { id: 'f2', moduleId: 'ef' })), { module: 'prog', folderId: null })
  assert.deepEqual(plain(artifactDestination(modules, 'c1', 'ef', { id: 'f1', moduleId: 'prog' })), { module: 'ef', folderId: null })
  // custom areas keep the code of their folders
  assert.deepEqual(plain(artifactDestination(modules, 'c1', 'programs', { id: 'f3', moduleId: 'int' })), { module: 'int', folderId: 'f3' })
  // a folder of another client is ignored
  assert.deepEqual(plain(artifactDestination(modules, 'c1', 'programs', { id: 'f4', moduleId: 'other' })), { module: 'prog', folderId: null })
  assert.equal(artifactDestination(modules, 'unknown', 'programs', null), null)
})
