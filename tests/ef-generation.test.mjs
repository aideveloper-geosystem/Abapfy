import test from 'node:test'
import assert from 'node:assert/strict'
import PizZip from 'pizzip'
import { loadTs } from './load-typescript.mjs'

const { calculateEfEstimate, efEstimateBlocks } = loadTs('src/renderer/src/lib/efEstimate.ts')
const { recalculateEstimate } = loadTs('src/renderer/src/lib/estimateCards.ts')
const templates = loadTs('src/renderer/src/lib/efTemplate.ts')
const { generateEfDocx } = loadTs('src/renderer/src/lib/efDocx.ts')
const input = {
  complexidade_geral: 'Média',
  objetos: [
    {
      nome: 'Relatório de consulta',
      tipo: 'Report',
      objeto: 'Novo',
      complexidade: 'Média',
      resumo: 'Consulta com validações',
      justificativa: 'Dois filtros e tratamento de ausência de resultados.'
    }
  ],
  premissas: ['Escopo funcional confirmado'],
  riscos: ['Volume a validar']
}
const source = {
  capturedAt: '2026-10-23T15:00:00.000Z',
  parameters: [
    {
      id: 'p1',
      tipo: 'Report',
      objeto: 'Novo',
      complexidade: 'Média',
      analiseEf: 4,
      espec: 8,
      codific: 20,
      testes: 4
    }
  ],
  clients: [
    { id: 'c1', empresa: 'Farmativa', espFunc: 1.2, espTec: 1.1, codific: 1.3, testeUnitario: 1.4 }
  ]
}

test('EF estimates use the same deterministic calculator and selected-client factors', () => {
  const result = calculateEfEstimate(input, 'Farmativa', source)
  assert.equal(result.status, 'calculated')
  const empty = () => ({
    totalHoras: 0,
    multiplicador: 99,
    distribuicao: {},
    premissas: [],
    riscos: []
  })
  const expected = recalculateEstimate(
    {
      cliente: 'Farmativa',
      objetosIdentificados: input.objetos,
      estimativas: { agressiva: empty(), segura: empty(), tranquila: empty() }
    },
    {},
    source.parameters,
    source.clients
  )
  for (const scenario of ['agressiva', 'segura', 'tranquila']) {
    assert.equal(
      result.data.estimativas[scenario].totalHoras,
      expected.data.estimativas[scenario].totalHoras
    )
    assert.equal(
      JSON.stringify(result.data.estimativas[scenario].distribuicao),
      JSON.stringify(expected.data.estimativas[scenario].distribuicao)
    )
  }
  assert.equal(result.data.estimativas.segura.totalHoras, 45.2)
  assert.match(JSON.stringify(efEstimateBlocks(result, 'estimate_summary')), /Fora do total/)
})

test('missing client, ambiguous rows, repeated objects and model-authored hours remain pending', () => {
  for (const [request, parameters] of [
    [input, { ...source, clients: [] }],
    [input, { ...source, parameters: [] }],
    [input, { ...source, parameters: [...source.parameters, ...source.parameters] }],
    [input, { ...source, clients: [...source.clients, ...source.clients] }],
    [{ ...input, objetos: [...input.objetos, ...input.objetos] }, source],
    [{ ...input, total_horas: 9999 }, source],
    [input, { ...source, parameters: [{ ...source.parameters[0], codific: -1 }] }],
    [input, { ...source, error: 'Consulta indisponível' }]
  ]) {
    const result = calculateEfEstimate(request, 'Farmativa', parameters)
    assert.equal(result.status, 'pending')
    assert.equal(result.data, undefined)
    const blocks = JSON.stringify(efEstimateBlocks(result, 'estimate_summary'))
    assert.match(blocks, /Estimativa pendente/)
    assert.ok(!blocks.includes('Total das fases calculadas'))
  }
})

function buffer() {
  const zip = new PizZip()
  const p = (slot) =>
    `<w:p><w:pPr><w:pStyle w:val="ClientBody"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/><w:color w:val="445566"/></w:rPr><w:t>[[EF:${slot}]] Instrução a substituir.</w:t></w:r></w:p>`
  zip.file(
    'word/document.xml',
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:color="123456"/></w:tblBorders></w:tblPr><w:tr><w:tc><w:tcPr><w:tcW w:w="8000" w:type="dxa"/><w:shd w:fill="D9D9D9"/></w:tcPr>${['author', 'issue_date', 'context', 'objectives', 'process', 'scope', 'out_of_scope', 'acceptance', 'risks', 'estimate_functional', 'estimate_development', 'estimate_objects', 'estimate_summary'].map(p).join('')}</w:tc></w:tr></w:tbl><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`
  )
  zip.file(
    'word/styles.xml',
    '<w:styles><w:style w:type="paragraph" w:styleId="ClientBody"><w:pPr><w:jc w:val="left"/></w:pPr></w:style></w:styles>'
  )
  zip.file('word/settings.xml', '<w:settings><w:zoom w:percent="100"/></w:settings>')
  zip.file('word/header1.xml', '<w:hdr><w:p><w:r><w:t>Instituição</w:t></w:r></w:p></w:hdr>')
  zip.file('word/media/logo.png', new Uint8Array([1, 2, 3]))
  return zip.generate({ type: 'arraybuffer' })
}
const dataFor = (snapshot, type) => ({
  specification_type: type,
  project_name: 'Consulta de exemplo',
  author: 'Autor enviado pelo modelo',
  client_name: 'Farmativa',
  module: 'ABAP',
  functional_spec: 'Regras documentadas',
  template_revision: snapshot.revision,
  template_edits: snapshot.paragraphs
    .filter((p) => p.slot && !p.slot.startsWith('estimate_'))
    .map((p) => ({
      paragraph_id: p.id,
      ...(p.slot === 'author' || p.slot === 'issue_date'
        ? { text: 'Valor incorreto' }
        : {
            blocks: [
              { type: 'heading', text: 'Conteúdo da seção' },
              { type: 'paragraph', text: 'Regra funcional com tratamento de erros.' },
              { type: 'table', headers: ['Entrada', 'Saída'], rows: [['Filtro', 'Resultado']] }
            ]
          })
    }))
})

test('all three EF types preserve local typography, table colors, logo and headers and fill calculated slots', async () => {
  const snapshot = await templates.readEfTemplate(buffer())
  const estimate = calculateEfEstimate(input, 'Farmativa', source)
  assert.equal(snapshot.paragraphs.find((p) => p.part === 'word/header1.xml').editable, false)
  for (const type of ['simples', 'tecnica', 'avancada']) {
    const blob = await generateEfDocx(dataFor(snapshot, type), snapshot, estimate, {
      author: 'Consultor autenticado',
      clientName: 'Farmativa',
      module: 'ABAP',
      issueDate: '23/10/2026'
    })
    const zip = new PizZip(await blob.arrayBuffer())
    const xml = zip.file('word/document.xml').asText()
    assert.match(xml, /w:ascii="Arial"/)
    assert.match(xml, /w:fill="D9D9D9"/)
    assert.match(xml, /w:color="123456"/)
    assert.match(xml, /w:color w:val="445566"/)
    assert.ok(!xml.includes('Calibri'))
    assert.ok(!xml.includes('[[EF:'))
    assert.ok(!xml.includes('Instrução a substituir'))
    assert.ok(!xml.includes('Valor incorreto'))
    assert.match(xml, /Consultor autenticado/)
    assert.match(xml, /45,2 h/)
    assert.equal(
      zip.file('word/header1.xml').asText(),
      new PizZip(snapshot.buffer).file('word/header1.xml').asText()
    )
    assert.equal(
      zip.file('word/styles.xml').asText(),
      new PizZip(snapshot.buffer).file('word/styles.xml').asText()
    )
    assert.deepEqual(Array.from(zip.file('word/media/logo.png').asUint8Array()), [1, 2, 3])
    assert.match(zip.file('word/settings.xml').asText(), /updateFields/)
  }
})

test('guided generation rejects unselected EF level, missing narrative and leaked markers', async () => {
  const snapshot = await templates.readEfTemplate(buffer())
  const data = dataFor(snapshot, 'simples')
  await assert.rejects(
    generateEfDocx({ ...data, specification_type: undefined }, snapshot),
    /Escolha o tipo/
  )
  await assert.rejects(generateEfDocx({ ...data, template_edits: [] }, snapshot), /seção context/)
  const edits = data.template_edits.map((edit) =>
    edit.paragraph_id === snapshot.paragraphs.find((p) => p.slot === 'context').id
      ? { paragraph_id: edit.paragraph_id, text: '[[EF:context]] Não preenchido' }
      : edit
  )
  await assert.rejects(
    generateEfDocx({ ...data, template_edits: edits }, snapshot),
    /campos EF sem preenchimento/
  )
  const pending = await generateEfDocx(data, snapshot)
  assert.match(templates.efDocxText(await pending.arrayBuffer()), /Estimativa pendente/)
})

test('short text edits preserve paragraph tab-stop definitions instead of turning layout into text', async () => {
  const zip = new PizZip()
  const pPr =
    '<w:pPr><w:tabs><w:tab w:val="center" w:pos="4612"/><w:tab w:val="right" w:pos="8864"/></w:tabs></w:pPr>'
  zip.file(
    'word/document.xml',
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p>${pPr}<w:r><w:t>INSIRA CONSULTOR</w:t></w:r></w:p></w:body></w:document>`
  )
  const snapshot = await templates.readEfTemplate(zip.generate({ type: 'arraybuffer' }))
  assert.equal(snapshot.paragraphs[0].text, 'INSIRA CONSULTOR')
  const blob = templates.applyEfTemplateEdits(snapshot, snapshot.revision, [
    { paragraph_id: '0:p0', text: 'Consultor atual' }
  ])
  const xml = new PizZip(await blob.arrayBuffer()).file('word/document.xml').asText()
  assert.ok(xml.includes(pPr))
  assert.match(xml, /<w:t xml:space="preserve">Consultor atual<\/w:t>/)
})

test('EF parameter lookup filters the selected client and refuses account changes', async () => {
  let account = 'user-a'
  const calls = []
  let changeAccount = false
  const hours = {
    id: 'p1',
    tipo: 'Report',
    objeto: 'Novo',
    complexidade: 'Média',
    analise_ef: 4,
    espec: 8,
    codific: 20,
    testes: 4
  }
  const supabase = {
    from(table) {
      const query = {
        select() {
          return query
        },
        eq(field, value) {
          calls.push([table, field, value])
          return query
        },
        then(resolve, reject) {
          if (changeAccount) account = 'user-b'
          return Promise.resolve({
            data:
              table === 'estimativa_parametros'
                ? [hours]
                : [
                    {
                      id: 'c1',
                      empresa: 'Farmativa',
                      esp_func: 1,
                      esp_tec: 1,
                      codific: 1,
                      teste_unitario: 1
                    },
                    { id: 'c2', empresa: 'Outro cliente', esp_func: 99 }
                  ],
            error: null
          }).then(resolve, reject)
        }
      }
      return query
    }
  }
  const { fetchEfEstimateParameters } = loadTs(
    'src/renderer/src/store/estimativaParametrosStore.ts',
    {
      '@renderer/lib/supabaseClient': { supabase },
      '@renderer/store/authStore': { useAuthStore: { getState: () => ({ user: { id: account } }) } }
    }
  )
  const snapshot = await fetchEfEstimateParameters('user-a', 'farmativa')
  assert.equal(snapshot.parameters[0].codific, 20)
  assert.equal(snapshot.clients.length, 1)
  assert.equal(snapshot.clients[0].empresa, 'Farmativa')
  assert.deepEqual(calls, [['estimativa_parametros', 'user_id', 'user-a']])
  await assert.rejects(fetchEfEstimateParameters('user-b', 'Farmativa'), /sessão mudou/)
  changeAccount = true
  await assert.rejects(fetchEfEstimateParameters('user-a', 'Farmativa'), /sessão mudou/)
})
