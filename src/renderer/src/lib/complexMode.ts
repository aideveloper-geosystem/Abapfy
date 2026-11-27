import type { CompactionSettings } from '../../../shared/compaction'

/** Input budget of the "complex demand" mode; a larger budget configured by the user is kept. */
export const COMPLEX_INPUT_BUDGET = 128000

export function sessionCompaction(settings: CompactionSettings, complex: boolean): CompactionSettings {
  return complex
    ? { ...settings, inputBudget: Math.max(settings.inputBudget, COMPLEX_INPUT_BUDGET) }
    : settings
}

export const COMPLEX_MODE_PROMPT = `## Demanda complexa
Antes de alterar código: leia as fontes necessárias, apresente um mapa curto dos objetos envolvidos (programas, includes, classes, tabelas e dependências entre eles) e um plano em etapas. Implemente um objeto por vez e, ao concluir cada um, registre o que mudou, as interfaces afetadas e as pendências. Antes de reutilizar um nome, assinatura ou campo lido anteriormente, consulte novamente a fonte se o trecho exato não estiver disponível; não reconstrua código de memória. Não afirme que a demanda está concluída enquanto houver etapas pendentes.`
