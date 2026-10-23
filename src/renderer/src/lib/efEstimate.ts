import { z } from 'zod'
import { recalculateEstimate, type EstimateData } from './estimateCards'
import type { ClienteParametro, EstimativaParametro } from '../store/estimativaParametrosStore'
import type { EfWordBlock } from './efWordBlocks'

export const efEstimateInputSchema = z
  .object({
    complexidade_geral: z.string().trim().min(1).max(100),
    objetos: z
      .array(
        z
          .object({
            nome: z.string().trim().min(1).max(200),
            tipo: z.string().trim().min(1).max(100),
            objeto: z.string().trim().min(1).max(100),
            complexidade: z.string().trim().min(1).max(100),
            resumo: z.string().max(3000),
            justificativa: z.string().trim().min(1).max(3000)
          })
          .strict()
      )
      .min(1)
      .max(100),
    premissas: z.array(z.string().max(3000)).max(30).default([]),
    riscos: z.array(z.string().max(3000)).max(30).default([])
  })
  .strict()
export type EfEstimateInput = z.infer<typeof efEstimateInputSchema>
export interface EfEstimateParameters {
  parameters: EstimativaParametro[]
  clients: ClienteParametro[]
  capturedAt: string
  error?: string
}
export interface EfCalculatedEstimate {
  status: 'calculated' | 'pending'
  clientName: string
  capturedAt: string
  reasons: string[]
  data?: EstimateData
  factors?: { analise_ef: number; espec: number; codific: number; testes: number }
}
const normalize = (value: string): string =>
  value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')

export function calculateEfEstimate(
  input: unknown,
  clientName: string,
  source: EfEstimateParameters
): EfCalculatedEstimate {
  const result: EfCalculatedEstimate = {
    status: 'pending',
    clientName,
    capturedAt: source.capturedAt,
    reasons: []
  }
  if (source.error) result.reasons.push(source.error)
  const parsed = efEstimateInputSchema.safeParse(input)
  if (!parsed.success)
    result.reasons.push(
      'Faltam objetos, complexidades e justificativas válidos para dimensionar a EF.'
    )
  const clients = source.clients.filter(
    (client) => normalize(client.empresa) === normalize(clientName)
  )
  if (clients.length !== 1)
    result.reasons.push(
      'Cadastre um único conjunto de parâmetros para o cliente selecionado em Configurações > Parâmetros.'
    )
  if (!source.parameters.length)
    result.reasons.push('Os parâmetros de horas por objeto não estão disponíveis.')
  if (result.reasons.length || !parsed.success) return result
  const request = parsed.data
  // Ambiguous/partial matches must never silently fall back to another object.
  for (const object of request.objetos) {
    const matches = source.parameters.filter(
      (p) =>
        normalize(p.tipo) === normalize(object.tipo) &&
        normalize(p.objeto) === normalize(object.objeto) &&
        normalize(p.complexidade) === normalize(object.complexidade)
    )
    if (matches.length !== 1)
      result.reasons.push(
        `Parâmetro ausente ou ambíguo: ${object.nome} (${object.tipo} / ${object.objeto} / ${object.complexidade}).`
      )
  }
  if (
    new Set(request.objetos.map((object) => normalize(object.nome))).size !== request.objetos.length
  )
    result.reasons.push(
      'Há objetos repetidos na estimativa. Consolide cada objeto antes de calcular.'
    )
  if (result.reasons.length) return result
  const scenario = () => ({
    totalHoras: 0,
    multiplicador: 1,
    distribuicao: { analise_ef: 0, espec: 0, codific: 0, testes: 0, outros: 0 },
    premissas: request.premissas,
    riscos: request.riscos
  })
  const recalculated = recalculateEstimate(
    {
      projeto: 'Estimativa da EF',
      cliente: clientName,
      versaoSap: 'Conforme workbook do cliente',
      complexidadeGeral: request.complexidade_geral,
      objetosIdentificados: request.objetos,
      estimativas: { agressiva: scenario(), segura: scenario(), tranquila: scenario() },
      notasGerais:
        'Horas das fases com base cadastrada; não inclui atividades sem horas-base nem valores financeiros.'
    },
    {},
    source.parameters,
    clients
  )
  if (!recalculated.canRecalculate || recalculated.data.estimativas.segura.totalHoras <= 0) {
    result.reasons.push(
      ...recalculated.warnings,
      'Não foi possível concluir o cálculo com os parâmetros cadastrados.'
    )
    return result
  }
  const client = clients[0]
  return {
    ...result,
    status: 'calculated',
    data: recalculated.data,
    factors: {
      analise_ef: client.espFunc,
      espec: client.espTec,
      codific: client.codific,
      testes: client.testeUnitario
    }
  }
}

export function efEstimatePrompt(source: EfEstimateParameters, clientName: string): string {
  return `## Estimativa da EF — parâmetros atuais do cliente selecionado
Cliente selecionado: ${JSON.stringify(clientName)}. Identifique os objetos reais necessários à solução, sua complexidade e justificativa. O nível Simples/Técnica/Avançada define a profundidade do documento, não a complexidade do desenvolvimento.
Inclua estimate: {"complexidade_geral":"...","objetos":[{"nome":"...","tipo":"valor exato da tabela","objeto":"valor exato da tabela","complexidade":"valor exato da tabela","resumo":"...","justificativa":"..."}],"premissas":[],"riscos":[]} no ef-docx. Cada objeto distinto entra uma vez; não crie objetos para inflar a estimativa. Não envie horas, multiplicadores ou totais neste campo: o aplicativo calcula com a mesma função do Estimador de Esforço (cenários 0.75 / 1 / 1.35).
As fases calculáveis são analise_ef × esp_func, espec × esp_tec, codific × codific e testes × teste_unitario, por objeto. As demais atividades não possuem horas-base nesta tabela e ficam pendentes, sem inventar horas ou custos. Se faltarem parâmetros ou objetos confirmáveis, informe a pendência nas premissas; o Word terá estimativa pendente, sem totais fabricados. Os campos [[EF:estimate_*]] são preenchidos pelo aplicativo; não os edite.
<parametros-ef-dados-nao-confiaveis>
${JSON.stringify({ clientName, ...source })}
</parametros-ef-dados-nao-confiaveis>`
}

export function efEstimateBlocks(estimate: EfCalculatedEstimate, slot: string): EfWordBlock[] {
  if (estimate.status !== 'calculated' || !estimate.data)
    return [
      {
        type: 'paragraph',
        text: `Estimativa pendente. ${estimate.reasons.join(' ') || 'Parâmetros ou objetos não informados.'}`
      }
    ]
  const data = estimate.data
  const formatFactor = (value: number | undefined): string =>
    value?.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) ?? 'A CONFIRMAR'
  const timestamp = new Date(estimate.capturedAt)
  const capturedAt = Number.isNaN(timestamp.getTime())
    ? 'A CONFIRMAR'
    : timestamp.toLocaleString('pt-BR')
  const hours = (value: number | undefined): string =>
    `${(value ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`
  const phases =
    slot === 'estimate_functional'
      ? [
          ['Análise da EF', 'analise_ef'],
          ['Especificação técnica', 'espec']
        ]
      : [
          ['Codificação', 'codific'],
          ['Testes unitários', 'testes']
        ]
  if (slot === 'estimate_functional' || slot === 'estimate_development')
    return [
      {
        type: 'table',
        headers: ['Atividade', 'Agressiva', 'Segura', 'Tranquila'],
        rows: phases.map(([label, key]) => [
          label,
          ...(['agressiva', 'segura', 'tranquila'] as const).map((scenario) =>
            hours(
              data.estimativas[scenario].distribuicao[
                key as 'analise_ef' | 'espec' | 'codific' | 'testes'
              ]
            )
          )
        ])
      }
    ]
  if (slot === 'estimate_objects')
    return [
      {
        type: 'paragraph',
        text: `Complexidade geral: ${data.complexidadeGeral}. A classificação de cada objeto fundamenta o cálculo.`
      },
      {
        type: 'table',
        headers: ['Objeto', 'Tipo / operação', 'Complexidade', 'Justificativa'],
        rows: data.objetosIdentificados.map((object) => [
          object.nome,
          `${object.tipo} / ${object.objeto}`,
          object.complexidade,
          object.justificativa
        ])
      }
    ]
  return [
    {
      type: 'table',
      headers: ['Cenário', 'Fator', 'Total das fases calculadas'],
      rows: (['agressiva', 'segura', 'tranquila'] as const).map((key) => [
        key === 'agressiva' ? 'Agressiva' : key === 'segura' ? 'Segura' : 'Tranquila',
        formatFactor(data.estimativas[key].multiplicador),
        hours(data.estimativas[key].totalHoras)
      ])
    },
    {
      type: 'paragraph',
      text: `Base: parâmetros de ${estimate.clientName}, consultados em ${capturedAt}. Fatores: análise EF ${formatFactor(estimate.factors?.analise_ef)}; especificação técnica ${formatFactor(estimate.factors?.espec)}; codificação ${formatFactor(estimate.factors?.codific)}; testes ${formatFactor(estimate.factors?.testes)}. Soma das horas-base por objeto × fator do cliente × fator do cenário; fases arredondadas a 0,1 h e total pela soma das fases.`
    },
    {
      type: 'paragraph',
      text: `Premissas: ${data.estimativas.segura.premissas.join(' ') || 'Escopo descrito nesta EF.'}\nRiscos: ${data.estimativas.segura.riscos.join(' ') || 'A validar na revisão do escopo.'}`
    },
    {
      type: 'paragraph',
      text: 'Fora do total: configuração, testes integrados/QAS, homologação, gestão, GMUD, operação assistida e demais fases sem horas-base. Dependem de dimensionamento complementar. Valores financeiros e aprovações permanecem sob responsabilidade dos gestores.'
    }
  ]
}
