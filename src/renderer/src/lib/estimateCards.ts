export interface EstimateDistribution {
  analise_ef?: number
  espec?: number
  codific?: number
  testes?: number
  outros?: number
}

export interface EstimateScenario {
  totalHoras: number
  multiplicador: number
  distribuicao: EstimateDistribution
  premissas: string[]
  riscos: string[]
}

export interface EstimateObject {
  nome: string
  tipo: string
  objeto: string
  complexidade: string
  resumo: string
  justificativa: string
}

export interface EstimateData {
  projeto: string
  versaoSap: string
  cliente: string
  complexidadeGeral: string
  objetosIdentificados: EstimateObject[]
  estimativas: {
    agressiva: EstimateScenario
    segura: EstimateScenario
    tranquila: EstimateScenario
  }
  notasGerais: string
}

export interface EstimateRecalculation {
  data: EstimateData
  unmatchedObjects: string[]
  clientMatched: boolean
  canRecalculate: boolean
  warnings: string[]
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function normalize(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function roundHours(value: number): number {
  return Math.round(value * 10) / 10
}

function scenarioMultiplier(key: 'agressiva' | 'segura' | 'tranquila'): number {
  // The three scenarios have fixed factors; model-supplied factors cannot
  // silently change the deterministic pricing contract.
  return key === 'agressiva' ? 0.75 : key === 'segura' ? 1 : 1.35
}

export function findEstimateParameter(
  object: EstimateObject,
  complexity: string,
  parameters: EstimativaParametro[]
): EstimativaParametro | null {
  const candidates = parameters.filter(
    (item) =>
      normalize(item.tipo) === normalize(object.tipo) &&
      normalize(item.complexidade) === normalize(complexity)
  )
  if (object.objeto) {
    return candidates.find((item) => normalize(item.objeto) === normalize(object.objeto)) ?? null
  }
  if (candidates.length === 1) return candidates[0]
  return candidates.find((item) => normalize(item.objeto) === 'alteracao') ?? candidates[0] ?? null
}

export function recalculateEstimate(
  original: EstimateData,
  complexities: Record<string, string>,
  parameters: EstimativaParametro[],
  clients: ClienteParametro[]
): EstimateRecalculation {
  const unmatchedObjects: string[] = []
  const warnings: string[] = []
  const base = { analise_ef: 0, espec: 0, codific: 0, testes: 0, outros: 0 }

  const objects = original.objetosIdentificados.map((object, index) => {
    const key = `${index}-${object.nome}`
    const complexidade = complexities[key] ?? object.complexidade
    const parameter = findEstimateParameter(object, complexidade, parameters)
    if (!parameter) unmatchedObjects.push(object.nome)
    else {
      if (
        [parameter.analiseEf, parameter.espec, parameter.codific, parameter.testes].some(
          (hours) => !Number.isFinite(hours) || hours < 0
        )
      ) {
        warnings.push(`Parâmetros de horas inválidos para ${object.nome}.`)
      }
      base.analise_ef += parameter.analiseEf
      base.espec += parameter.espec
      base.codific += parameter.codific
      base.testes += parameter.testes
    }
    return { ...object, complexidade }
  })

  const client = original.cliente
    ? clients.find((item) => normalize(item.empresa) === normalize(original.cliente))
    : undefined
  const factoredBase = {
    analise_ef: base.analise_ef * (client?.espFunc ?? 1),
    espec: base.espec * (client?.espTec ?? 1),
    codific: base.codific * (client?.codific ?? 1),
    testes: base.testes * (client?.testeUnitario ?? 1),
    outros: base.outros
  }

  const estimativas = { ...original.estimativas }
  if (Object.values(factoredBase).some((hours) => !Number.isFinite(hours) || hours < 0)) {
    warnings.push('Fatores do cliente inválidos. Revise os parâmetros antes de recalcular.')
  }
  (['agressiva', 'segura', 'tranquila'] as const).forEach((key) => {
    const previous = original.estimativas[key]
    const sum = Object.values(previous.distribuicao).reduce(
      (total, hours) => total + (hours ?? 0),
      0
    )
    if (Math.abs(previous.totalHoras - sum) > 0.2) {
      warnings.push(
        `Cenário ${key}: o total informado não corresponde à distribuição. Revise as fases antes de recalcular.`
      )
    }
    const multiplier = scenarioMultiplier(key)
    const distribuicao = Object.fromEntries(
      Object.entries(factoredBase).map(([phase, hours]) => [phase, roundHours(hours * multiplier)])
    ) as EstimateDistribution
    // Additional activities have their own source and are independent of the
    // editable object complexity. Preserve each scenario's hours as supplied.
    distribuicao.outros = previous.distribuicao.outros ?? 0
    estimativas[key] = {
      ...original.estimativas[key],
      multiplicador: multiplier,
      distribuicao,
      totalHoras: roundHours(
        Object.values(distribuicao).reduce((sum, value) => sum + (value ?? 0), 0)
      )
    }
  })

  const canRecalculate =
    objects.length > 0 && unmatchedObjects.length === 0 && warnings.length === 0
  return {
    data: canRecalculate ? { ...original, objetosIdentificados: objects, estimativas } : original,
    unmatchedObjects,
    clientMatched: Boolean(client),
    canRecalculate,
    warnings
  }
}

function parseScenario(value: unknown): EstimateScenario | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (typeof raw.total_horas !== 'number') return null
  if (!Number.isFinite(raw.total_horas) || raw.total_horas < 0) return null

  const distribuicaoRaw =
    raw.distribuicao && typeof raw.distribuicao === 'object'
      ? (raw.distribuicao as Record<string, unknown>)
      : {}
  if (
    Object.values(distribuicaoRaw).some(
      (hours) => typeof hours !== 'number' || !Number.isFinite(hours) || hours < 0
    )
  )
    return null

  return {
    totalHoras: asNumber(raw.total_horas),
    multiplicador: asNumber(raw.multiplicador),
    distribuicao: {
      analise_ef: asNumber(distribuicaoRaw.analise_ef),
      espec: asNumber(distribuicaoRaw.espec),
      codific: asNumber(distribuicaoRaw.codific),
      testes: asNumber(distribuicaoRaw.testes),
      outros: asNumber(distribuicaoRaw.outros)
    },
    premissas: asStringArray(raw.premissas),
    riscos: asStringArray(raw.riscos)
  }
}

function parseObjects(value: unknown): EstimateObject[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      nome: asString(item.nome, 'Objeto não identificado'),
      tipo: asString(item.tipo, 'A CONFIRMAR'),
      objeto: asString(item.objeto, ''),
      complexidade: asString(item.complexidade, 'Media'),
      resumo: asString(item.resumo, asString(item.justificativa, '')),
      justificativa: asString(item.justificativa, '')
    }))
}

/**
 * Detecta e normaliza a resposta do agente "Estimador de Esforço ABAP" (ver
 * schema em supabase/sql/006_default_agents_seed.sql) pelo formato dos dados —
 * exige os três cenários com total_horas para não confundir com o JSON de outro
 * agente do harness.
 */
export function parseEstimateData(raw: string): EstimateData | null {
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null

    const estimativasRaw = parsed.estimativas
    if (!estimativasRaw || typeof estimativasRaw !== 'object') return null

    const agressiva = parseScenario(estimativasRaw.agressiva)
    const segura = parseScenario(estimativasRaw.segura)
    const tranquila = parseScenario(estimativasRaw.tranquila)
    if (!agressiva || !segura || !tranquila) return null

    return {
      projeto: asString(parsed.projeto, 'Projeto'),
      versaoSap: asString(parsed.versao_sap, 'A CONFIRMAR'),
      cliente: asString(parsed.cliente, ''),
      complexidadeGeral: asString(parsed.complexidade_geral, 'A CONFIRMAR'),
      objetosIdentificados: parseObjects(parsed.objetos_identificados),
      estimativas: { agressiva, segura, tranquila },
      notasGerais: asString(parsed.notas_gerais, '')
    }
  } catch {
    return null
  }
}
import type {
  ClienteParametro,
  EstimativaParametro
} from '@renderer/store/estimativaParametrosStore'
