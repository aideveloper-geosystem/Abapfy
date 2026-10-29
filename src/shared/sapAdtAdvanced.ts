import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { sapAdtPath, type SapAdtConnection } from './sapAdt'
const path = z.string().max(2048).transform(sapAdtPath)
const identifier = z
  .string()
  .regex(/^(?:\/[A-Z0-9_]+\/)?[A-Z_$][A-Z0-9_$]*$/)
  .max(60)
const request = z.string().regex(/^[A-Z0-9]{3}K[A-Z0-9]{6}$/)
const label = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine(
    (s) => !/[<>"&]/.test(s) && [...s].every((c) => c.charCodeAt(0) >= 32),
    'Texto contém caracteres não suportados.'
  )
const object = { objectPath: path }
const hash = z.string().regex(/^[a-f0-9]{64}$/)
export const SAP_ADT_PERMISSION_NAMES = [
  'allowWrite',
  'allowCreate',
  'allowActivate',
  'allowQuality',
  'allowTransports',
  'allowTransportRelease',
  'allowDebug'
] as const
export type SapAdtPermission = (typeof SAP_ADT_PERMISSION_NAMES)[number]
interface Definition {
  name: string
  permission: SapAdtPermission
  description: string
  schema: z.AnyZodObject
  confirm: boolean
}
const def = (
  name: string,
  permission: SapAdtPermission,
  description: string,
  fields: z.ZodRawShape,
  confirm = true
): Definition => ({ name, permission, description, schema: z.object(fields).strict(), confirm })
const editFields = {
  ...object,
  sourcePath: path.optional(),
  expectedHash: hash,
  version: z.enum(['active', 'inactive']).default('active'),
  oldText: z.string().min(1).max(60000).optional(),
  newText: z.string().max(60000).optional(),
  edits: z
    .array(
      z.object({ oldText: z.string().min(1).max(60000), newText: z.string().max(60000) }).strict()
    )
    .min(1)
    .max(30)
    .optional(),
  transport: z.union([request, z.literal('$TMP')])
}
export const SAP_ADT_ADVANCED: Definition[] = [
  def(
    'object_details',
    'allowQuality',
    'Lê estrutura e metadados de objeto pesquisado.',
    object,
    false
  ),
  def(
    'where_used',
    'allowQuality',
    'Consulta referências de uso do objeto pesquisado.',
    object,
    false
  ),
  def(
    'syntax_check',
    'allowQuality',
    'Valida a sintaxe da fonte ativa ou inativa, sem gravar.',
    {
      ...object,
      sourcePath: path.optional(),
      version: z.enum(['active', 'inactive']).default('inactive')
    },
    false
  ),
  def(
    'unit_tests',
    'allowQuality',
    'Executa ABAP Unit (somente harmless; duração curta/média). Pode executar código no SAP.',
    object
  ),
  def(
    'atc_check',
    'allowQuality',
    'Executa ATC com variante existente e retorna o identificador do resultado.',
    { ...object, variant: identifier }
  ),
  def(
    'atc_results',
    'allowQuality',
    'Lê achados de uma execução ATC retornada nesta mensagem.',
    { runId: z.string().min(1).max(200) },
    false
  ),
  def(
    'list_transports',
    'allowTransports',
    'Lista requests e tarefas do próprio usuário SAP.',
    {},
    false
  ),
  def(
    'transport_details',
    'allowTransports',
    'Lê detalhes de request/tarefa existente.',
    { request },
    false
  ),
  def(
    'object_transport',
    'allowTransports',
    'Consulta pacote, requests e locks do objeto pesquisado. Não invente número de request.',
    object,
    false
  ),
  def(
    'create_transport',
    'allowTransports',
    'Cria request com descrição e pacote explicitamente aprovados. Não libera.',
    { ...object, description: label, packageName: identifier }
  ),
  def(
    'release_transport',
    'allowTransportRelease',
    'Libera request/tarefa após aprovação específica. Nunca ignora locks ou ATC.',
    { request }
  ),
  def('set_transport_owner', 'allowTransports', 'Altera responsável da request/tarefa aprovada.', {
    request,
    username: z.string().regex(/^[A-Za-z0-9_.$@-]{1,100}$/)
  }),
  def('add_transport_user', 'allowTransports', 'Adiciona usuário/tarefa à request aprovada.', {
    request,
    username: z.string().regex(/^[A-Za-z0-9_.$@-]{1,100}$/)
  }),
  def(
    'edit_source',
    'allowWrite',
    'Edita uma ou várias ocorrências exatas na mesma fonte ativa/inativa previamente lida nesta mensagem. Use edits: [{oldText,newText}] para várias mudanças independentes ou oldText/newText para uma mudança; sourcePath opcional deve vir de list_sources. Informe sourceHash, oldText, newText e request existente ou $TMP. Mostra diff, salva sob lock e verifica a fonte inativa. Não ativa. Nunca repetir automaticamente uma gravação incerta.',
    editFields
  ),
  def(
    'preview_edits',
    'allowWrite',
    'Prepara várias substituições exatas na mesma fonte previamente lida, sem gravar. Use edits para mudanças independentes ou oldText/newText para uma mudança. Confira a proposta antes de edit_source.',
    editFields,
    false
  ),
  def(
    'activate_object',
    'allowActivate',
    'Ativa a fonte INATIVA previamente lida, validando seu sourceHash sob lock. A ativação afeta a versão executável.',
    { ...object, sourcePath: path.optional(), expectedHash: hash }
  ),
  def(
    'create_object',
    'allowCreate',
    'Cria objeto Z/Y ou namespace de cliente no pacote aprovado. Cria o esqueleto, sem ativar. Use edit_source depois de ler. Não invente pacote/request.',
    {
      type: z.enum(['CLAS/OC', 'INTF/OI', 'PROG/P', 'PROG/I', 'DDLS/DF', 'DCLS/DL', 'DDLX/EX']),
      name: identifier.refine((n) => /^[ZY/]/.test(n), 'Use nome Z/Y ou namespace de cliente.'),
      description: label,
      packageName: identifier,
      packagePath: path,
      transport: z.union([request, z.literal('$TMP')])
    }
  ),
  def(
    'debug',
    'allowDebug',
    'Debugger interativo do próprio usuário. action start cria sessão; breakpoints define até 20 linhas; wait espera até 25s e anexa a parada; stack/variables leem; step avança; stop desanexa e remove os breakpoints desta sessão; acknowledge_cleanup confirma revisão manual de pendências após falha de limpeza. Requer aprovação. Sessão dura até 10 minutos, persiste entre mensagens e é encerrada no logout/revogação. Não inicia uma transação por conta própria.',
    {
      action: z.enum([
        'start',
        'breakpoints',
        'wait',
        'stack',
        'variables',
        'step',
        'stop',
        'acknowledge_cleanup'
      ]),
      objectPath: path.optional(),
      lines: z.array(z.number().int().min(1).max(1000000)).min(1).max(20).optional(),
      parents: z.array(z.string().min(1).max(500)).max(20).optional(),
      step: z.enum(['stepInto', 'stepOver', 'stepReturn', 'stepContinue']).optional()
    }
  )
]
export function advancedDefinition(name: string): Definition | undefined {
  return SAP_ADT_ADVANCED.find((item) => item.name === name)
}
export function advancedAllowed(connection: SapAdtConnection, name: string): boolean {
  const definition = advancedDefinition(name)
  return Boolean(
    definition &&
    connection[definition.permission] &&
    (name !== 'release_transport' || connection.allowTransports)
  )
}
export function advancedToolSchemas(connection: SapAdtConnection) {
  return SAP_ADT_ADVANCED.filter((item) => advancedAllowed(connection, item.name)).map((item) => ({
    ...item,
    inputSchema: (zodToJsonSchema as unknown as (schema: unknown, options: unknown) => unknown)(
      item.schema,
      { target: 'jsonSchema7', $refStrategy: 'none' }
    ) as Record<string, unknown>
  }))
}
