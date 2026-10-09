import { Bug, FileCode2, FileText, Search } from 'lucide-react'
import './AiInterface.css'

export const PROMPT_SHORTCUTS = [
  { command: '/compact', label: 'Compactar o contexto da conversa', icon: FileText, prompt: '/compact' },
  {
    command: '/revisar',
    label: 'Revisar código ABAP',
    icon: FileCode2,
    prompt:
      'Revise o código ABAP que vou fornecer, destacando problemas comprovados e propostas de correção.'
  },
  {
    command: '/dump',
    label: 'Investigar um dump',
    icon: Bug,
    prompt:
      'Ajude a investigar este dump SAP. Vou fornecer o erro, o trecho de código e o contexto do ambiente.'
  },
  {
    command: '/documentar',
    label: 'Documentar uma rotina',
    icon: FileText,
    prompt:
      'Documente a rotina SAP que vou fornecer, explicando entradas, processamento, saídas e limitações.'
  },
  {
    command: '/comparar',
    label: 'Comparar alternativas SAP',
    icon: Search,
    prompt:
      'Compare as alternativas SAP que vou indicar, com evidências, vantagens, limitações e compatibilidade do ambiente.'
  }
]

export function PromptStarters({ onSelect }: { onSelect: (text: string) => void }): JSX.Element {
  return (
    <div className="ai-starters" aria-label="Sugestões para começar">
      {PROMPT_SHORTCUTS.filter((item) => item.command !== '/compact').map(({ command, label, icon: Icon, prompt }) => (
        <button type="button" key={command} onClick={() => onSelect(prompt)}>
          <Icon size={17} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}
