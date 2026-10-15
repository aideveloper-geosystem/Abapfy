import { fetchApiKey, streamChat } from '@renderer/lib/aiClient'
import type { AiProviderId } from '@renderer/lib/aiProviders'
import type { TaskItem, TaskSubtask, TaskPriority } from '@renderer/store/tasksStore'

export interface SuggestedTaskDraft {
  title: string
  description: string
  priority: TaskPriority
  sapModule: string
  estimatedHours: number | null
  labels: string[]
  subtasks: string[]
}

function parseSuggestion(content: string): SuggestedTaskDraft {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  const parsed = JSON.parse(cleaned) as Partial<SuggestedTaskDraft>
  return {
    title: String(parsed.title ?? '').slice(0, 160),
    description: String(parsed.description ?? ''),
    priority: ['low', 'medium', 'high'].includes(parsed.priority ?? '')
      ? (parsed.priority as TaskPriority)
      : 'medium',
    sapModule: String(parsed.sapModule ?? '')
      .slice(0, 20)
      .toUpperCase(),
    estimatedHours:
      typeof parsed.estimatedHours === 'number' ? Math.max(0, parsed.estimatedHours) : null,
    labels: Array.isArray(parsed.labels) ? parsed.labels.map(String).slice(0, 8) : [],
    subtasks: Array.isArray(parsed.subtasks)
      ? parsed.subtasks.map(String).filter(Boolean).slice(0, 12)
      : []
  }
}

export async function suggestTaskDraft(input: {
  userId: string
  provider: AiProviderId
  model: string
  brief: string
}): Promise<SuggestedTaskDraft> {
  const apiKey = await fetchApiKey(input.userId, input.provider)
  if (!apiKey) throw new Error('Configure a chave do provedor de IA antes de usar o assistente.')
  let content = ''
  const controller = new AbortController()
  await streamChat({
    provider: input.provider,
    model: input.model,
    apiKey,
    signal: controller.signal,
    messages: [{ role: 'user', content: input.brief }],
    systemPrompt: `Você auxilia no planejamento de tarefas SAP. Retorne SOMENTE JSON válido com o formato {"title":"...","description":"...","priority":"low|medium|high","sapModule":"MM|SD|FI|ABAP|...","estimatedHours":number|null,"labels":["..."],"subtasks":["..."]}. Gere subtarefas concretas, verificáveis e em ordem de execução. Não execute nenhuma ação externa.`,
    onDelta: (delta) => {
      content += delta
    }
  })
  return parseSuggestion(content)
}

export function buildTaskExecutionPrompt(task: TaskItem, clientName: string, subtask?: TaskSubtask): string {
  return [
    'Execute o trabalho abaixo nesta sessão. Produza a entrega e explique como validá-la.',
    'Cliente: ' + clientName,
    'Tarefa: ' + task.title,
    task.description ? 'Contexto: ' + task.description : '',
    task.sapModule ? 'Módulo SAP: ' + task.sapModule : '',
    task.dueDate ? 'Prazo: ' + task.dueDate : '',
    task.labels.length ? 'Etiquetas: ' + task.labels.join(', ') : '',
    subtask ? 'Execute somente esta subtarefa: ' + subtask.title : 'Escopo: tarefa completa.',
    task.subtasks.length ? 'Checklist de referência:\n' + task.subtasks.map((item) => '- [' + (item.completed ? 'x' : ' ') + '] ' + item.title).join('\n') : '',
    'Use o cliente e a pasta desta sessão para consultar referências e salvar entregas. Apresente códigos ABAP em blocos com linguagem abap, para salvamento automático em .abap.',
    'Se faltar informação essencial, peça esclarecimento. Não marque a tarefa ou subtarefa como concluída automaticamente. O acesso ao SAP depende da autorização explícita do usuário nesta sessão.'
  ].filter(Boolean).join('\n\n')
}
