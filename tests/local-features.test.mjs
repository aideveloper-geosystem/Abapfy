import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { loadTs } from './load-typescript.mjs'

const {
  parseCsv,
  repairSapDescriptions,
  buildCatalog,
  catalogQuery,
  lexicalRanking,
  hybridRanking
} = loadTs('src/main/localCatalog.ts')
const { localSearchEvidence } = loadTs('src/renderer/src/lib/localEnhancementSearch.ts')

test('CSV preserva aspas, vírgulas e descrições multilinha e rejeita dados truncados', () => {
  const rows = parseCsv(
    '\uFEFF"NAME","Descrição",\r\n"A","texto, com ""aspas""\nsegunda linha",\r\n'
  )
  assert.equal(rows[0]['Descrição'], 'texto, com "aspas"\nsegunda linha')
  assert.throws(() => parseCsv('a,b\n"incompleto'), /aspas/)
  assert.throws(() => parseCsv('a,b\n1,2,3'), /colunas/)
})
test('Exportação SAP com abertura duplicada e fechamento simples não perde o registro', () => {
  const input = 'NAME,Descrição,\n"A","Status ""In Process"",\n"B","normal",'
  const rows = parseCsv(repairSapDescriptions(input, 1))
  assert.equal(rows.length, 2)
  assert.equal(rows[0]['Descrição'], 'Status "In Process"')
})
test('Catálogo cruza interfaces e relações ativas sem criar documento para cada relação', () => {
  const catalog = buildCatalog({
    'BADI_DEFINITION_AND_ATRIBUTES.csv':
      'EXIT_NAME,Descrição,DEVCLASS\nME_PROCESS_PO_CUST,Processamento de pedido de compra,ME',
    'BADI_INTERFACE.csv': 'EXIT_NAME,INTER_NAME\nME_PROCESS_PO_CUST,IF_EX_ME_PROCESS_PO_CUST',
    'BAPIS.csv': 'FUNCNAME,Texto breve,PNAME\nBAPI_PO_CREATE1,Criar pedido,SAPL2012',
    'ENHACEMENT_OBJECTS.csv':
      'ENHNAME,VERSION,OBJ_TYPE,OBJ_NAME\nE1,A,INTF,IF_EX_ME_PROCESS_PO_CUST\nE1,A,CLAS,CL_PO\nE2,I,INTF,IF_EX_ME_PROCESS_PO_CUST'
  })
  assert.equal(catalog.length, 2)
  assert.equal(catalog[0].interface, 'IF_EX_ME_PROCESS_PO_CUST')
  assert.ok(catalog[0].relatedObjects.includes('CLAS:CL_PO'))
  assert.ok(!catalog[0].relatedObjects.includes('ENHO:E2'))
  const lexical = lexicalRanking(catalog, 'ME_PROCESS_PO_CUST')
  assert.equal(
    hybridRanking(lexical, [
      { index: 1, score: 0.99 },
      { index: 0, score: 0.5 }
    ])[0].index,
    0
  )
})
test('busca preserva o requisito técnico e não deixa instruções de apresentação esconderem matches textuais fortes', () => {
  const query = catalogQuery(
    'Validar pedido de compra ME21N/ME22N. Cite o CSV de origem. Não invente métodos.'
  )
  assert.equal(query, 'Validar pedido de compra ME21N/ME22N.')
  assert.equal(
    catalogQuery('Preciso controlar faturamento. Não gere notas fiscais antes da validação.'),
    'Preciso controlar faturamento. Não gere notas fiscais antes da validação.'
  )
  assert.match(
    catalogQuery('Validar pedido. Consulte ME_PROCESS_PO_CUST no catálogo local.'),
    /ME_PROCESS_PO_CUST/
  )
  const catalog = [
    {
      name: 'ME_PROCESS_PO_CUST',
      description: 'Ampliações para processamento do pedido: cliente',
      package: 'ME',
      interface: '',
      program: '',
      relatedObjects: []
    },
    {
      name: '/SAPAPO/CIF_PO_INBOU',
      description: 'BAdI: processamento de entrada dos documento do pedido',
      package: '/SAPAPO/CIF',
      interface: '',
      program: '',
      relatedObjects: []
    }
  ]
  const lexical = lexicalRanking(catalog, query)
  assert.equal(lexical[0].index, 0)
  const semantic = Array.from({ length: 40 }, (_, index) => ({
    index: index + 1,
    score: 0.9 - index / 100
  }))
  assert.ok(hybridRanking(lexical, semantic).some((r) => r.index === 0))
})
test('Feature desativada não produz evidências; fallback informa falta de índice', () => {
  assert.equal(localSearchEvidence({ mode: 'disabled', results: [] }), null)
  assert.match(
    localSearchEvidence({ mode: 'lexical', results: [], warning: 'Índice incompleto' }),
    /Índice incompleto/
  )
})
test('IPC remove audio antigo e impede administracao sem sessao valida', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'abapfy-features-test-'))
  const handlers = new Map(),
    webContents = {}
  const service = loadTs('src/main/localFeatures.ts', {
    electron: {
      app: { getPath: () => temporary, getAppPath: () => temporary },
      dialog: {},
      ipcMain: { handle: (name, fn) => handlers.set(name, fn) }
    }
  })
  service.registerLocalFeatures(() => ({ webContents }))
  const invoke = (name, ...args) =>
    handlers.get(`localFeatures:${name}`)({ sender: webContents }, 'test-user', ...args)
  assert.equal((await invoke('status')).settings.embeddingBackend, 'cpu')
  for (const [name, args] of [
    ['indexCatalog', []],
    ['importCatalog', []],
    ['publishCatalog', []],
    ['setEmbeddingBackend', ['vulkan']],
    ['pickRuntimeFile', ['embeddingModel']]
  ])
    await assert.rejects(invoke(name, ...args), /administrativa/)
  assert.equal(handlers.has('localFeatures:transcribe'), false)
  assert.equal(handlers.has('localFeatures:setEnabled'), false)
  assert.throws(
    () => handlers.get('localFeatures:status')({ sender: {} }, 'test-user'),
    /nao autorizada|não autorizada/
  )
  service.closeLocalFeatures()
})
