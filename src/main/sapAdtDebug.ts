import { randomUUID } from 'node:crypto'
import { session_types, ADTClient, type DebugBreakpoint } from 'abap-adt-api'
import { advancedDefinition } from '../shared/sapAdtAdvanced'
import { sapAdtPath, type SapAdtConnection } from '../shared/sapAdt'
import { SapAdtActionError } from './sapAdtAdvanced'
export interface SapAdtSession {
  client: ADTClient
  setSignal: (signal: AbortSignal) => void
  close: () => Promise<void>
}
interface DebugSession {
  handle: SapAdtSession
  fingerprint: string
  controller: AbortController
  timer: ReturnType<typeof setTimeout>
  terminal: string
  ide: string
  clientId: string
  attached: boolean
  breakpoints: DebugBreakpoint[]
  username: string
  busy: boolean
}
const sessions = new Map<string, DebugSession>()
const cleanupFailures = new Map<string, string[]>()
async function doStopSapAdtDebug(key: string): Promise<{ stopped: boolean; warnings: string[] }> {
  const session = sessions.get(key)
  if (!session) {
    const warnings = cleanupFailures.get(key) ?? []
    return { stopped: warnings.length === 0, warnings }
  }
  sessions.delete(key)
  clearTimeout(session.timer)
  session.controller.abort()
  session.handle.setSignal(AbortSignal.timeout(5000))
  const warnings: string[] = []
  const client = session.handle.client
  if (session.attached) {
    try {
      await client.debuggerStep('detachDebugger')
    } catch {
      warnings.push(
        'Não foi possível confirmar a desconexão do debugger. Verifique a execução no SAP.'
      )
    }
  }
  for (const breakpoint of session.breakpoints) {
    try {
      await client.debuggerDeleteBreakpoints(
        breakpoint,
        'user',
        session.terminal,
        session.ide,
        session.username
      )
    } catch {
      warnings.push('Não foi possível remover um breakpoint desta sessão. Verifique no SAP.')
    }
  }
  try {
    if (client.loggedin)
      await client.debuggerDeleteListener('user', session.terminal, session.ide, session.username)
  } catch {
    warnings.push('Não foi possível confirmar a remoção do listener desta sessão.')
  }
  await session.handle
    .close()
    .catch(() => warnings.push('Não foi possível confirmar o logoff da sessão SAP.'))
  if (warnings.length) cleanupFailures.set(key, warnings)
  else cleanupFailures.delete(key)
  return { stopped: warnings.length === 0, warnings }
}
const pendingStops = new Map<string, Promise<{ stopped: boolean; warnings: string[] }>>()
export function stopSapAdtDebug(key: string): Promise<{ stopped: boolean; warnings: string[] }> {
  const previous = pendingStops.get(key)
  if (previous) return previous
  const pending = doStopSapAdtDebug(key).finally(() => pendingStops.delete(key))
  pendingStops.set(key, pending)
  return pending
}
export async function closeSapAdtDebug(): Promise<void> {
  await Promise.all([...new Set([...sessions.keys(), ...pendingStops.keys()])].map(stopSapAdtDebug))
}
export async function runSapAdtDebug(
  key: string,
  connection: SapAdtConnection,
  input: unknown,
  signal: AbortSignal,
  open: () => SapAdtSession,
  approve: (detail: string) => Promise<void>,
  known: (path: string) => void
): Promise<unknown> {
  const a = advancedDefinition('debug')!.schema.parse(input) as Record<string, unknown>
  if (!connection.allowDebug) throw new SapAdtActionError('Debug não autorizado nesta conexão.')
  if (!/^[A-Za-z0-9_.$@-]{1,100}$/.test(connection.username))
    throw new SapAdtActionError('Nome de usuário incompatível com o protocolo de debug.')
  const action = a.action as string
  if (action === 'breakpoints' && (!a.objectPath || !a.lines))
    throw new SapAdtActionError('Informe objeto e linhas dos breakpoints.')
  if (action === 'step' && !a.step)
    throw new SapAdtActionError('Informe o tipo de passo do debugger.')
  if (a.objectPath) known(a.objectPath as string)
  const existing = sessions.get(key)
  if (existing?.busy)
    throw new SapAdtActionError('Já existe uma operação de debug em andamento nesta conexão.')
  await approve(
    `DEBUG do próprio usuário ${connection.username}\nAção: ${action}\nParâmetros: ${JSON.stringify(a)}\nInspeção de variáveis pode enviar dados ao provedor de IA. Passos/continue executam o programa. Ao parar, expirar ou sair do Abapfy, o debugger tenta desanexar; isso pode permitir que a execução continue. Não há alteração de variáveis nem término forçado de programas. Se action=acknowledge_cleanup, autorizar confirma que você já verificou e limpou manualmente as pendências no SAP.`
  )
  signal.throwIfAborted()
  if (action === 'acknowledge_cleanup') {
    if (sessions.has(key))
      throw new SapAdtActionError('Encerre a sessão ativa antes de confirmar a limpeza manual.')
    cleanupFailures.delete(key)
    return {
      acknowledged: true,
      message: 'Pendências anteriores reconhecidas como verificadas manualmente pelo usuário.'
    }
  }
  if (action === 'stop') return stopSapAdtDebug(key)
  if (action === 'start') {
    if (existing) return { status: existing.attached ? 'attached' : 'ready', expiresInMinutes: 10 }
    const pendingCleanup = cleanupFailures.get(key)
    if (pendingCleanup?.length)
      throw new SapAdtActionError(
        pendingCleanup.join(' ') + ' Confira e limpe a sessão no SAP antes de iniciar novamente.'
      )
    const handle = open()
    const session: DebugSession = {
      handle,
      controller: new AbortController(),
      fingerprint: JSON.stringify(connection),
      timer: setTimeout(() => {
        void stopSapAdtDebug(key)
      }, 600000),
      terminal: randomUUID(),
      ide: randomUUID(),
      clientId: randomUUID(),
      attached: false,
      breakpoints: [],
      username: connection.username,
      busy: false
    }
    sessions.set(key, session)
    try {
      await handle.client.login()
      handle.client.stateful = session_types.stateful
      return {
        status: 'ready',
        expiresInMinutes: 10,
        next: 'Defina breakpoints e execute a transação/programa no SAP; depois use wait.'
      }
    } catch (error) {
      await stopSapAdtDebug(key)
      throw error
    }
  }
  const session = sessions.get(key)
  if (!session) throw new SapAdtActionError('Inicie o debugger com action=start nesta conexão.')
  if (session.fingerprint !== JSON.stringify(connection)) {
    await stopSapAdtDebug(key)
    throw new SapAdtActionError(
      'A configuração mudou. O debugger anterior foi encerrado; inicie novamente.'
    )
  }
  session.busy = true
  const actionSignal = AbortSignal.any([signal, session.controller.signal])
  session.handle.setSignal(actionSignal)
  const client = session.handle.client
  try {
    if (action === 'breakpoints') {
      const structure = await client.objectStructure(a.objectPath as string)
      const include = sapAdtPath(ADTClient.mainInclude(structure))
      const uris = (a.lines as number[]).map((line) => `${include}#start=${line}`)
      const breakpoints = await client.debuggerSetBreakpoints(
        'user',
        session.terminal,
        session.ide,
        session.clientId,
        uris,
        connection.username,
        'external',
        false,
        false,
        include
      )
      const successful = breakpoints.filter(
        (bp): bp is DebugBreakpoint => 'id' in bp && !('errorMessage' in bp)
      )
      session.breakpoints.push(...successful)
      return {
        breakpoints,
        next: 'Execute a transação/programa no SAP para atingir o breakpoint; use wait.'
      }
    }
    if (action === 'wait') {
      if (session.attached) return { status: 'attached', next: 'Use stack, variables ou step.' }
      const waitSignal = AbortSignal.any([actionSignal, AbortSignal.timeout(25000)])
      session.handle.setSignal(waitSignal)
      try {
        const debuggee = await client.debuggerListen(
          'user',
          session.terminal,
          session.ide,
          connection.username,
          true,
          true
        )
        session.handle.setSignal(actionSignal)
        if (!debuggee) return { status: 'waiting', message: 'Nenhuma parada recebida.' }
        if (!('DEBUGGEE_ID' in debuggee)) return { status: 'listener_conflict', detail: debuggee }
        if (
          debuggee.DEBUGGEE_USER.toUpperCase() !== connection.username.toUpperCase() ||
          String(debuggee.CLIENT).padStart(3, '0') !== connection.client
        )
          throw new SapAdtActionError(
            'A parada retornada não pertence ao usuário/mandante autorizado.'
          )
        session.attached = true // An interrupted attach also requires best-effort detach.
        const attached = await client.debuggerAttach(
          'user',
          debuggee.DEBUGGEE_ID,
          connection.username,
          false
        )
        session.attached = true
        return { status: 'attached', attached, stack: await client.debuggerStackTrace() }
      } catch (error) {
        if (waitSignal.aborted && !actionSignal.aborted)
          return {
            status: 'waiting_timeout',
            message:
              'Nenhuma parada recebida em 25 segundos. A sessão continua disponível; execute o programa ou repita wait quando necessário.'
          }
        throw error
      } finally {
        session.handle.setSignal(actionSignal)
      }
    }
    if (!session.attached)
      throw new SapAdtActionError('Nenhum programa anexado. Aguarde uma parada com action=wait.')
    if (action === 'stack') return await client.debuggerStackTrace()
    if (action === 'variables')
      return await client.debuggerChildVariables(a.parents as string[] | undefined)
    if (action === 'step')
      return await client.debuggerStep(
        a.step as 'stepInto' | 'stepOver' | 'stepReturn' | 'stepContinue'
      )
    throw new SapAdtActionError('Ação de debug desconhecida.')
  } catch (error) {
    if (actionSignal.aborted || !(error instanceof SapAdtActionError)) await stopSapAdtDebug(key)
    throw error
  } finally {
    session.busy = false
  }
}
