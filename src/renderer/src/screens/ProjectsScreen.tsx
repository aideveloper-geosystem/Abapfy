import { useEffect, useState } from 'react'
import { BookOpen, FolderKanban, MessageSquarePlus, Plus, Trash2 } from 'lucide-react'
import { NewProjectModal } from '@renderer/components/NewProjectModal'
import { useChatStore, type ProjectSummary } from '@renderer/store/chatStore'
import { useAgentsStore } from '@renderer/store/agentsStore'
import { ProjectKnowledgeModal } from '@renderer/components/ProjectKnowledgeModal'
import { useClientsStore } from '@renderer/store/clientsStore'
import { useAuthStore } from '@renderer/store/authStore'
import { useAuthorNames } from '@renderer/lib/useAuthorNames'
import { creatorLabel } from '@renderer/lib/contentOwnership'
import './SkillsScreen.css'
import './ProjectsScreen.css'

interface ProjectsScreenProps {
  onOpenProject: (project: ProjectSummary) => void
  onProjectDeleted?: (projectId: string) => void
}

export function ProjectsScreen({
  onOpenProject,
  onProjectDeleted
}: ProjectsScreenProps): JSX.Element {
  const [createOpen, setCreateOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null)
  const userId = useAuthStore((state) => state.user?.id)
  const [knowledgeProject, setKnowledgeProject] = useState<ProjectSummary | null>(null)

  const { projects, loaded, load, createProject, deleteProject } = useChatStore((state) => ({
    projects: state.projects,
    loaded: state.loaded,
    load: state.load,
    createProject: state.createProject,
    deleteProject: state.deleteProject
  }))
  const agents = useAgentsStore((state) => state.agents)
  const clients = useClientsStore((state) => state.clients)

  const names = useAuthorNames(projects.map((project) => project.userId))
  async function handleDelete(project: ProjectSummary): Promise<void> {
    if (deletingId) return
    if (
      !window.confirm(
        'Excluir o projeto “' +
          project.name +
          '”?\n\nOs documentos e a indexação da base de conhecimento deste projeto serão removidos permanentemente. Os chats e as tarefas serão mantidos, sem vínculo com o projeto. Os arquivos do cliente serão mantidos.\n\nEsta ação não pode ser desfeita.'
      )
    )
      return
    setDeletingId(project.id)
    setDeleteError(null)
    setDeleteNotice(null)
    try {
      await deleteProject(project.id)
      if (useAuthStore.getState().user?.id !== userId) return
      if (knowledgeProject?.id === project.id) setKnowledgeProject(null)
      onProjectDeleted?.(project.id)
      setDeleteNotice('Projeto “' + project.name + '” excluído. Os chats foram preservados.')
    } catch (cause) {
      if (useAuthStore.getState().user?.id === userId) setDeleteError((cause as Error).message)
    } finally {
      setDeletingId(null)
    }
  }

  useEffect(() => {
    if (!loaded) load()
  }, [loaded, load])

  async function handleCreate(input: Parameters<typeof createProject>[0]): Promise<void> {
    await createProject(input)
  }

  function agentLabel(project: ProjectSummary): string | null {
    if (!project.defaultAgentSource || !project.defaultAgentId) return null
    const agent = agents.find(
      (item) => item.source === project.defaultAgentSource && item.id === project.defaultAgentId
    )
    return agent?.name ?? null
  }

  return (
    <div className="skills-screen">
      <div className="skills-header">
        <div>
          <h1 className="skills-title">Projetos</h1>
          <p className="skills-subtitle">
            Agrupe chats sob um contexto e, opcionalmente, um agente padrão fixo.
          </p>
        </div>
        <button type="button" className="skills-import-btn" onClick={() => setCreateOpen(true)}>
          <Plus size={14} strokeWidth={1.75} />
          Novo projeto
        </button>
      </div>

      {deleteError && (
        <p className="project-delete-error" role="alert">
          {deleteError}
        </p>
      )}
      {deleteNotice && (
        <p className="project-delete-notice" role="status">
          {deleteNotice}
        </p>
      )}
      <div className="skills-grid">
        {projects.length === 0 ? (
          <div className="skills-empty">
            <FolderKanban size={28} strokeWidth={1.25} />
            <p>Nenhum projeto ainda.</p>
          </div>
        ) : (
          projects.map((project) => (
            <div key={project.id} className="skill-card project-card">
              <div className="skill-card-header">
                <div className="skill-card-title-row">
                  <span className="skill-card-name" title={project.name}>
                    {project.name}
                  </span>
                  {agentLabel(project) && (
                    <span className="agent-card-badge agent-card-badge-default">
                      {agentLabel(project)}
                    </span>
                  )}
                </div>
              </div>

              {project.description && <p className="skill-card-summary">{project.description}</p>}
              <p className="skill-card-summary">
                Criado por {creatorLabel(project.userId, names, userId)}
              </p>
              <p className="skill-card-summary">
                Cliente:{' '}
                {clients.find((client) => client.id === project.clientId)?.name ?? 'Desconhecido'} ·
                Criado em {new Intl.DateTimeFormat('pt-BR').format(new Date(project.createdAt))}
              </p>

              <div className="project-card-actions">
                <button
                  type="button"
                  className="agent-card-action project-card-open"
                  onClick={() => onOpenProject(project)}
                >
                  <MessageSquarePlus size={13} strokeWidth={1.75} /> Novo chat
                </button>
                <button
                  type="button"
                  className="agent-card-action project-card-open"
                  onClick={() => setKnowledgeProject(project)}
                >
                  <BookOpen size={13} strokeWidth={1.75} /> Conhecimento
                </button>
                <button
                  type="button"
                  className="agent-card-action project-card-delete"
                  aria-label={'Excluir projeto ' + project.name}
                  disabled={deletingId !== null}
                  onClick={() => void handleDelete(project)}
                >
                  <Trash2 size={13} />
                  {deletingId === project.id ? 'Excluindo…' : 'Excluir projeto'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <NewProjectModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />
      <ProjectKnowledgeModal project={knowledgeProject} onClose={() => setKnowledgeProject(null)} />
    </div>
  )
}
