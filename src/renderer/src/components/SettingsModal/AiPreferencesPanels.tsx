import { useState } from 'react'
import { BookOpen, Brain, DatabaseZap, Globe, Link2, Zap } from 'lucide-react'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { CLAUDE_EFFORT_LABELS_PT, CLAUDE_EFFORT_LEVELS, type ClaudeEffort } from '@renderer/lib/aiClient'
import { WEB_SEARCH_DOMAINS } from '@renderer/lib/claudeModels'
import type { AiPreferences } from '@renderer/lib/aiPreferences'
import '../AiInterface.css'

const EFFORT_HINTS: Record<ClaudeEffort, string> = {
  low: 'Respostas rápidas e baratas; bom para dúvidas simples.',
  medium: 'Equilíbrio entre qualidade e custo. Recomendado para o dia a dia.',
  high: 'Mais análise antes de responder; especificações e revisões de código.',
  xhigh: 'Raciocínio profundo para tarefas longas e complexas.',
  max: 'Máximo de raciocínio; mais lento e mais caro.'
}

interface ToggleRowProps {
  icon: JSX.Element
  title: string
  description: string
  checked: boolean
  disabled?: boolean
  badge?: { text: string; tone: 'free' | 'paid' | 'auto' }
  onChange?: () => void
  children?: React.ReactNode
}

function ToggleRow({ icon, title, description, checked, disabled, badge, onChange, children }: ToggleRowProps): JSX.Element {
  return (
    <div className={`ai-pref-row ${checked ? 'ai-pref-row-on' : ''}`}>
      <div className="ai-pref-row-icon">{icon}</div>
      <div className="ai-pref-row-body">
        <div className="ai-pref-row-title">
          <span>{title}</span>
          {badge && <span className={`ai-pref-badge ai-pref-badge-${badge.tone}`}>{badge.text}</span>}
        </div>
        <p className="ai-pref-row-description">{description}</p>
        {children}
      </div>
      {onChange ? (
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={title}
          className={`ai-pref-switch ${checked ? 'ai-pref-switch-on' : ''}`}
          disabled={disabled}
          onClick={onChange}
        />
      ) : null}
    </div>
  )
}

function usePreferenceSaver(): {
  prefs: AiPreferences
  error: string | null
  save: (patch: Partial<AiPreferences>) => void
} {
  const prefs = useSettingsStore((state) => state.aiPreferences)
  const setAiPreferences = useSettingsStore((state) => state.setAiPreferences)
  const [error, setError] = useState<string | null>(null)
  const save = (patch: Partial<AiPreferences>): void => {
    setError(null)
    void setAiPreferences(patch).catch((cause) => setError((cause as Error).message))
  }
  return { prefs, error, save }
}

/** Aba "Comportamento": como o Claude pensa e responde. */
export function AiBehaviorPanel(): JSX.Element {
  const { prefs, error, save } = usePreferenceSaver()

  return (
    <div className="ai-pref-panel">
      {error && <div className="mcp-error" role="alert">{error}</div>}

      <section className="ai-card ai-tune-summary" aria-label="Resumo dos ajustes da IA"><header><strong><Brain size={15} /> Ajustes da resposta</strong><span>Preferências atuais</span></header><div className="ai-insights"><article><span>Profundidade</span><strong>{CLAUDE_EFFORT_LABELS_PT[prefs.defaultEffort]}</strong><p>{EFFORT_HINTS[prefs.defaultEffort]}</p></article><article><span>Raciocínio</span><strong>{prefs.showThinking ? 'Visível' : 'Recolhido'}</strong><p>{prefs.showThinking ? 'Resumo disponível para expandir quando fornecido pelo modelo.' : 'O indicador permanece; o resumo não é guardado.'}</p></article></div></section>

      <section className="ai-pref-group">
        <div className="ai-pref-group-header">
          <Zap size={14} strokeWidth={1.75} />
          <h3>Effort padrão</h3>
        </div>
        <p className="settings-muted">
          Quanto o Claude pensa antes de responder. É o valor inicial do seletor no chat — você ainda pode ajustar por
          conversa.
        </p>
        <div className="ai-effort-segmented" role="radiogroup" aria-label="Effort padrão">
          {CLAUDE_EFFORT_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={prefs.defaultEffort === level}
              className={`ai-effort-option ${prefs.defaultEffort === level ? 'ai-effort-option-active' : ''}`}
              onClick={() => save({ defaultEffort: level })}
            >
              {CLAUDE_EFFORT_LABELS_PT[level]}
            </button>
          ))}
        </div>
        <p className="ai-effort-hint">{EFFORT_HINTS[prefs.defaultEffort]}</p>
      </section>

      <section className="ai-pref-group">
        <ToggleRow
          icon={<Brain size={15} strokeWidth={1.75} />}
          title="Mostrar raciocínio"
          description='Guarda o resumo do que o modelo pensou. Aparece recolhido em "Pensou por Xs" e só abre se você clicar. Desligado, a animação "Pensando" continua, sem o resumo.'
          badge={{ text: 'Sem custo extra', tone: 'free' }}
          checked={prefs.showThinking}
          onChange={() => save({ showThinking: !prefs.showThinking })}
        />
        <ToggleRow
          icon={<DatabaseZap size={15} strokeWidth={1.75} />}
          title="Cache de prompt"
          description="Agente, skills e histórico já enviados são reaproveitados nas mensagens seguintes da conversa, custando cerca de 10% do valor normal."
          badge={{ text: 'Automático', tone: 'auto' }}
          checked
        />
      </section>
      <p className="settings-muted">Estas opções valem para os modelos Claude. OpenAI e Gemini seguem o comportamento padrão de cada provedor.</p>
    </div>
  )
}

/** Aba "Ferramentas": server tools do Claude com cobrança à parte. */
export function AiToolsPanel(): JSX.Element {
  const { prefs, error, save } = usePreferenceSaver()

  return (
    <div className="ai-pref-panel">
      {error && <div className="mcp-error" role="alert">{error}</div>}

      <div className="ai-pref-callout">
        <BookOpen size={15} strokeWidth={1.75} />
        <span>
          Já usa um MCP de documentação (aba MCP)? Ele é consultado sem cobrança por busca — deixe estas ferramentas
          desligadas e ative só se precisar de pesquisa aberta na documentação SAP.
        </span>
      </div>

      <section className="ai-pref-group">
        <ToggleRow
          icon={<Globe size={15} strokeWidth={1.75} />}
          title="Pesquisa web SAP"
          description="O Claude pesquisa na documentação oficial quando precisar de informação atualizada (BAPIs, CDS, RAP, release notes) e cita as fontes na resposta. Até 5 buscas por resposta."
          badge={{ text: 'US$ 10 / 1.000 buscas', tone: 'paid' }}
          checked={prefs.webSearch}
          onChange={() => save({ webSearch: !prefs.webSearch })}
        >
          <div className="ai-pref-domains">
            {WEB_SEARCH_DOMAINS.map((domain) => (
              <span key={domain} className="ai-pref-domain">{domain}</span>
            ))}
            <span className="ai-pref-domains-note">e subdomínios</span>
          </div>
        </ToggleRow>
        <ToggleRow
          icon={<Link2 size={15} strokeWidth={1.75} />}
          title="Leitura de links"
          description="Quando você cola um link (SAP Help, blog, GitHub…), o Claude abre e lê a página. Só acessa URLs que já estão na conversa."
          badge={{ text: 'Cobrado em tokens lidos', tone: 'paid' }}
          checked={prefs.webFetch}
          onChange={() => save({ webFetch: !prefs.webFetch })}
        />
      </section>
      <p className="settings-muted">
        Disponível para Claude Opus/Sonnet 4.6 ou mais novos. A organização precisa ter pesquisa web habilitada no Console
        da Anthropic; se não tiver, o chat responde normalmente sem as ferramentas.
      </p>
    </div>
  )
}
