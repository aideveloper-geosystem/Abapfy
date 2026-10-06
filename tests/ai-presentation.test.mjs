import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-typescript.mjs'

const { parseAiPresentation, displayCell } = loadTs('src/renderer/src/lib/aiPresentation.ts')
const { unifiedCodeDiff } = loadTs('src/renderer/src/lib/codeDiff.ts')
const payload = (blocks) => JSON.stringify({ version: 1, blocks })

test('accepts all five presentation types with explicit evidence and unknown values', () => {
  const data = parseAiPresentation(
    payload([
      {
        type: 'records',
        title: 'Objetos SAP',
        columns: ['Nome', 'Validado'],
        rows: [
          ['ZTEST', false],
          ['ZOTHER', null]
        ]
      },
      {
        type: 'recommendation',
        title: 'Revisar consulta',
        description: 'Avaliar índice',
        evidence: 'Código fornecido; plano não medido',
        action: 'Explique a proposta'
      },
      {
        type: 'insights',
        title: 'Medição',
        items: [
          { label: 'Tempo', value: null, detail: 'Não medido', source: 'Nenhum trace fornecido' }
        ]
      },
      {
        type: 'flow',
        title: 'Rotina',
        steps: [
          {
            title: 'Validar entrada',
            description: 'Conferir parâmetros',
            kind: 'condition',
            branches: ['Válido: continuar', 'Inválido: retornar']
          }
        ]
      },
      {
        type: 'diff',
        title: 'Proposta',
        changes: [{ field: 'Nome', before: 'A', after: 'B', reason: 'Padronização' }]
      }
    ])
  )
  assert.equal(data.blocks.length, 5)
  assert.equal(data.blocks[1].confidence, undefined)
  assert.equal(displayCell(null), 'A confirmar')
  assert.equal(displayCell(false), 'Não')
})

test('rejects malformed, mismatched and excessive model payloads', () => {
  for (const content of [
    '{',
    '[]',
    payload([]),
    payload([{ type: 'records', title: 'X', columns: ['A'], rows: [['a', 'b']] }]),
    payload([
      {
        type: 'records',
        title: 'X',
        columns: ['A'],
        rows: Array.from({ length: 201 }, () => ['x'])
      }
    ]),
    payload([
      {
        type: 'recommendation',
        title: 'X',
        description: 'X',
        evidence: 'X',
        confidence: 'guaranteed'
      }
    ]),
    payload([{ type: 'insights', title: 'X', items: [{ label: 'X', value: 5, detail: 'X' }] }]),
    JSON.stringify({ version: 2, blocks: [{ type: 'flow', title: 'X', steps: [] }] }),
    ' '.repeat(500001)
  ]) {
    assert.equal(parseAiPresentation(content), null)
  }
})

test('unified diff represents insertions, deletions, replacements and unchanged input', () => {
  assert.equal(unifiedCodeDiff('a', 'a'), 'Sem alterações.')
  assert.match(unifiedCodeDiff('', 'a'), /@@ -0,0 \+1,1 @@\n\+a$/)
  assert.match(unifiedCodeDiff('a', ''), /@@ -1,1 \+0,0 @@\n-a$/)
  assert.match(unifiedCodeDiff('a\nb\nc', 'a\nnew\nc'), / a\n-b\n\+new\n c$/)
  assert.match(unifiedCodeDiff('a\nb\nc', 'a\nb\nx\nc'), / b\n\+x\n c$/)
})
