/**
 * The user only chooses the client. The drive area (client module) of a session and of each
 * generated file is derived from what is being done.
 */
export interface AreaModule {
  id: string
  clientId: string
  name: string
}

export interface AreaFolder {
  id: string
  moduleId: string
}

export type AreaKind = 'programs' | 'ef' | 'dtec'

const AREA_NAMES: Record<AreaKind, RegExp> = {
  programs: /^programas?$/i,
  ef: /^efs?$/i,
  dtec: /^dtecs?$/i
}

const AGENT_AREAS: Record<string, AreaKind> = {
  ef_consultant: 'ef',
  dtec_consultant: 'dtec'
}

export function agentArea(agent: { source: string; id: string } | null | undefined): AreaKind {
  return (agent?.source === 'default' && AGENT_AREAS[agent.id]) || 'programs'
}

function findArea<T extends AreaModule>(modules: T[], clientId: string, kind: AreaKind): T | undefined {
  return modules.find(
    (module) => module.clientId === clientId && AREA_NAMES[kind].test(module.name.trim())
  )
}

/** Module of the area, falling back to Programas and then to any module the client has. */
export function areaModule<T extends AreaModule>(
  modules: T[],
  clientId: string,
  kind: AreaKind
): T | null {
  return (
    findArea(modules, clientId, kind) ??
    findArea(modules, clientId, 'programs') ??
    modules.find((module) => module.clientId === clientId) ??
    null
  )
}

/**
 * Where a generated file is saved. A selected folder is respected when it belongs to the right
 * area (or, for code, to a custom area of the client); otherwise the file goes to the root of
 * its own area, so an EF never lands among programs and code never lands among EFs.
 */
export function artifactDestination<T extends AreaModule>(
  modules: T[],
  clientId: string,
  kind: 'programs' | 'ef',
  folder: AreaFolder | null | undefined
): { module: T; folderId: string | null } | null {
  const target = areaModule(modules, clientId, kind)
  const folderModule = folder
    ? modules.find((module) => module.id === folder.moduleId && module.clientId === clientId)
    : undefined
  if (folder && folderModule) {
    const name = folderModule.name.trim()
    const customArea = !AREA_NAMES.ef.test(name) && !AREA_NAMES.dtec.test(name)
    if (folderModule.id === target?.id || (kind === 'programs' && customArea))
      return { module: folderModule, folderId: folder.id }
  }
  return target ? { module: target, folderId: null } : null
}
