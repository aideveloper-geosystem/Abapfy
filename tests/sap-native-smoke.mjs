import assert from 'node:assert/strict'
import { spawn as nativeSpawn } from 'node:child_process'
import { loadTs } from './load-typescript.mjs'

if (process.platform !== 'win32') throw new Error('Este smoke test requer Windows.')
const callbacks = []
let diagnostics = ''
let launches = 0
const { scanSapWindows } = loadTs('src/main/sapWindowContext.ts', {
  'node:child_process': { spawn: (...args) => {
    launches++;
    let child; try { child = nativeSpawn(...args) } catch (error) { diagnostics += error.message; throw error }
    child.on('error', (error) => { diagnostics += error.message });
    child.stderr.on('data', (data) => { diagnostics = (diagnostics + String(data)).slice(-4000) });
    return child;
  } },
  electron: { app: { on: (event, callback) => { if (event === 'before-quit') callbacks.push(callback) } } }
})
try {
  const firstStart = performance.now()
  const first = await scanSapWindows()
  const firstMs = performance.now() - firstStart
  const secondStart = performance.now()
  const second = await scanSapWindows()
  const secondMs = performance.now() - secondStart
  assert.ok(!first.message.startsWith('Não foi possível'), first.message + '\n' + diagnostics)
  assert.ok(!second.message.startsWith('Não foi possível'), second.message + '\n' + diagnostics)
  assert.equal(launches, 1, 'O auxiliar deve ser reutilizado')
  console.log(JSON.stringify({
    firstScanMs: Math.round(firstMs), secondScanMs: Math.round(secondMs),
    windowsFound: second.windows.length, sapProcessCount: second.processCount,
    helperLaunches: launches, interactionSent: false
  }))
} finally { callbacks.forEach((callback) => callback()) }
