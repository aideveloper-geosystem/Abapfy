import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-typescript.mjs'
const { sapAdtFailure } = loadTs('src/main/sapAdtErrors.ts')
test('nested ADT errors distinguish DNS, certificate chain, hostname, network and authentication without leaking secrets', () => {
  for (const [code, expected] of [
    ['ENOTFOUND', /DNS/],
    ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', /cadeia.*certificado/],
    ['ERR_TLS_CERT_ALTNAME_INVALID', /nome\/IP/i],
    ['CERT_HAS_EXPIRED', /validade/],
    ['ECONNREFUSED', /recusada/],
    ['ETIMEDOUT', /prazo/],
    ['EPROTO', /protocolo/],
    ['SAP_RESPONSE_LIMIT', /5 MB/]
  ]) {
    const error = sapAdtFailure({
      parent: {
        cause: { code, message: 'private-password' },
        request: { auth: { password: 'private-password' } }
      }
    })
    assert.match(error.message, expected)
    assert.equal(error.message.includes('private-password'), false)
  }
  for (const [status, expected] of [
    [401, /autenticação/],
    [403, /autorização/],
    [404, /SICF/],
    [302, /redirecionou/],
    [503, /HTTP 503/]
  ])
    assert.match(sapAdtFailure({ parent: { err: status } }).message, expected)
})
test('aggregate network failures and cyclic causes are handled with bounded traversal', () => {
  assert.match(
    sapAdtFailure({ errors: [{ code: 'ENETUNREACH' }, { code: 'ETIMEDOUT' }] }).message,
    /prazo/
  )
  const cycle = { message: 'private-password' }
  cycle.parent = cycle
  assert.match(sapAdtFailure(cycle).message, /Falha na comunicação ADT/)
  assert.equal(sapAdtFailure(cycle).message.includes('private-password'), false)
})
