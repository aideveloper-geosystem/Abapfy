import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadTs } from './load-typescript.mjs'

const presentation = loadTs('src/renderer/src/components/AiPresentation.tsx', {
  './AiInterface.css': {}, '@renderer/lib/aiPresentation': loadTs('src/renderer/src/lib/aiPresentation.ts')
})
const { ToolActivityBadges } = loadTs('src/renderer/src/components/ToolActivityBadges.tsx', {
  './AiPresentation': presentation, './AiInterface.css': {}, './RichText': { RichText: ({ content }) => React.createElement('div', null, content) }
})

test('consulta local permanece visível após concluir e exibe os dados enviados ao agente', () => {
  const html = renderToStaticMarkup(React.createElement(ToolActivityBadges, { items: [{
    id: 'local-enhancements', label: 'Catálogo SAP local · 1 candidato · busca híbrida', kind: 'local', status: 'done',
    localSearch: { query: 'Validar pedido de compra', result: { mode: 'hybrid', results: [{
      id: 'badi:ME_PROCESS_PO_CUST', name: 'ME_PROCESS_PO_CUST', type: 'badi', description: 'Processamento do pedido', source: 'BADI_DEFINITION_AND_ATRIBUTES.csv', package: 'ME', interface: '', program: '', relatedObjects: [], score: .05
    }] } }
  }] }))
  assert.match(html, /Atividade/)
  assert.match(html, /Concluída/)
  assert.match(html, /1 candidato enviado ao agente/)
  assert.match(html, /Validar pedido de compra/)
  assert.match(html, /ME_PROCESS_PO_CUST/)
  assert.match(html, /BADI_DEFINITION_AND_ATRIBUTES.csv/)
})

test('consulta em andamento e erro mantêm a atividade aberta e não inventam resultados', () => {
  for (const status of ['running', 'error']) {
    const html = renderToStaticMarkup(React.createElement(ToolActivityBadges, { items: [{ id: 'local-enhancements', label: 'Consultando catálogo SAP local', kind: 'local', status }] }))
    assert.match(html, /open=""/)
    assert.match(html, /Consultando catálogo SAP local/)
    assert.doesNotMatch(html, /candidatos enviados/)
  }
})
