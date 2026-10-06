import assert from 'node:assert/strict'
import { loadTs } from './load-typescript.mjs'
let script
loadTs('src/main/sapWindowContext.ts', { electron: { app: { on() {} } }, './sapNativeWorker': { SapNativeWorker: class { constructor(source) { script = source } } } })
const setup = `Add-Type -AssemblyName System.Windows.Forms
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Abapfy capture smoke'
$form.ShowInTaskbar = $false
$form.Size = New-Object System.Drawing.Size(900, 600)
$form.StartPosition = 'Manual'
$form.Location = New-Object System.Drawing.Point(-10000, -10000)
$label = New-Object System.Windows.Forms.Label
$label.Text = 'Captura sintética: texto e geometria'
$label.AutoSize = $true
$label.Location = New-Object System.Drawing.Point(40, 70)
$form.Controls.Add($label)
$form.CreateControl()
$testHandle = $form.Handle
$label.CreateControl()
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class SmokeWindow { [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int height, uint flags); }'
[void][SmokeWindow]::SetWindowPos($testHandle, [IntPtr]::Zero, -10000, -10000, 900, 600, 84)
[System.Windows.Forms.Application]::DoEvents()
`
script = script.replace('function Read-SapWindows {', setup + '\nfunction Read-SapWindows {')
script = script.replace('$result = Read-SapWindows', '$result = [SapInputNative]::Capture($testHandle, [uint32]$PID)')
const { SapNativeWorker } = loadTs('src/main/sapNativeWorker.ts')
const worker = new SapNativeWorker(script)
try {
  const first = await worker.run({ operation: 'scan' })
  assert.ok(first.width >= 400 && first.height >= 250)
  assert.equal(Buffer.from(first.pngBase64, 'base64').subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  const second = await worker.run({ operation: 'scan' })
  assert.equal(second.changeRatio, 0)
  assert.equal(first.left, -10000)
  console.log(JSON.stringify({ width: first.width, height: first.height, nativePng: true, unchangedRatio: second.changeRatio, windowOffscreen: true, interactionSent: false }))
} finally { worker.close() }
