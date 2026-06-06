import { useStore } from '../state/store'
import { activeProjectId, projectSessions, projectStatus } from '@shared/workspace'
import { useFileDrop } from '../useFileDrop'
import { ProjectRow } from './ProjectRow'

export function Rail(): React.JSX.Element {
  const workspace = useStore((s) => s.workspace)
  const openProject = useStore((s) => s.openProject)
  const addProjectFromPath = useStore((s) => s.addProjectFromPath)
  const newSession = useStore((s) => s.newSession)
  const closeSession = useStore((s) => s.closeSession)
  const closeProject = useStore((s) => s.closeProject)
  const rename = useStore((s) => s.rename)
  const recolor = useStore((s) => s.recolor)
  const collapse = useStore((s) => s.collapse)
  const focusSession = useStore((s) => s.focusSession)
  const reorderProject = useStore((s) => s.reorderProject)
  const reorderSession = useStore((s) => s.reorderSession)

  const handleCloseProject = (projectId: string): void => {
    const project = workspace.projects.find((p) => p.id === projectId)
    if (!project) return
    const working = workspace.sessions.some(
      (s) => s.projectId === projectId && s.status === 'working',
    )
    if (working) {
      const ok = window.confirm(`${project.name} has a session still working. Close it anyway?`)
      if (!ok) return
    }
    closeProject(projectId)
  }

  // Clicking a project jumps straight to its first session (usually the Claude
  // one), so you don't have to expand and pick. No-op for an empty project.
  const handleOpenProject = (projectId: string): void => {
    const first = projectSessions(workspace, projectId)[0]
    if (first) focusSession(first.id)
  }

  // The project owning the active session, so its row reads as current.
  const currentProjectId = activeProjectId(workspace)

  // Folders dropped from Finder become projects. Row drop handlers
  // stopPropagation, so an internal reorder never reaches here.
  const { fileOver: folderOver, dropHandlers } = useFileDrop((paths) => {
    for (const path of paths) void addProjectFromPath(path)
  })

  return (
    <aside
      className={[
        'rail-depth flex h-full flex-col border-l border-line bg-canvas',
        folderOver ? 'ring-2 ring-inset ring-gold' : '',
      ].join(' ')}
      {...dropHandlers}
    >
      <header className="drag-region flex h-9 shrink-0 items-center justify-between px-3">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-ink-dim">
          Projects
        </span>
        <button
          onClick={() => void openProject()}
          title="Add a project"
          className="no-drag flex h-5 w-5 items-center justify-center rounded text-ink-dim hover:bg-surface hover:text-ink"
        >
          +
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {workspace.projects.length === 0 ? (
          <p className="px-2 pt-2 text-xs leading-relaxed text-ink-dim">
            No projects yet. Add a folder to start.
          </p>
        ) : (
          workspace.projects.map((project, index) => (
            <ProjectRow
              key={project.id}
              project={project}
              index={index}
              sessions={projectSessions(workspace, project.id)}
              status={projectStatus(workspace, project.id)}
              active={project.id === currentProjectId}
              activeSessionId={workspace.activeSessionId}
              onToggleCollapse={() => collapse(project.id)}
              onOpenProject={() => handleOpenProject(project.id)}
              onNewClaude={() => newSession(project.id, 'claude')}
              onNewShell={() => newSession(project.id, 'shell')}
              onRename={(name) => rename(project.id, name)}
              onRecolor={(color) => recolor(project.id, color)}
              onClose={() => handleCloseProject(project.id)}
              onFocusSession={(id) => focusSession(id)}
              onCloseSession={(id) => closeSession(id)}
              onReorderProject={reorderProject}
              onReorderSession={(sessionId, toIndex) =>
                reorderSession(project.id, sessionId, toIndex)
              }
            />
          ))
        )}
      </div>
    </aside>
  )
}
