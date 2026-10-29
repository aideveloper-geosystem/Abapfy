/** Converts nested ADT/Node errors into useful messages without exposing requests or secrets. */
export function sapAdtFailure(error: unknown): Error {
  const pending: unknown[] = [error]
  const visited = new Set<object>()
  const codes = new Set<string>()
  let status: number | undefined
  while (pending.length && visited.size < 16) {
    const value = pending.shift()
    if (!value || typeof value !== 'object' || visited.has(value)) continue
    visited.add(value)
    const item = value as {
      code?: unknown
      status?: unknown
      err?: unknown
      cause?: unknown
      parent?: unknown
      response?: { status?: unknown }
      errors?: unknown[]
    }
    if (typeof item.code === 'string') codes.add(item.code)
    for (const candidate of [item.status, item.err, item.response?.status]) {
      if (!status && typeof candidate === 'number' && candidate >= 300 && candidate <= 599)
        status = candidate
    }
    pending.push(item.cause, item.parent)
    if (Array.isArray(item.errors)) pending.push(...item.errors.slice(0, 8))
  }
  const has = (...values: string[]): boolean => values.some((value) => codes.has(value))
  if (has('ENOTFOUND', 'EAI_AGAIN'))
    return new Error(
      'Não foi possível resolver o nome do servidor SAP (DNS). Confira a URL e a VPN/DNS corporativo ou informe o endereço IP acessível fornecido pelo BASIS.'
    )
  if (
    has(
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      'UNABLE_TO_GET_ISSUER_CERT',
      'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
      'SELF_SIGNED_CERT_IN_CHAIN',
      'DEPTH_ZERO_SELF_SIGNED_CERT'
    )
  )
    return new Error(
      'O servidor respondeu, mas a cadeia do certificado HTTPS não pôde ser validada. Solicite ao BASIS os certificados da CA da empresa em formato PEM e informe-os em Integrações > Certificado da empresa. O servidor também pode precisar enviar a cadeia intermediária completa.'
    )
  if (has('ERR_TLS_CERT_ALTNAME_INVALID'))
    return new Error(
      'O nome/IP da URL não corresponde ao certificado HTTPS do SAP. Use o hostname indicado no certificado e acessível na rede ou solicite ao BASIS um certificado válido para esse endereço.'
    )
  if (has('CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID'))
    return new Error(
      'O certificado HTTPS do SAP está fora do período de validade. Confira a data do computador e solicite ao BASIS a verificação do certificado.'
    )
  if (has('ECONNREFUSED'))
    return new Error(
      'A conexão foi recusada pelo servidor SAP. Confira IP/hostname, porta e serviço HTTP/HTTPS ativo no SMICM.'
    )
  if (
    has(
      'ETIMEDOUT',
      'ESOCKETTIMEDOUT',
      'ERR_SOCKET_CONNECTION_TIMEOUT',
      'EHOSTUNREACH',
      'ENETUNREACH'
    )
  )
    return new Error(
      'O servidor SAP não respondeu dentro do prazo ou não está acessível. Confira VPN, rota, firewall, endereço e porta.'
    )
  if (has('ECONNRESET', 'EPROTO', 'ERR_SSL_WRONG_VERSION_NUMBER', 'ERR_SSL_PACKET_LENGTH_TOO_LONG'))
    return new Error(
      'A conexão SAP foi interrompida ou o protocolo TLS foi recusado. Confirme no SMICM se a porta informada utiliza HTTPS e verifique a conexão com o BASIS.'
    )
  if (has('SAP_RESPONSE_LIMIT'))
    return new Error(
      'A resposta SAP excedeu o limite de 5 MB. Reduza a consulta ou a quantidade de dados solicitada.'
    )
  if (status === 401)
    return new Error('SAP recusou a autenticação. Confira usuário, senha e mandante.')
  if (status === 403)
    return new Error(
      'SAP recusou a operação por falta de autorização ou configuração de acesso ADT.'
    )
  if (status === 409 || status === 423)
    return new Error(
      'O SAP informou conflito ou bloqueio do objeto. Consulte o lock e a request/tarefa; releia a fonte antes de tentar novamente.'
    )
  if (status === 412)
    return new Error(
      'A versão do objeto SAP mudou. Releia as fontes e prepare novamente a alteração; nenhuma repetição automática será feita.'
    )
  if (status === 404)
    return new Error(
      'Serviço ADT não disponível nesta URL. Solicite ao BASIS a verificação de /sap/bc/adt na SICF e da versão do sistema.'
    )
  if (status && status >= 300 && status < 400)
    return new Error(
      'O servidor redirecionou a conexão. Confirme com o BASIS a URL ADT direta; o Abapfy não segue redirecionamentos com credenciais SAP.'
    )
  if (status)
    return new Error(
      `O servidor SAP respondeu HTTP ${status}. Solicite ao BASIS a verificação do serviço ADT e dos logs do servidor.`
    )
  return new Error(
    'Falha na comunicação ADT. Confira VPN/rede, URL, certificado, credenciais e serviços disponíveis no SAP. Se uma alteração estava em andamento, verifique seu estado no SAP antes de repetir.'
  )
}
