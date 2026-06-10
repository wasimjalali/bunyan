import { useStore } from '../state/store'
import {
  activeProjectId,
  orderProjectsByActivity,
  projectSessions,
  projectStatus,
  runningSessionCount,
} from '@shared/workspace'
import { useFileDrop } from '../useFileDrop'
import { ProjectRow } from './ProjectRow'
import { StatusDot } from './StatusDot'

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
  const updateSettings = useStore((s) => s.updateSettings)

  const railSide = workspace.settings.railSide

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

  // When auto-sort is on, projects with a running agent float to the top; manual
  // order is still the within-tier tiebreaker (and the drag target). The drop
  // index always maps back to the underlying ws.projects order, since that's
  // what reorderProject mutates.
  const displayed = workspace.settings.autoSortProjects
    ? orderProjectsByActivity(workspace)
    : workspace.projects
  const manualIndexOf = (projectId: string): number =>
    workspace.projects.findIndex((p) => p.id === projectId)

  // Flatten sessions in the order the rail shows them, so the footer's attention
  // jumper walks them the way the eye reads them. Running several agents at once
  // is the whole point of Bunyan, so the footer answers "is anything waiting on
  // me?" at a glance and jumps to the next one with a click.
  const orderedSessions = displayed.flatMap((p) => projectSessions(workspace, p.id))
  const needsInput = orderedSessions.filter((s) => s.status === 'needs-input')
  const workingCount = orderedSessions.filter((s) => s.status === 'working').length

  const jumpToNextWaiting = (): void => {
    if (needsInput.length === 0) return
    const active = needsInput.findIndex((s) => s.id === workspace.activeSessionId)
    const next = needsInput[(active + 1) % needsInput.length]
    if (next) focusSession(next.id)
  }

  const oppositeSide = railSide === 'right' ? 'left' : 'right'
  const moveSidebarLabel = `Move sidebar to the ${oppositeSide}`
  const toggleSide = (): void => updateSettings({ railSide: oppositeSide })

  // Folders dropped from Finder become projects. Row drop handlers
  // stopPropagation, so an internal reorder never reaches here.
  const { fileOver: folderOver, dropHandlers } = useFileDrop((paths) => {
    for (const path of paths) void addProjectFromPath(path)
  })

  return (
    <aside
      className={[
        'rail-depth flex h-full flex-col border-line bg-canvas',
        // The hairline sits on whichever edge faces the terminal.
        railSide === 'left' ? 'border-r' : 'border-l',
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
          displayed.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              index={manualIndexOf(project.id)}
              sessions={projectSessions(workspace, project.id)}
              status={projectStatus(workspace, project.id)}
              runningCount={runningSessionCount(workspace, project.id)}
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

      <footer className="flex h-9 shrink-0 items-center justify-between gap-2 border-t border-line px-2">
        <button
          onClick={toggleSide}
          title={moveSidebarLabel}
          aria-label={moveSidebarLabel}
          className="row-smooth flex h-6 w-6 items-center justify-center rounded text-ink-dim hover:bg-surface hover:text-ink"
        >
          <DockChevron point={oppositeSide} />
        </button>

        {needsInput.length > 0 ? (
          <button
            onClick={jumpToNextWaiting}
            title="Jump to the next session that needs input"
            className="row-smooth flex items-center gap-1.5 rounded-md bg-gold/15 px-2 py-1 text-xs font-medium text-gold hover:bg-gold/25"
          >
            <StatusDot status="needs-input" />
            {needsInput.length} {needsInput.length === 1 ? 'needs' : 'need'} input
          </button>
        ) : workingCount > 0 ? (
          <span className="flex items-center gap-1.5 px-1 text-xs text-ink-dim">
            <StatusDot status="working" />
            {workingCount} running
          </span>
        ) : null}
      </footer>
    </aside>
  )
}

/** A crisp chevron whose face points to the side the rail will move to. */
function DockChevron({ point }: { point: 'left' | 'right' }): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d={point === 'left' ? 'M10 4 L6 8 L10 12' : 'M6 4 L10 8 L6 12'}
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
