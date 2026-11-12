export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER'

export const WORKSPACE_ROLE_LABELS: Record<WorkspaceRole, string> = {
  OWNER: 'Proprietário',
  ADMIN: 'Administrador',
  MEMBER: 'Membro'
}

export const WORKSPACE_ROLE_HINTS: Record<WorkspaceRole, string> = {
  OWNER: 'Gerencia membros, papéis e todo o conteúdo do workspace.',
  ADMIN: 'Aprova entradas, gerencia clientes e esvazia a lixeira.',
  MEMBER: 'Usa clientes, projetos, sessões e o drive compartilhado.'
}

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return value === 'OWNER' || value === 'ADMIN' || value === 'MEMBER'
}

export function isWorkspaceAdmin(role: WorkspaceRole | null | undefined): boolean {
  return role === 'OWNER' || role === 'ADMIN'
}

/**
 * Who may create/edit/delete clients and purge the drive trash.
 * With migration 041 applied this follows the workspace role; before it (legacy schema)
 * it falls back to the platform roles stored in app_roles.
 */
export function canManageClients(
  workspaceRole: WorkspaceRole | null | undefined,
  platformRole: 'MASTER' | 'ADMIN' | null | undefined,
  legacy: boolean
): boolean {
  if (legacy) return platformRole === 'MASTER' || platformRole === 'ADMIN'
  return isWorkspaceAdmin(workspaceRole)
}

/** Roles an actor may hand out when approving a request or editing a member. */
export function assignableRoles(actor: WorkspaceRole | null | undefined): WorkspaceRole[] {
  if (actor === 'OWNER') return ['OWNER', 'ADMIN', 'MEMBER']
  if (actor === 'ADMIN') return ['MEMBER']
  return []
}

/** Whether `actor` may remove `target` from the workspace (the database enforces the same rules). */
export function canRemoveMember(
  actor: WorkspaceRole | null | undefined,
  target: WorkspaceRole,
  isSelf: boolean
): boolean {
  if (isSelf) return true
  if (!isWorkspaceAdmin(actor)) return false
  if (target === 'OWNER') return false
  if (target === 'ADMIN') return actor === 'OWNER'
  return true
}

const JOIN_CODE_PATTERN = /^[A-Z0-9]{10}$/

export function normalizeJoinCode(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase()
}

export function isValidJoinCode(value: string): boolean {
  return JOIN_CODE_PATTERN.test(normalizeJoinCode(value))
}

/** Maps Postgres/RPC error messages raised by migration 041 to user-facing Portuguese text. */
export function workspaceErrorMessage(message: string | null | undefined): string {
  const text = message ?? ''
  const known: [RegExp, string][] = [
    [/Invalid workspace code/i, 'Código de workspace inválido. Confira com o administrador.'],
    [/already belong/i, 'Você já pertence a um workspace.'],
    [/already pending/i, 'Você já tem um pedido pendente neste workspace.'],
    [/name too short/i, 'Informe um nome com pelo menos 2 caracteres.'],
    [/at least one owner/i, 'O workspace precisa de pelo menos um proprietário.'],
    [/owner cannot be removed/i, 'O proprietário não pode ser removido.'],
    [/Only the owner/i, 'Somente o proprietário pode fazer isso.'],
    [/admin required/i, 'Somente administradores do workspace podem fazer isso.'],
    [/User already belongs/i, 'Essa pessoa já entrou em outro workspace.'],
    [/row-level security/i, 'Sem permissão para esta ação neste workspace.']
  ]
  return known.find(([pattern]) => pattern.test(text))?.[1] ?? (text || 'Não foi possível concluir a ação.')
}
