import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadTs } from './load-typescript.mjs'

const { sessionContextUsage } = loadTs('src/renderer/src/lib/sessionContextUsage.ts')
const { contextTokens, estimateTokens } = loadTs(
  'src/renderer/src/lib/contextCompactor.ts',
  {},
  { TextEncoder }
)
const defaults = { messages: [], basePrompt: '', draft: '', attachments: [] }
const total = (rows) => rows.reduce((sum, row) => sum + row.tokens, 0)
const tokens = (rows, id) => rows.find((row) => row.id === id).tokens

test('context categories conserve the estimate with embedded files, drive, images and prompt sections', () => {
  const basePrompt =
    'Agente\n\n---\n\n## Skills disponíveis para esta sessão\nConhecimento\n\n---\n\n## Workbook do cliente Farmativa\nRegras'
  const preparedPrompt = basePrompt + '\nInstruções e evidências da solicitação'
  const messages = [
    {
      role: 'user',
      content:
        'Pedido\n<attached-files><file name="a.abap">fonte</file></attached-files>\n<contexto-drive>dados</contexto-drive>',
      imageDataUrls: ['data:image/png;base64,AA']
    }
  ]
  const rows = sessionContextUsage({
    ...defaults,
    basePrompt,
    preparedPrompt,
    messages,
    draft: 'novo pedido',
    attachments: [{ content: 'novo arquivo' }]
  })
  assert.equal(
    total(rows),
    contextTokens(messages, preparedPrompt) +
      estimateTokens('novo pedido') +
      estimateTokens('novo arquivo')
  )
  for (const id of ['files', 'drive', 'system', 'skills', 'workbook', 'runtime'])
    assert.ok(tokens(rows, id) > 0, id)
  assert.ok(rows.every((row) => row.tokens >= 0))
})

test('drive evidence prepared outside persisted history is included once', () => {
  const driveContext = '<contexto-drive>arquivo do cliente</contexto-drive>'
  const withSource = [{ role: 'user', content: 'Pedido\n' + driveContext }]
  assert.equal(
    total(sessionContextUsage({ ...defaults, messages: withSource, driveContext })),
    contextTokens(withSource)
  )
  const rows = sessionContextUsage({
    ...defaults,
    messages: [{ role: 'user', content: 'Pedido' }],
    driveContext
  })
  assert.equal(tokens(rows, 'drive'), estimateTokens(driveContext))
})

test('empty sessions and restored summaries do not count discarded history', () => {
  assert.equal(total(sessionContextUsage(defaults)), 0)
  const messages = [
    { role: 'user', content: 'Histórico compactado de 20 mensagens antigas. Resumo.' },
    { role: 'assistant', content: 'Resposta recente' }
  ]
  const rows = sessionContextUsage({ ...defaults, messages })
  assert.equal(total(rows), contextTokens(messages))
  assert.equal(tokens(rows, 'summary'), estimateTokens(messages[0].content) + 8)
  assert.equal(tokens(rows, 'messages'), estimateTokens(messages[1].content) + 8)
})

const { SessionContextPanel } = loadTs('src/renderer/src/components/SessionContextPanel.tsx', {
  './SessionContextPanel.css': {}
})
const props = {
  agentName: 'ABAP',
  files: [],
  skills: [],
  mcps: [],
  environment: 'Farmativa / ABAP',
  sapConnection: null,
  usage: sessionContextUsage(defaults),
  budget: 1000,
  covered: 0,
  compacting: false,
  compactDisabled: true,
  onCompact() {},
  onClose() {}
}

test('panel exposes three collapsed cards, empty SAP state and local estimate semantics', () => {
  const html = renderToStaticMarkup(React.createElement(SessionContextPanel, props))
  for (const label of [
    'Ambiente',
    'Contexto',
    'Conectores',
    'Sem conexão SAP',
    'Nenhuma skill carregada',
    'Estimativa local',
    'orçamento de entrada'
  ])
    assert.ok(html.includes(label), label)
  assert.ok(!html.includes(' open=""'))
  assert.ok(html.includes('disabled=""'))
})

test('panel shows selected SAP metadata, deduplicates skills and bounds overflow meter', () => {
  const html = renderToStaticMarkup(
    React.createElement(SessionContextPanel, {
      ...props,
      sapConnection: { name: 'Farmativa DEV', environment: 'development', client: '100' },
      skills: ['Clean ABAP', 'Clean ABAP'],
      usage: [{ id: 'messages', label: 'Mensagens', tokens: 1200, color: '#3989e8' }]
    })
  )
  for (const value of [
    'Farmativa DEV',
    'Desenvolvimento',
    'Mandante',
    '100',
    'Selecionado',
    'Em uso: 1',
    '120%',
    'aria-valuenow="1000"'
  ])
    assert.ok(html.includes(value), value)
  assert.ok(!html.includes('Conectado'))
  assert.ok(!html.includes('-20%'))
})
