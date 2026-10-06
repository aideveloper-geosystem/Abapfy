import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpRight, GitBranch, Lightbulb, Search } from 'lucide-react'
import {
  displayCell,
  type AiPresentationBlock,
  type AiPresentationData
} from '@renderer/lib/aiPresentation'
import './AiInterface.css'

function Records({
  block
}: {
  block: Extract<AiPresentationBlock, { type: 'records' }>
}): JSX.Element {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ column: number; descending: boolean } | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const rows = useMemo(() => {
    const filtered = block.rows
      .map((cells, index) => ({ cells, index }))
      .filter(({ cells }) =>
        cells.some((value) =>
          displayCell(value)
            .toLocaleLowerCase('pt-BR')
            .includes(query.trim().toLocaleLowerCase('pt-BR'))
        )
      )
    if (sort)
      filtered.sort((a, b) => {
        const left = a.cells[sort.column],
          right = b.cells[sort.column]
        const order =
          typeof left === 'number' && typeof right === 'number'
            ? left - right
            : displayCell(left).localeCompare(displayCell(right), 'pt-BR', { numeric: true })
        return sort.descending ? -order : order
      })
    return filtered
  }, [block.rows, query, sort])
  return (
    <section className="ai-card">
      <header>
        <strong>{block.title}</strong>
        <span>
          {rows.length} de {block.rows.length} registros
        </span>
      </header>
      <label className="ai-search">
        <Search size={14} />
        <input
          aria-label={`Buscar em ${block.title}`}
          placeholder="Filtrar registros…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="ai-table-scroll">
        <table>
          <thead>
            <tr>
              <th aria-label="Seleção" />
              {block.columns.map((column, index) => (
                <th
                  key={index}
                  aria-sort={
                    sort?.column === index ? (sort.descending ? 'descending' : 'ascending') : 'none'
                  }
                >
                  <button
                    type="button"
                    onClick={() =>
                      setSort({
                        column: index,
                        descending: sort?.column === index && !sort.descending
                      })
                    }
                  >
                    {column}
                    {sort?.column === index &&
                      (sort.descending ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ cells, index }) => (
              <tr key={index} data-selected={selected.has(index)}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Selecionar registro ${index + 1}`}
                    checked={selected.has(index)}
                    onChange={() =>
                      setSelected((current) => {
                        const next = new Set(current)
                        if (next.has(index)) next.delete(index)
                        else next.add(index)
                        return next
                      })
                    }
                  />
                </td>
                {cells.map((value, column) => (
                  <td key={column}>{displayCell(value)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="ai-empty">Nenhum registro corresponde à busca.</p>}
      </div>
      {selected.size > 0 && (
        <div className="ai-selection-bar">
          <span>{selected.size} selecionados</span>
          <button type="button" onClick={() => setSelected(new Set())}>
            Limpar seleção
          </button>
        </div>
      )}
    </section>
  )
}

function Block({
  block,
  onPrompt,
  disabled
}: {
  block: AiPresentationBlock
  onPrompt?: (text: string) => void
  disabled?: boolean
}): JSX.Element {
  if (block.type === 'records') return <Records block={block} />
  if (block.type === 'recommendation')
    return (
      <section className="ai-card ai-recommendation">
        <header>
          <strong>
            <Lightbulb size={16} />
            {block.title}
          </strong>
          <span>Proposta</span>
        </header>
        <p>{block.description}</p>
        <p className="ai-evidence">{block.evidence}</p>
        {block.confidence && (
          <span className="ai-confidence">
            Confiança declarada pelo agente:{' '}
            {{ high: 'alta', medium: 'média', low: 'baixa' }[block.confidence]}
          </span>
        )}
        {!!block.alternatives?.length && (
          <details>
            <summary>Alternativas ({block.alternatives.length})</summary>
            <ul>
              {block.alternatives.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </details>
        )}
        {block.action && onPrompt && (
          <button
            type="button"
            className="ai-action"
            disabled={disabled}
            onClick={() => onPrompt(block.action!)}
          >
            Discutir proposta <ArrowUpRight size={14} />
          </button>
        )}
      </section>
    )
  if (block.type === 'insights')
    return (
      <section className="ai-card">
        <header>
          <strong>{block.title}</strong>
          <span>{block.items.length} indicadores</span>
        </header>
        <div className="ai-insights">
          {block.items.map((item, index) => (
            <article key={index}>
              <span>{item.label}</span>
              <strong>{displayCell(item.value)}</strong>
              <p>{item.detail}</p>
              <small>Fonte: {item.source}</small>
            </article>
          ))}
        </div>
      </section>
    )
  if (block.type === 'flow')
    return (
      <section className="ai-card ai-flow">
        <header>
          <strong>
            <GitBranch size={16} />
            {block.title}
          </strong>
          <span>Fluxo proposto</span>
        </header>
        <ol>
          {block.steps.map((step, index) => (
            <li key={index} className={`ai-flow-${step.kind}`}>
              <span className="ai-step-number">{index + 1}</span>
              <div>
                <small>
                  {{ trigger: 'Entrada', action: 'Ação', condition: 'Condição' }[step.kind]}
                </small>
                <strong>{step.title}</strong>
                <p>{step.description}</p>
                {step.branches?.map((branch, branchIndex) => (
                  <span className="ai-flow-branch" key={branchIndex}>
                    {branch}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </section>
    )
  return (
    <section className="ai-card">
      <header>
        <strong>{block.title}</strong>
        <span>Alterações propostas</span>
      </header>
      <div className="ai-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Campo</th>
              <th>Antes</th>
              <th>Proposta</th>
              <th>Motivo</th>
            </tr>
          </thead>
          <tbody>
            {block.changes.map((change, index) => (
              <tr key={index}>
                <th scope="row">{change.field}</th>
                <td className="ai-diff-before">{displayCell(change.before)}</td>
                <td className="ai-diff-after">{displayCell(change.after)}</td>
                <td>{change.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function AiPresentation({
  data,
  onPrompt,
  disabled
}: {
  data: AiPresentationData
  onPrompt?: (text: string) => void
  disabled?: boolean
}): JSX.Element {
  return (
    <div className="ai-presentation">
      {data.blocks.map((block, index) => (
        <Block key={index} block={block} onPrompt={onPrompt} disabled={disabled} />
      ))}
      {!!data.followUps?.length && onPrompt && (
        <div className="ai-follow-ups">
          <span>Continuar a análise</span>
          {data.followUps.map((prompt, index) => (
            <button type="button" key={index} disabled={disabled} onClick={() => onPrompt(prompt)}>
              {prompt}
              <ArrowUpRight size={12} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
