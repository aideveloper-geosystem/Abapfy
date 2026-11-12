import { WORKSPACE_ROLE_HINTS, WORKSPACE_ROLE_LABELS, type WorkspaceRole } from '@renderer/lib/workspaceAccess'
import './RoleBadge.css'

/** Small pill showing the signed-in user's role; the title explains what the role may do. */
export function RoleBadge({ role }: { role: WorkspaceRole | null | undefined }): JSX.Element | null {
  if (!role) return null
  return (
    <span className={`role-badge role-badge-${role.toLowerCase()}`} title={WORKSPACE_ROLE_HINTS[role]}>
      {WORKSPACE_ROLE_LABELS[role]}
    </span>
  )
}
