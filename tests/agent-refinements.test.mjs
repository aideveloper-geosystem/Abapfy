import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadTs } from './load-typescript.mjs'

const presentation = loadTs('src/renderer/src/lib/structuredPresentation.ts')
const policy = loadTs('src/renderer/src/lib/agentRefinements.ts')
const technical = loadTs('src/renderer/src/lib/technicalResponse.ts')
const ef = loadTs('src/renderer/src/lib/efDocx.ts', { '../docs/MODELO BASE EF.docx?url': '' })
const estimates = loadTs('src/renderer/src/lib/estimateCards.ts')
const pdf = loadTs('src/renderer/src/lib/dtecPdf.ts')
const { StructuredJson } = loadTs('src/renderer/src/components/StructuredJson.tsx', {
  './CodeBlock': {
    CodeBlock: ({ code }) => React.createElement('pre', { 'data-code': true }, code)
  },
  './StructuredJson.css': {},
  '@renderer/lib/structuredPresentation': presentation
})
const { TechnicalResponse } = loadTs('src/renderer/src/components/TechnicalResponse.tsx', {
  './RichText': loadTs('src/renderer/src/components/RichText.tsx', { './Markdown.css': {} }),
  './AiPresentation': loadTs('src/renderer/src/components/AiPresentation.tsx', { './AiInterface.css': {}, '@renderer/lib/aiPresentation': loadTs('src/renderer/src/lib/aiPresentation.ts') }),
  './CodeComparison': loadTs('src/renderer/src/components/CodeComparison.tsx', {
    './CodeBlock': { CodeBlock: ({ code }) => React.createElement('pre', { 'data-code': true }, code) },
    '@renderer/lib/codeDiff': loadTs('src/renderer/src/lib/codeDiff.ts'),
    './AiInterface.css': {}
  }),
  './StructuredJson': { StructuredJson },
  './TechnicalResponse.css': {},
  '@renderer/lib/technicalResponse': technical
})

test('refinement scope contains only the six approved agents', () => {
  for (const id of ['abaper', 'editor', 'consultor', 'customizing_consultant', 'custom_agent'])
    assert.equal(policy.agentRefinementContract(id), null)
  for (const id of [
    'code_review',
    'performance_analyzer',
    'enhancement_finder',
    'dtec_consultant',
    'ef_consultant',
    'effort_estimator'
  ])
    assert.ok(policy.agentRefinementContract(id))
})

test('prose is rendered as text, while original and suggested ABAP remain code blocks', () => {
  const html = renderToStaticMarkup(
    React.createElement(StructuredJson, {
      data: {
        description: 'Descrição funcional',
        fix_description: 'Orientação da correção',
        original_code: 'WRITE text.',
        suggested_code: 'WRITE safe_text.'
      },
      localized: true
    })
  )
  assert.equal((html.match(/data-code=/g) ?? []).length, 2)
  assert.match(html, /<p[^>]*>Descrição funcional<\/p>/)
  assert.match(html, /<p[^>]*>Orientação da correção<\/p>/)
  assert.equal(presentation.isSourceCodeField('brief_description'), false)
})

test('compatibility can be unknown and identifiers are not invented source locations', () => {
  const html = renderToStaticMarkup(
    React.createElement(StructuredJson, {
      data: { s4hana_compatible: null, confidence: 'hypothesis' },
      localized: true
    })
  )
  assert.match(html, /A confirmar/)
  assert.match(html, /Hipótese/)
  assert.equal(
    technical.technicalLocation({ file: 'ZTEST', line_start: 0, line_end: 0 }),
    'ZTEST · linha a confirmar'
  )
  assert.equal(
    technical.technicalLocation({ file: 'ZTEST', line_start: 12, line_end: 16 }),
    'ZTEST · linha 12–16'
  )
  assert.equal(technical.technicalResponseKind({ specification: {}, business_context: {} }), null)
})

test('enhancement renders Markdown observations and an interactive candidate table without dispatching embedded UI', () => {
  const html = renderToStaticMarkup(React.createElement(TechnicalResponse, { kind: 'enhancement', data: {
    summary: 'Análise parcial', additional_notes: '**Dados extraídos**\n\n- Fonte: BADI.csv\n- Método a confirmar\n\n<script>unsafe()</script>',
    recommendations: [{ name: 'ME_PROCESS_PO_CUST', type: 'BAdI', s4hana_compatible: null, code_skeleton: '' }]
  } }))
  assert.match(html, /<strong>Dados extraídos<\/strong>/)
  assert.match(html, /<li>Fonte: BADI.csv<\/li>/)
  assert.match(html, /Buscar em Comparar candidatos/)
  assert.match(html, /A confirmar/)
  assert.doesNotMatch(html, /<script>/)
})

test('technical review presents comparison, location and explanation without misclassifying prose', () => {
  const data = {
    summary: 'Revisão parcial',
    files_analyzed: ['ZTEST'],
    findings: [
      {
        title: 'Validação ausente',
        file: 'ZTEST',
        line_start: 4,
        line_end: 5,
        severity: 'high',
        description: 'Trecho precisa de validação',
        original_code: 'WRITE text.',
        suggested_code: 'WRITE safe_text.'
      }
    ]
  }
  assert.equal(technical.technicalResponseKind(data), 'review')
  const html = renderToStaticMarkup(
    React.createElement(TechnicalResponse, { data, kind: 'review' })
  )
  assert.match(html, /Código original/)
  assert.match(html, /Proposta de correção/)
  assert.match(html, /linha 4–5/)
  assert.equal((html.match(/data-code=/g) ?? []).length, 2)
  assert.match(html, /<p[^>]*>Trecho precisa de validação<\/p>/)
})

test('enhancement without confirmed compatibility and performance without a score remain explicitly uncertain', () => {
  const enhancement = {
    summary: 'Pesquisa',
    recommendations: [
      { name: 'A confirmar', type: 'BAdI', s4hana_compatible: null, code_skeleton: '' }
    ],
    additional_notes: 'Interface não fornecida'
  }
  const html = renderToStaticMarkup(
    React.createElement(TechnicalResponse, { data: enhancement, kind: 'enhancement' })
  )
  assert.match(html, /<table>/)
  assert.match(html, /A confirmar/)
  assert.equal(html.includes('data-code='), false)
  const performance = renderToStaticMarkup(
    React.createElement(TechnicalResponse, {
      data: { score: null, summary: 'Sem medição', issues: [] },
      kind: 'performance'
    })
  )
  assert.match(performance, /Nota não atribuída/)
})

test('EF follow-up prose cannot automatically become Word, while legacy specifications still work', () => {
  assert.equal(ef.parseEfDocxResponse('O escopo inclui a validação em QAS.', true), null)
  assert.equal(
    ef.parseEfDocxResponse(
      '## Objetivo\nExplicar uma regra\n## Escopo\nConsulta\n## Fluxo\nConsultar',
      true
    ),
    null
  )
  const doc =
    '# Especificação Funcional — Teste\n\n## Objetivo\nObjetivo de teste\n\n## Escopo\nProcesso de teste\n\n## Visão geral\nResumo curto\n\n## Fluxo do processo\nFluxo detalhado\n\n## Critérios de aceite\nValidar resultado'
  const parsed = ef.parseEfDocxResponse(doc, true)
  assert.ok(parsed)
  assert.equal(parsed.macro_overview, 'Resumo curto')
  assert.notEqual(parsed.macro_overview, parsed.functional_spec)
  const structured = { project_name: 'Projeto', functional_spec: 'Documento completo' }
  assert.equal(ef.parseEfDocxResponse(JSON.stringify(structured), false).project_name, 'Projeto')
})

function fixture() {
  const scenario = (multiplier, extras) => ({
    multiplicador: multiplier,
    totalHoras: 10 * multiplier + extras,
    distribuicao: {
      analise_ef: 2 * multiplier,
      espec: 2 * multiplier,
      codific: 4 * multiplier,
      testes: 2 * multiplier,
      outros: extras
    },
    premissas: ['Horas extras fundamentadas'],
    riscos: []
  })
  const data = {
    projeto: 'Teste',
    cliente: 'Cliente',
    objetosIdentificados: [
      { nome: 'ZTEST', tipo: 'Report', objeto: 'Novo', complexidade: 'Baixa' }
    ],
    estimativas: {
      agressiva: scenario(0.75, 3),
      segura: scenario(1, 4),
      tranquila: scenario(1.35, 5)
    }
  }
  const parameters = [
    {
      tipo: 'Report',
      objeto: 'Novo',
      complexidade: 'Baixa',
      analiseEf: 2,
      espec: 2,
      codific: 4,
      testes: 2
    },
    {
      tipo: 'Report',
      objeto: 'Novo',
      complexidade: 'Alta',
      analiseEf: 4,
      espec: 4,
      codific: 8,
      testes: 4
    }
  ]
  const clients = [{ empresa: 'Cliente', espFunc: 0, espTec: 1, codific: 2, testeUnitario: 1 }]
  return { data, parameters, clients }
}

test('complexity changes recalculate four phases and preserve additional hours per scenario', () => {
  const { data, parameters, clients } = fixture()
  const result = estimates.recalculateEstimate(data, { '0-ZTEST': 'Alta' }, parameters, clients)
  assert.equal(result.canRecalculate, true)
  assert.equal(result.data.estimativas.segura.distribuicao.analise_ef, 0)
  assert.equal(result.data.estimativas.segura.distribuicao.codific, 16)
  for (const key of ['agressiva', 'segura', 'tranquila']) {
    const scenario = result.data.estimativas[key]
    assert.equal(scenario.distribuicao.outros, data.estimativas[key].distribuicao.outros)
    assert.equal(
      scenario.totalHoras,
      Math.round(Object.values(scenario.distribuicao).reduce((a, b) => a + b, 0) * 10) / 10
    )
  }
  assert.equal(data.estimativas.segura.totalHoras, 14)
})

test('inconsistent totals, missing object parameters and invalid factors preserve the original estimate', () => {
  const { data, parameters, clients } = fixture()
  data.estimativas.segura.totalHoras = 99
  const inconsistent = estimates.recalculateEstimate(data, {}, parameters, clients)
  assert.equal(inconsistent.canRecalculate, false)
  assert.equal(inconsistent.data, data)
  assert.ok(inconsistent.warnings.length)
  const missing = estimates.recalculateEstimate(data, {}, [], clients)
  assert.equal(missing.data, data)
  assert.deepEqual(Array.from(missing.unmatchedObjects), ['ZTEST'])
  const fresh = fixture()
  fresh.clients[0].codific = NaN
  assert.equal(
    estimates.recalculateEstimate(fresh.data, {}, fresh.parameters, fresh.clients).canRecalculate,
    false
  )
})

test('DTec structured parameters become tables with localized headings and escaped evidence', () => {
  const html = pdf.buildDtecPdfHtml({
    object_name: 'ZTEST',
    coverage: 'partial',
    parameters: [
      {
        name: 'IV_ID',
        direction: 'Importação',
        type: 'CHAR10',
        source: '<script>alert(1)</script>'
      }
    ],
    limitations: ['Include não fornecido'],
    processing_logic: [{ step: 1, routine: 'FORM VALIDATE', action: 'Validar dados' }]
  })
  assert.match(html, /<table>/)
  assert.match(html, /<th>Origem \/ evidência<\/th>/)
  assert.match(html, /Parcial/)
  assert.match(html, /Fluxo de processamento/)
  assert.equal(html.includes('<script>'), false)
})
