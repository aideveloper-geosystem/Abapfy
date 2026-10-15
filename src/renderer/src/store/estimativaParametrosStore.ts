import { create } from 'zustand'
import { supabase } from '@renderer/lib/supabaseClient'
import { useAuthStore } from '@renderer/store/authStore'

export interface EstimativaParametro {
  id: string
  tipo: string
  objeto: string
  complexidade: string
  analiseEf: number
  espec: number
  codific: number
  testes: number
}

export interface ClienteParametro {
  id: string
  empresa: string
  levantamento: number
  implProposal: number
  espFunc: number
  espTec: number
  codific: number
  traducaoEn: number
  traducaoEs: number
  testeUnitario: number
  testeQas: number
  bppPt: number
  bppEn: number
  bppEs: number
  testeVolume: number
  homologacao: number
  accessControl: number
  homologacao2: number
  goLive: number
  documentacao: number
  gerencia: number
}

const CLIENTE_COLUMNS = [
  'levantamento',
  'impl_proposal',
  'esp_func',
  'esp_tec',
  'codific',
  'traducao_en',
  'traducao_es',
  'teste_unitario',
  'teste_qas',
  'bpp_pt',
  'bpp_en',
  'bpp_es',
  'teste_volume',
  'homologacao',
  'access_control',
  'homologacao_2',
  'go_live',
  'documentacao',
  'gerencia'
] as const

function mapEstimativaRow(row: Record<string, unknown>): EstimativaParametro {
  return {
    id: row.id as string,
    tipo: row.tipo as string,
    objeto: row.objeto as string,
    complexidade: row.complexidade as string,
    analiseEf: Number(row.analise_ef),
    espec: Number(row.espec),
    codific: Number(row.codific),
    testes: Number(row.testes)
  }
}

function mapClienteRow(row: Record<string, unknown>): ClienteParametro {
  return {
    id: row.id as string,
    empresa: row.empresa as string,
    levantamento: Number(row.levantamento),
    implProposal: Number(row.impl_proposal),
    espFunc: Number(row.esp_func),
    espTec: Number(row.esp_tec),
    codific: Number(row.codific),
    traducaoEn: Number(row.traducao_en),
    traducaoEs: Number(row.traducao_es),
    testeUnitario: Number(row.teste_unitario),
    testeQas: Number(row.teste_qas),
    bppPt: Number(row.bpp_pt),
    bppEn: Number(row.bpp_en),
    bppEs: Number(row.bpp_es),
    testeVolume: Number(row.teste_volume),
    homologacao: Number(row.homologacao),
    accessControl: Number(row.access_control),
    homologacao2: Number(row.homologacao_2),
    goLive: Number(row.go_live),
    documentacao: Number(row.documentacao),
    gerencia: Number(row.gerencia)
  }
}

interface EstimativaParametrosState {
  error: string | null
  loaded: boolean
  loading: boolean
  estimativas: EstimativaParametro[]
  clientes: ClienteParametro[]
  load: () => Promise<void>
  upsertEstimativa: (
    param: Partial<EstimativaParametro> & {
      tipo: string
      objeto: string
      complexidade: string
    }
  ) => Promise<void>
  deleteEstimativa: (id: string) => Promise<void>
  upsertCliente: (param: Partial<ClienteParametro> & { empresa: string }) => Promise<void>
  deleteCliente: (id: string) => Promise<void>
  reset: () => void
}

function currentUserId(): string | null {
  return useAuthStore.getState().user?.id ?? null
}

export const useEstimativaParametrosStore = create<EstimativaParametrosState>((set) => ({
  error: null,
  loaded: false,
  loading: false,
  estimativas: [],
  clientes: [],

  load: async () => {
    const userId = currentUserId()
    if (!userId) return

    set({ loading: true, error: null })

    const [{ data: estimativaRows }, { data: clienteRows, error: clienteError }] = await Promise.all([
      supabase
        .from('estimativa_parametros')
        .select('*')
        .eq('user_id', userId)
        .order('tipo')
        .order('objeto')
        .order('complexidade'),
      supabase.from('cliente_parametros_compartilhados').select('*').order('empresa')
    ])

    set({
      loaded: true,
      loading: false,
      error: clienteError ? 'Não foi possível carregar os parâmetros compartilhados. Confira a conexão e a migration 036.' : null,
      estimativas: (estimativaRows ?? []).map(mapEstimativaRow),
      clientes: (clienteRows ?? []).map(mapClienteRow)
    })
  },

  upsertEstimativa: async (param) => {
    const userId = currentUserId()
    if (!userId) return

    const payload = {
      id: param.id,
      user_id: userId,
      tipo: param.tipo,
      objeto: param.objeto,
      complexidade: param.complexidade,
      analise_ef: param.analiseEf ?? 0,
      espec: param.espec ?? 0,
      codific: param.codific ?? 0,
      testes: param.testes ?? 0
    }

    const { data, error } = await supabase
      .from('estimativa_parametros')
      .upsert(payload, { onConflict: param.id ? 'id' : 'user_id,tipo,objeto,complexidade' })
      .select('*')
      .single()

    if (error || !data) return

    const saved = mapEstimativaRow(data)
    set((state) => ({
      estimativas: state.estimativas.some((item) => item.id === saved.id)
        ? state.estimativas.map((item) => (item.id === saved.id ? saved : item))
        : [...state.estimativas, saved]
    }))
  },

  deleteEstimativa: async (id) => {
    const userId = currentUserId()
    if (!userId) return

    await supabase.from('estimativa_parametros').delete().eq('id', id).eq('user_id', userId)
    set((state) => ({ estimativas: state.estimativas.filter((item) => item.id !== id) }))
  },

  upsertCliente: async (param) => {
    if (!['ADMIN', 'MASTER'].includes(useAuthStore.getState().role ?? '')) { set({ error: 'Somente administradores e master podem modificar parâmetros de cliente.' }); return }
    const userId = currentUserId()
    if (!userId) return

    const payload: Record<string, unknown> = {
      id: param.id,
      empresa: param.empresa
    }
    const keyMap: Record<(typeof CLIENTE_COLUMNS)[number], keyof ClienteParametro> = {
      levantamento: 'levantamento',
      impl_proposal: 'implProposal',
      esp_func: 'espFunc',
      esp_tec: 'espTec',
      codific: 'codific',
      traducao_en: 'traducaoEn',
      traducao_es: 'traducaoEs',
      teste_unitario: 'testeUnitario',
      teste_qas: 'testeQas',
      bpp_pt: 'bppPt',
      bpp_en: 'bppEn',
      bpp_es: 'bppEs',
      teste_volume: 'testeVolume',
      homologacao: 'homologacao',
      access_control: 'accessControl',
      homologacao_2: 'homologacao2',
      go_live: 'goLive',
      documentacao: 'documentacao',
      gerencia: 'gerencia'
    }
    for (const column of CLIENTE_COLUMNS) {
      const field = keyMap[column]
      payload[column] = param[field] ?? 0
    }

    const { data, error } = await supabase
      .from('cliente_parametros_compartilhados')
      .upsert(payload, { onConflict: param.id ? 'id' : 'empresa' })
      .select('*')
      .single()

    if (error || !data) { set({ error: error?.message ?? 'Não foi possível salvar o parâmetro.' }); return }
    set({ error: null })
    const saved = mapClienteRow(data)
    set((state) => ({
      clientes: state.clientes.some((item) => item.id === saved.id)
        ? state.clientes.map((item) => (item.id === saved.id ? saved : item))
        : [...state.clientes, saved]
    }))
  },

  deleteCliente: async (id) => {
    if (!['ADMIN', 'MASTER'].includes(useAuthStore.getState().role ?? '')) { set({ error: 'Somente administradores e master podem modificar parâmetros de cliente.' }); return }
    const userId = currentUserId()
    if (!userId) return

    const { error } = await supabase.from('cliente_parametros_compartilhados').delete().eq('id', id)
    if (error) { set({ error: error.message }); return }
    set({ error: null })
    set((state) => ({ clientes: state.clientes.filter((item) => item.id !== id) }))
  },

  reset: () => set({ error: null, loaded: false, loading: false, estimativas: [], clientes: [] })
}))

/**
 * Busca os parâmetros diretamente do Supabase (sem depender do estado já carregado
 * na store) e formata como tabelas Markdown para injeção automática no prompt do
 * agente Estimador de Esforço — garante que o agente sempre consulte os valores
 * mais recentes no momento do pedido ("tempo real"), mesmo que a tela de
 * Configurações nunca tenha sido aberta nesta sessão.
 */
export async function fetchParametrosContextBlock(userId: string): Promise<string> {
  const [estimativaResult, clienteResult] = await Promise.all([
    supabase
      .from('estimativa_parametros')
      .select('tipo, objeto, complexidade, analise_ef, espec, codific, testes')
      .eq('user_id', userId)
      .order('tipo')
      .order('objeto')
      .order('complexidade'),
    supabase.from('cliente_parametros_compartilhados').select('*').order('empresa')
  ])
  const estimativaRows = estimativaResult.data
  const clienteRows = clienteResult.data

  const estimativaLines = (estimativaRows ?? []).map(
    (row) =>
      `| ${row.tipo} | ${row.objeto} | ${row.complexidade} | ${row.analise_ef} | ${row.espec} | ${row.codific} | ${row.testes} |`
  )

  const clienteLines = (clienteRows ?? []).map((row) => {
    const values = CLIENTE_COLUMNS.map((column) => row[column]).join(' | ')
    return `| ${row.empresa} | ${values} |`
  })

  const estimativaTable =
    estimativaLines.length > 0
      ? [
          '| tipo | objeto | complexidade | analise_ef | espec | codific | testes |',
          '| --- | --- | --- | --- | --- | --- | --- |',
          ...estimativaLines
        ].join('\n')
      : '_(vazia — nenhum parâmetro de estimativa cadastrado em Configurações → Parâmetros)_'

  const clienteTable =
    clienteLines.length > 0
      ? [
          `| empresa | ${CLIENTE_COLUMNS.join(' | ')} |`,
          `| --- | ${CLIENTE_COLUMNS.map(() => '---').join(' | ')} |`,
          ...clienteLines
        ].join('\n')
      : '_(vazia — nenhum cliente cadastrado em Configurações → Parâmetros)_'

  return [
    ...(estimativaResult.error || clienteResult.error
      ? [
          '## Atenção: falha ao carregar parâmetros',
          'Não gere totais como se os parâmetros estivessem disponíveis. Informe ao usuário que não foi possível consultar Configurações → Parâmetros nesta solicitação.',
          ''
        ]
      : []),
    '## Tabela de Parâmetros de Estimativa',
    estimativaTable,
    '',
    '## Tabela de Parâmetros de Cliente',
    clienteTable
  ].join('\n')
}
