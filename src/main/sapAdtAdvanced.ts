import { ADTClient, session_types, objectPath as createdObjectPath } from 'abap-adt-api'
import { createHash } from 'node:crypto'
import { advancedDefinition, advancedAllowed } from '../shared/sapAdtAdvanced'
import { sapAdtPath, type SapAdtConnection } from '../shared/sapAdt'
export class SapAdtActionError extends Error {}
export const sourceHash = (source: string): string =>
  createHash('sha256').update(source).digest('hex')
export interface AdvancedContext {
  client: ADTClient
  connection: SapAdtConnection
  signal: AbortSignal
  approve: (detail: string) => Promise<void>
  known: (path: string) => void
  hasSnapshot: (path: string, version: string, hash: string) => boolean
  invalidate: (path: string) => void
  registerObject: (path: string) => void
  atcRuns: Set<string>
}
const text = (a: Record<string, unknown>, key: string): string => a[key] as string
export async function editableRequest(client: ADTClient, request: string) {
  const details = await client.transportDetails(request)
  if (details['tm:status'] !== 'D')
    throw new SapAdtActionError(
      'A request/tarefa não está modificável. Confira os detalhes antes de continuar.'
    )
  return details
}
async function stateful(client: ADTClient) {
  if (!client.loggedin) await client.login()
  client.stateful = session_types.stateful
}
export async function runSapAdtAdvanced(
  name: string,
  input: unknown,
  ctx: AdvancedContext
): Promise<unknown> {
  const definition = advancedDefinition(name)
  if (!definition || !advancedAllowed(ctx.connection, name))
    throw new SapAdtActionError('Ferramenta avançada não autorizada nesta conexão.')
  const a = definition.schema.parse(input) as Record<string, unknown>
  const client = ctx.client
  const path = typeof a.objectPath === 'string' ? a.objectPath : undefined
  if (path) ctx.known(path)
  ctx.signal.throwIfAborted()
  if (name === 'edit_source' || name === 'activate_object') {
    const version =
      name === 'activate_object' ? 'inactive' : (text(a, 'version') as 'active' | 'inactive')
    const expected = text(a, 'expectedHash')
    if (!ctx.hasSnapshot(path!, version, expected))
      throw new SapAdtActionError(
        'Leia a versão correspondente nesta mensagem e use o sourceHash retornado antes de alterar/ativar.'
      )
    const structure = await client.objectStructure(path!, version)
    const include = sapAdtPath(ADTClient.mainInclude(structure))
    const before = await client.getObjectSource(include, { version })
    if (sourceHash(before) !== expected)
      throw new SapAdtActionError(
        'A fonte SAP mudou desde a leitura. Leia novamente; nenhuma gravação foi solicitada.'
      )
    let after = before
    if (name === 'edit_source') {
      const oldText = text(a, 'oldText')
      if (before.indexOf(oldText) < 0 || before.indexOf(oldText) !== before.lastIndexOf(oldText))
        throw new SapAdtActionError(
          'O texto original deve corresponder a exatamente uma ocorrência na fonte.'
        )
      after = before.replace(oldText, () => text(a, 'newText'))
      if (after === before) throw new SapAdtActionError('A alteração não modifica a fonte.')
      await ctx.approve(
        `Editar fonte ${version} e salvar como INATIVA\nObjeto: ${path}\nRequest: ${a.transport}\nHash anterior: ${expected}\n\n--- Trecho original\n${oldText}\n\n+++ Trecho proposto\n${a.newText}\n\nNão haverá ativação automática.`
      )
    } else
      await ctx.approve(
        `ATIVAR objeto ${structure.metaData['adtcore:name']}\n${path}\nHash da fonte inativa: ${expected}\nA versão ativa/executável será alterada.`
      )
    ctx.signal.throwIfAborted()
    await stateful(client)
    const lock = await client.lock(path!)
    let preparationError: unknown
    let outcome: Record<string, unknown> = {},
      attempted = false
    try {
      const current = await client.getObjectSource(include, { version })
      if (sourceHash(current) !== expected)
        throw new SapAdtActionError('A fonte mudou antes da obtenção do lock. Leia novamente.')
      if (name === 'edit_source') {
        if (a.transport === '$TMP') {
          const info = await client.transportInfo(path!)
          if (info.DEVCLASS !== '$TMP' || !['X', 'true'].includes(String(lock.IS_LOCAL)))
            throw new SapAdtActionError(
              '$TMP somente é permitido para um objeto local confirmado pelo SAP.'
            )
        } else {
          const details = await editableRequest(client, text(a, 'transport'))
          if (
            lock.CORRNR &&
            lock.CORRNR !== a.transport &&
            !details.tasks.some((task) => task['tm:number'] === lock.CORRNR)
          )
            throw new SapAdtActionError(
              'O objeto está vinculado a outra request/tarefa. Consulte object_transport antes de alterar.'
            )
        }
        if (version === 'active') {
          let inactive: string | undefined
          try {
            inactive = await client.getObjectSource(include, { version: 'inactive' })
          } catch (error) {
            const e = error as { err?: number; status?: number; response?: { status?: number } }
            if (![e.err, e.status, e.response?.status].includes(404)) throw error
          }
          if (inactive !== undefined && inactive !== before)
            throw new SapAdtActionError(
              'Já existe uma fonte inativa diferente. Leia a versão inativa antes de editar para preservar as alterações pendentes.'
            )
        }
        attempted = true
        await client.setObjectSource(
          include,
          after,
          lock.LOCK_HANDLE,
          a.transport === '$TMP' ? undefined : text(a, 'transport')
        )
        const verified = await client.getObjectSource(include, { version: 'inactive' })
        ctx.invalidate(path!)
        outcome = {
          status: verified === after ? 'saved_inactive' : 'uncertain',
          objectPath: path,
          sourceHash: sourceHash(verified),
          verified: verified === after,
          activated: false,
          transport: a.transport
        }
      } else {
        attempted = true
        const activation = await client.activate(structure.metaData['adtcore:name'], path!, include)
        const verified = await client.getObjectSource(include, { version: 'active' })
        ctx.invalidate(path!)
        outcome = {
          status: sourceHash(verified) === expected ? 'activated' : 'activation_not_verified',
          verified: sourceHash(verified) === expected,
          activation,
          sourceHash: sourceHash(verified)
        }
      }
    } catch (error) {
      if (!attempted) preparationError = error
      else
        outcome = {
          status: 'uncertain',
          operationAttempted: true,
          message:
            'A operação foi enviada, mas seu resultado não pôde ser confirmado. Não repetir automaticamente; releia a fonte e o estado do objeto.'
        }
    } finally {
      try {
        await client.unLock(path!, lock.LOCK_HANDLE)
      } catch {
        outcome.cleanupWarning =
          'Não foi possível confirmar a liberação do lock. Verifique o objeto no SAP.'
      }
    }
    if (preparationError) {
      if (outcome.cleanupWarning)
        throw new SapAdtActionError(
          (preparationError instanceof SapAdtActionError
            ? preparationError.message
            : 'Falha antes da gravação/ativação.') +
            ' ' +
            outcome.cleanupWarning
        )
      throw preparationError
    }
    return outcome
  }
  if (name === 'create_object') {
    const packagePath = text(a, 'packagePath')
    ctx.known(packagePath)
    if (!packagePath.startsWith('/sap/bc/adt/packages/'))
      throw new SapAdtActionError('Pesquise o pacote SAP antes de criar o objeto.')
    const pkg = await client.objectStructure(packagePath)
    if (pkg.metaData['adtcore:name'].toUpperCase() !== a.packageName)
      throw new SapAdtActionError('O pacote informado não corresponde ao pacote pesquisado.')
    if ((a.transport === '$TMP') !== (a.packageName === '$TMP'))
      throw new SapAdtActionError('Objeto local exige pacote e escolha de transporte $TMP.')
    if (a.transport !== '$TMP') await editableRequest(client, text(a, 'transport'))
    const options = {
      objtype: a.type as
        'CLAS/OC' | 'INTF/OI' | 'PROG/P' | 'PROG/I' | 'DDLS/DF' | 'DCLS/DL' | 'DDLX/EX',
      name: text(a, 'name'),
      parentName: text(a, 'packageName'),
      parentPath: packagePath,
      description: text(a, 'description'),
      ...(a.transport === '$TMP' ? {} : { transport: text(a, 'transport') }),
      responsible: ctx.connection.username
    }
    const target = sapAdtPath(createdObjectPath(options))
    const existing = await client.searchObject(options.name, options.objtype.split('/')[0], 10)
    if (existing.some((row) => row['adtcore:name'].toUpperCase() === options.name))
      throw new SapAdtActionError('O objeto já existe; nenhuma criação foi solicitada.')
    await ctx.approve(
      `CRIAR objeto\nTipo: ${a.type}\nNome: ${a.name}\nPacote: ${a.packageName}\nRequest: ${a.transport}\nDescrição: ${a.description}\nSem ativação automática.`
    )
    ctx.signal.throwIfAborted()
    await stateful(client)
    try {
      await client.createObject(options)
      const verified = await client.objectStructure(target, 'inactive')
      ctx.registerObject(target)
      return {
        status: 'created',
        objectPath: target,
        name: verified.metaData['adtcore:name'],
        activated: false
      }
    } catch {
      return {
        status: 'uncertain',
        objectPath: target,
        operationAttempted: true,
        message: 'Criação enviada; pesquise o objeto para confirmar o estado antes de repetir.'
      }
    }
  }
  if (definition.confirm)
    await ctx.approve(`${definition.description}\n\nParâmetros:\n${JSON.stringify(a, null, 2)}`)
  ctx.signal.throwIfAborted()
  if (name === 'object_details') return client.objectStructure(path!)
  if (name === 'where_used') return client.usageReferences(path!)
  if (name === 'syntax_check') {
    const version = a.version as 'active' | 'inactive'
    const structure = await client.objectStructure(path!, version)
    const include = sapAdtPath(ADTClient.mainInclude(structure))
    const source = await client.getObjectSource(include, { version })
    return client.syntaxCheck(include, path!, source, undefined, version)
  }
  if (name === 'unit_tests')
    return client.unitTestRun(path!, {
      harmless: true,
      dangerous: false,
      critical: false,
      short: true,
      medium: true,
      long: false
    })
  if (name === 'atc_check') {
    const variant = await client.atcCheckVariant(text(a, 'variant'))
    const result = await client.createAtcRun(variant, path!, 100)
    ctx.atcRuns.add(result.id)
    return result
  }
  if (name === 'atc_results') {
    const id = text(a, 'runId')
    if (!ctx.atcRuns.has(id))
      throw new SapAdtActionError('Use um runId ATC retornado nesta mensagem.')
    return client.atcWorklists(id)
  }
  if (name === 'list_transports') return client.userTransports(ctx.connection.username)
  if (name === 'transport_details') return client.transportDetails(text(a, 'request'))
  if (name === 'object_transport') return client.transportInfo(path!)
  await stateful(client) // prevent the library from replaying writes after reauthentication
  if (name === 'create_transport') {
    const info = await client.transportInfo(path!)
    if (info.DEVCLASS !== a.packageName)
      throw new SapAdtActionError(
        'O pacote da request não corresponde ao pacote retornado pelo SAP para o objeto.'
      )
    const request = await client.createTransport(
      path!,
      text(a, 'description'),
      text(a, 'packageName')
    )
    return { request, details: await client.transportDetails(request) }
  }
  await editableRequest(client, text(a, 'request'))
  if (name === 'release_transport') {
    const reports = await client.transportRelease(text(a, 'request'), false, false)
    return {
      releaseRequested: true,
      reports,
      details: await client.transportDetails(text(a, 'request'))
    }
  }
  if (name === 'set_transport_owner')
    return client.transportSetOwner(text(a, 'request'), text(a, 'username'))
  if (name === 'add_transport_user')
    return client.transportAddUser(text(a, 'request'), text(a, 'username'))
  throw new SapAdtActionError('Ação avançada desconhecida.')
}
