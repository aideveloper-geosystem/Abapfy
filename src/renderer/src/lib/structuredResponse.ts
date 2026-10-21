/**
 * Detecção universal de "resposta estruturada" — cada agente do harness tem seu
 * próprio esquema JSON (ver supabase/sql/006_default_agents_seed.sql), mas todos
 * devolvem ou markdown livre (Abaper, Editor, Code Review em modo conversa) ou um
 * objeto JSON como resposta inteira (Consultor, DTec, Effort Estimator, Enhancement
 * Finder, Performance Analyzer). Em vez de um componente por agente, detectamos
 * pelo FORMATO da resposta (objeto JSON, com ou sem fence) e renderizamos com
 * StructuredJson.tsx, que se adapta à forma dos dados.
 */

export function extractSoleJsonBlock(content: string): string {
  const trimmed = content.trim()
  const fenced = trimmed.match(/^```[\w-]*\r?\n([\s\S]*?)\r?\n?```$/)
  return fenced ? fenced[1].trim() : trimmed
}

export type StructuredValue =
  string | number | boolean | null | StructuredValue[] | { [key: string]: StructuredValue }

export function parseStructuredJson(content: string): Record<string, StructuredValue> | null {
  const candidate = extractSoleJsonBlock(content)
  if (!candidate.startsWith('{') || !candidate.endsWith('}')) return null

  try {
    const parsed = JSON.parse(candidate)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      if (Object.keys(parsed).length < 2) return null
      return parsed as Record<string, StructuredValue>
    }
    return null
  } catch {
    return null
  }
}
