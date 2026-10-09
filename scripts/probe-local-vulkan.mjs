import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
const manifest = JSON.parse(await readFile('.local-ai/runtime.json', 'utf8'))
const server = createServer()
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
await new Promise((resolve) => server.close(resolve))
const child = spawn(manifest.embeddingVulkanExecutable, ['-m', manifest.embeddingModel, '--embedding', '--pooling', 'mean', '-c', '8192', '-b', '2048', '-ub', '2048', '-np', '1', '-t', '4', '-tb', '4', '-ngl', '99', '-lv', '4', '--host', '127.0.0.1', '--port', String(port)], { windowsHide: true })
let log = ''
child.stderr.on('data', (c) => { log += c.toString() })
child.stdout.on('data', (c) => { log += c.toString() })
try {
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500))
    if (child.exitCode !== null) break
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break } catch { /* startup */ }
  }
} finally {
  child.kill()
  await writeFile('tmp/local-ai-tests/vulkan-startup.log', log)
  console.log(log.split('\n').filter((s) => /vulkan|offload|device|gpu|error|warn|buffer size/i.test(s)).join('\n'))
}
