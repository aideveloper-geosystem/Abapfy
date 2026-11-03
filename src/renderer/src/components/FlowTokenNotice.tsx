import { Info } from 'lucide-react'
import './FlowTokenNotice.css'

export function FlowTokenNotice({ id, compact = false }: { id?: string; compact?: boolean }): JSX.Element {
  return <p id={id} role="note" className={`flow-token-notice${compact ? ' flow-token-notice-compact' : ''}`}>
    <Info size={15} aria-hidden="true" />
    <span><strong>Maior consumo de tokens.</strong>{' '}
      {compact
        ? 'Fluxos com subagentes podem consumir mais tokens e aumentar o custo da API em relação ao modo padrão.'
        : 'Cada agente faz chamadas próprias à API. Ao usar este fluxo, o consumo de tokens e o custo podem ser maiores que no modo padrão, dependendo dos modelos, das etapas e das delegações.'}
    </span>
  </p>
}
