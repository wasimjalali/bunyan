import { useStore } from '../state/store'
import { projectSessions, projectStatus } from '@shared/workspace'
import { ProjectRow } from './ProjectRow'

export function Rail(): React.JSX.Element {
  const workspace = useStore((s) => s.workspace)
  const openProject = useStore((s) => s.openProject)
  const newSession = useStore((s) => s.newSession)
  const closeSession = useStore((s) => s.closeSession)
  const closeProject = useStore((s) => s.closeProject)
  const rename = useStore((s) => s.rename)
  const recolor = useStore((s) => s.recolor)
  const collapse = useStore((s) => s.collapse)
  const focusSession = useStore((s) => s.focusSession)

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

  return (
    <aside className="flex h-full flex-col border-l border-navy-line bg-deep-navy">
      <header className="drag-region flex h-9 shrink-0 items-center justify-between px-3">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted">
          Projects
        </span>
        <button
          onClick={() => void openProject()}
          title="Add a project"
          className="no-drag flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-navy-surface hover:text-cream-surface"
        >
          +
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {workspace.projects.length === 0 ? (
          <p className="px-2 pt-2 text-xs leading-relaxed text-muted">
            No projects yet. Add a folder to start.
          </p>
        ) : (
          workspace.projects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              sessions={projectSessions(workspace, project.id)}
              status={projectStatus(workspace, project.id)}
              activeSessionId={workspace.activeSessionId}
              onToggleCollapse={() => collapse(project.id)}
              onNewClaude={() => newSession(project.id, 'claude')}
              onNewShell={() => newSession(project.id, 'shell')}
              onRename={(name) => rename(project.id, name)}
              onRecolor={(color) => recolor(project.id, color)}
              onClose={() => handleCloseProject(project.id)}
              onFocusSession={(id) => focusSession(id)}
              onCloseSession={(id) => closeSession(id)}
            />
          ))
        )}
      </div>
    </aside>
  )
}
