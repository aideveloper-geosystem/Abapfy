import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { loadTs } from './load-typescript.mjs'
test('transport scopes enforce capabilities and never expose arbitrary write endpoints', async (t) => {
  const received = []
  const server = http.createServer((req, res) => {
    received.push([req.method, req.url])
    req.resume()
    res.end('ok')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => {
    server.closeAllConnections()
    server.close()
  })
  const { sapAdtTransport } = loadTs('src/main/sapAdtTransport.ts', {}, { URL })
  const config = {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    client: '100',
    language: 'PT',
    caCertificate: '',
    allowWrite: true,
    allowCreate: true,
    allowActivate: true,
    allowQuality: true,
    allowTransports: true,
    allowTransportRelease: true,
    allowDebug: true
  }
  const read = sapAdtTransport(config, new AbortController().signal)
  const write = sapAdtTransport(config, new AbortController().signal, 'advanced')
  const debug = sapAdtTransport(config, new AbortController().signal, 'debug')
  const denied = sapAdtTransport(
    { ...config, allowWrite: false, allowTransports: false },
    new AbortController().signal,
    'advanced'
  )
  t.after(() => {
    read.close()
    write.close()
    debug.close()
    denied.close()
  })
  const source = {
    url: '/sap/bc/adt/oo/classes/zcl_test/source/main',
    method: 'PUT',
    body: 'source'
  }
  await assert.rejects(read.client.request(source), /somente leitura/)
  await assert.rejects(denied.client.request(source), /não autorizado/)
  await write.client.request(source)
  await write.client.request({ url: '/sap/bc/adt/activation', method: 'POST' })
  await write.client.request({
    url: '/sap/bc/adt/cts/transportrequests/DEVK900001/newreleasejobs',
    method: 'POST'
  })
  await assert.rejects(
    write.client.request({
      url: '/sap/bc/adt/cts/transportrequests/DEVK900001/relwithignlock',
      method: 'POST'
    }),
    /não autorizado/
  )
  await assert.rejects(
    write.client.request({ url: '/sap/bc/adt/cts/transportrequests/DEVK900001', method: 'DELETE' }),
    /não autorizado/
  )
  await assert.rejects(
    write.client.request({ url: '/sap/bc/adt/debugger', method: 'POST' }),
    /não autorizado/
  )
  await assert.rejects(debug.client.request(source), /não autorizado/)
  await debug.client.request({ url: '/sap/bc/adt/debugger', method: 'POST' })
  await write.client.request({ url: '/sap/bc/adt/acm/dcl/sources', method: 'POST' })
  assert.equal(received.length, 5)
})
