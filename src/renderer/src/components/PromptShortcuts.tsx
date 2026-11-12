import { useState } from 'react'
import { Bug, ChevronDown, FileCode2, FileText, MessageSquare, Search } from 'lucide-react'
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

export interface RecentSession {
  id: string
  title: string
  clientName: string
}

const VISIBLE_ACTIONS = 3

/** Small pixel-art "A" in the theme accent colour; decorative, replaces the big logo on the empty session. */
export function AbapfyGlyph({ size = 36 }: { size?: number }): JSX.Element {
  const pixels = [
    '..XXXX..',
    '.XX..XX.',
    'XX....XX',
    'XX....XX',
    'XXXXXXXX',
    'XX....XX',
    'XX....XX',
    'XX....XX'
  ]
  return (
    <svg className="home-glyph" width={size} height={size} viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden="true">
      {pixels.flatMap((row, y) =>
        [...row].map((cell, x) => (cell === 'X' ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" /> : null))
      )}
    </svg>
  )
}

/** Quiet list of quick actions (and recent sessions) shown under the composer of an empty session. */
export function PromptStarters({
  onSelect,
  recent = [],
  onOpenChat
}: {
  onSelect: (text: string) => void
  recent?: RecentSession[]
  onOpenChat?: (chatId: string) => void
}): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const actions = PROMPT_SHORTCUTS.filter((item) => item.command !== '/compact')
  const visible = expanded ? actions : actions.slice(0, VISIBLE_ACTIONS)
  return (
    <div className="home-quick" aria-label="Sugestões para começar">
      <ul className="home-quick-list">
        {visible.map(({ command, label, icon: Icon, prompt }) => (
          <li key={command}>
            <button type="button" onClick={() => onSelect(prompt)}>
              <Icon size={15} strokeWidth={1.75} />
              <span>{label}</span>
            </button>
          </li>
        ))}
        {!expanded && actions.length > VISIBLE_ACTIONS && (
          <li>
            <button type="button" className="home-quick-more" onClick={() => setExpanded(true)}>
              <ChevronDown size={15} strokeWidth={1.75} />
              <span>Mais sugestões</span>
            </button>
          </li>
        )}
      </ul>
      {recent.length > 0 && onOpenChat && (
        <>
          <span className="home-quick-heading">Recentes</span>
          <ul className="home-quick-list">
            {recent.map((session) => (
              <li key={session.id}>
                <button type="button" onClick={() => onOpenChat(session.id)} title={session.title}>
                  <MessageSquare size={15} strokeWidth={1.75} />
                  <span>{session.title}</span>
                  {session.clientName && <small>{session.clientName}</small>}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
