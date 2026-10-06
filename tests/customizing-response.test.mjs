import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './load-typescript.mjs'

const { customizingMarkdown, isCustomizingResponse } = loadTs('src/renderer/src/lib/customizingResponse.ts')

test('legacy Customizing answers show distinct IMG trees and transaction identifiers without ABAP fences', () => {
  const data = {
    summary: 'Verificar determinação organizacional.',
    img_path: ['Estrutura Empresarial > Definição > Definir centro', 'Logistics Execution > Expedição > Determinação'],
    transactions: [{ code: 'OX10', purpose: 'Verificar centro', evidence: 'documented' }, { code: 'SE18 / SE19', purpose: 'Consulta', evidence: 'a_confirmar' }],
    configuration_steps: [{ step: 1, action: 'Comparar DEV e QAS', expected_result: 'Diferenças identificadas' }]
  }
  assert.equal(isCustomizingResponse(data), true)
  const rendered = customizingMarkdown(data)
  assert.match(rendered, /- Estrutura Empresarial\n  - Definição\n    - Definir centro/)
  assert.match(rendered, /- Logistics Execution\n  - Expedição\n    - Determinação/)
  assert.match(rendered, /\| SE18 \/ SE19 \| Consulta \| — \| A confirmar \|/)
  assert.match(rendered, /\*\*Resultado esperado:\*\* Diferenças identificadas/)
  assert.equal(rendered.includes('```'), false)
})

test('new answers preserve separate paths, tables, transaction steps and functional validation', () => {
  const rendered = customizingMarkdown({
    img_paths: [{ title: 'Centro', levels: ['SPRO', 'IMG de referência SAP', 'Estrutura Empresarial', 'Definir centro'] }],
    transactions: [{ code: 'OX10', purpose: 'Verificar centro', tables: ['T001W'], steps: ['Selecionar centro', 'Comparar dados'], evidence: 'system_discovered' }],
    validation: [{ step: 1, action: 'Validar cenário em QAS', expected_result: 'Resultado confirmado' }],
    transport: { required: 'yes', guidance: 'Registrar ordem em DEV' },
    open_points: []
  })
  assert.match(rendered, /### Centro\n\n- SPRO\n  - IMG de referência SAP/)
  assert.match(rendered, /\| OX10 \| Verificar centro \| T001W \| Encontrado no sistema \|/)
  assert.match(rendered, /### Etapas — OX10\n\n1\. Selecionar centro\n\n2\. Comparar dados/)
  assert.match(rendered, /## Validação funcional/)
  assert.match(rendered, /\*\*Necessário:\*\* Sim/)
  assert.equal(rendered.includes('Pontos a confirmar'), false)
})

test('untrusted identifiers cannot inject code fences, HTML or extra table columns', () => {
  const rendered = customizingMarkdown({ img_path: ['<script>'], transactions: [{ code: '```abap\nWRITE x.\n```', purpose: 'a|b', tables: ['T001W'] }] })
  assert.equal(rendered.includes('```'), false)
  assert.equal(rendered.includes('<script>'), false)
  assert.match(rendered, /a\\\|b/)
  assert.equal(isCustomizingResponse({ code: 'WRITE x.', summary: 'ABAP' }), false)
})
