import { request as httpRequest } from 'node:http'
import { request as httpsRequest, Agent } from 'node:https'
import {
  HttpClientException,
  type HttpClient,
  type HttpClientOptions,
  type HttpClientResponse
} from 'abap-adt-api/build/AdtHTTP'
import type { SapAdtConnection } from '../shared/sapAdt'

/** ADT owns cookies and CSRF; this transport owns TLS, destination, limits and cancellation. */
export function sapAdtTransport(
  connection: SapAdtConnection,
  signal: AbortSignal | (() => AbortSignal),
  scope: 'read' | 'advanced' | 'debug' = 'read'
): { client: HttpClient; close: () => void } {
  const agent = new Agent({
    rejectUnauthorized: true,
    ...(connection.caCertificate.trim() ? { ca: connection.caCertificate } : {})
  })
  const client: HttpClient = {
    request: async (options: HttpClientOptions): Promise<HttpClientResponse> => {
      const requestSignal = typeof signal === 'function' ? signal() : signal
      requestSignal.throwIfAborted()
      const url = new URL(options.url, connection.baseUrl)
      if (
        url.origin !== connection.baseUrl ||
        !(url.pathname.startsWith('/sap/bc/adt/') || url.pathname === '/sap/public/bc/icf/logoff')
      )
        throw new Error('Destino ADT não autorizado.')
      const method = (options.method ?? 'GET').toUpperCase()
      const p = url.pathname
      const quality = scope === 'advanced' && connection.allowQuality
      const write = scope === 'advanced' && connection.allowWrite
      const create = scope === 'advanced' && connection.allowCreate
      const activate = scope === 'advanced' && connection.allowActivate
      const transports = scope === 'advanced' && connection.allowTransports
      const debug = scope === 'debug' && connection.allowDebug
      const allowed =
        method === 'GET' ||
        (method === 'POST' && p === '/sap/bc/adt/datapreview/ddic') ||
        (quality &&
          method === 'POST' &&
          (p === '/sap/bc/adt/checkruns' ||
            p === '/sap/bc/adt/abapunit/testruns' ||
            [
              '/sap/bc/adt/atc/worklists',
              '/sap/bc/adt/atc/runs',
              '/sap/bc/adt/repository/informationsystem/usageReferences'
            ].includes(p))) ||
        ((write || create || transports) &&
          method === 'POST' &&
          p === '/sap/bc/adt/cts/transportchecks') ||
        (transports && method === 'POST' && p === '/sap/bc/adt/cts/transports') ||
        (transports &&
          method === 'PUT' &&
          /^\/sap\/bc\/adt\/cts\/transportrequests\/[A-Z0-9]{3}K[A-Z0-9]{6}$/.test(p)) ||
        (transports &&
          method === 'POST' &&
          /^\/sap\/bc\/adt\/cts\/transportrequests\/[A-Z0-9]{3}K[A-Z0-9]{6}\/tasks$/.test(p)) ||
        (transports &&
          connection.allowTransportRelease &&
          method === 'POST' &&
          /^\/sap\/bc\/adt\/cts\/transportrequests\/[A-Z0-9]{3}K[A-Z0-9]{6}\/newreleasejobs$/.test(
            p
          )) ||
        ((write || activate) &&
          method === 'POST' &&
          ['LOCK', 'UNLOCK'].includes(String(options.qs?._action)) &&
          /^\/sap\/bc\/adt\/(?:oo|programs|ddic|acm)\//.test(p)) ||
        (write && method === 'PUT' && /^\/sap\/bc\/adt\/(?:oo|programs|ddic|acm)\//.test(p)) ||
        (activate && method === 'POST' && p === '/sap/bc/adt/activation') ||
        (create &&
          method === 'POST' &&
          /^\/sap\/bc\/adt\/(?:oo\/(?:classes|interfaces)|programs\/(?:programs|includes)|ddic\/(?:ddl\/sources|ddlx\/sources)|acm\/dcl\/sources)\/?$/.test(
            p
          )) ||
        (debug &&
          ['POST', 'DELETE'].includes(method) &&
          /^\/sap\/bc\/adt\/debugger(?:\/(?:listeners|breakpoints)(?:\/[^/]+)?)?$/.test(p))
      if (!allowed)
        throw new Error(
          'Método/endpoint não autorizado neste escopo ADT; o padrão permite somente leitura.'
        )
      url.searchParams.set('sap-client', connection.client)
      url.searchParams.set('sap-language', connection.language)
      for (const [key, value] of Object.entries(options.qs ?? {}))
        url.searchParams.set(key, String(value))
      return new Promise((resolve, reject) => {
        const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
          url,
          {
            method: options.method ?? 'GET',
            headers: options.headers,
            ...(options.auth ? { auth: `${options.auth.username}:${options.auth.password}` } : {}),
            ...(url.protocol === 'https:' ? { agent } : {}),
            signal: requestSignal
          },
          (response) => {
            const chunks: Buffer[] = []
            let size = 0
            response.on('data', (chunk: Buffer) => {
              size += chunk.length
              if (size > 5_000_000) {
                request.destroy(
                  Object.assign(new Error('Resposta SAP excedeu o limite.'), {
                    code: 'SAP_RESPONSE_LIMIT'
                  })
                )
                return
              }
              chunks.push(chunk)
            })
            response.on('error', reject)
            response.on('end', () => {
              const result = {
                body: Buffer.concat(chunks).toString('utf8'),
                status: response.statusCode ?? 0,
                statusText: response.statusMessage ?? '',
                headers: response.headers as HttpClientResponse['headers']
              }
              if (result.status < 200 || result.status >= 300) {
                // Never return raw HTTP bodies/configs containing credentials or sensitive payloads.
                reject(
                  new HttpClientException(
                    `SAP HTTP ${result.status}`,
                    undefined,
                    result.status,
                    undefined,
                    options,
                    result
                  )
                )
              } else resolve(result)
            })
          }
        )
        request.setTimeout(30000, () =>
          request.destroy(
            Object.assign(new Error('Tempo limite na comunicação SAP.'), { code: 'ETIMEDOUT' })
          )
        )
        request.on('error', reject)
        if (options.body) request.write(options.body)
        request.end()
      })
    }
  }
  return { client, close: () => agent.destroy() }
}
