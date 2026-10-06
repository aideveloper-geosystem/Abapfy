export interface ModelPricingRow {
  id: string
  provider: 'openai' | 'gemini' | 'claude'
  model_id: string
  label: string
  input_price_per_million: number
  output_price_per_million: number
  notes: string | null
  updated_at: string
}

export type PricingIndex = Map<string, ModelPricingRow>

export function buildPricingIndex(rows: ModelPricingRow[]): PricingIndex {
  return new Map(rows.map((row) => [row.model_id, row]))
}

/** US$ estimado para um turno — null quando o modelo não tem preço cadastrado (não confunde com custo 0). */
export function estimateCostUsd(
  modelId: string | null,
  tokensInput: number | null,
  tokensOutput: number | null,
  pricing: PricingIndex
): number | null {
  if (!modelId) return null
  const price = pricing.get(modelId)
  if (!price) return null
  const input = ((tokensInput ?? 0) / 1_000_000) * price.input_price_per_million
  const output = ((tokensOutput ?? 0) / 1_000_000) * price.output_price_per_million
  return input + output
}
