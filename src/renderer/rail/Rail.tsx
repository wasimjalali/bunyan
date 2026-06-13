import { useStore } from '../state/store'
import type { Project, ProjectSection, Workspace } from '@shared/types'
import {
  activeProjectId,
  projectSessions,
  projectStatus,
  runningSessionCount,
  sectionedProjects,
} from '@shared/workspace'
import { useFileDrop } from '../useFileDrop'
import { ProjectRow } from './ProjectRow'
import { StatusDot } from './StatusDot'
import { getDrag } from './dnd'

const SECTION_LABELS: Record<ProjectSection, string> = {
  professional: 'Professional',
  personal: 'Personal',
}

export function Rail(): React.JSX.Element {
  const workspace = useStore((s) => s.workspace)
  const focusSession = useStore((s) => s.focusSession)
  const updateSettings = useStore((s) => s.updateSettings)

  const railSide = workspace.settings.railSide

  // One activity sort per render: the section lists and the footer's session
  // walk all derive from it.
  const sections = sectionedProjects(workspace)

  // Flatten sessions in the order the rail shows them, so the footer's attention
  // jumper walks them the way the eye reads them. Running several agents at once
  // is the whole point of Bunyan, so the footer answers "is anything waiting on
  // me?" at a glance and jumps to the next one with a click.
  const displayed = [...sections.professional, ...sections.personal]
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

  return (
    <aside
      className={[
        'rail-depth flex h-full flex-col border-line bg-canvas',
        // The hairline sits on whichever edge faces the terminal.
        railSide === 'left' ? 'border-r' : 'border-l',
      ].join(' ')}
    >
      <header className="drag-region flex h-9 shrink-0 items-center px-3">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-ink-dim">
          Projects
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        <SectionGroup section="professional" projects={sections.professional} workspace={workspace} />
        <SectionGroup section="personal" projects={sections.personal} workspace={workspace} />
      </div>

      <footer className="flex h-9 shrink-0 items-center justify-between gap-2 border-t border-line px-2">
        <button
          onClick={toggleSide}
          title={moveSidebarLabel}
          aria-label={moveSidebarLabel}
          className="icon-btn h-6 w-6"
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

/**
 * One rail section: header with its own add button, then its projects with
 * running ones floated to the top of THIS section only. The whole group is a
 * Finder drop target, so a folder dropped on "Personal" lands in Personal.
 * It also accepts internal project drags from the other section.
 */
function SectionGroup({
  section,
  projects,
  workspace,
}: {
  section: ProjectSection
  /** This section's projects in display order, computed once in Rail. */
  projects: Project[]
  workspace: Workspace
}): React.JSX.Element {
  const openProject = useStore((s) => s.openProject)
  const addProjectFromPath = useStore((s) => s.addProjectFromPath)
  const newSession = useStore((s) => s.newSession)
  const closeSession = useStore((s) => s.closeSession)
  const closeProject = useStore((s) => s.closeProject)
  const rename = useStore((s) => s.rename)
  const recolor = useStore((s) => s.recolor)
  const setSection = useStore((s) => s.setSection)
  const moveProject = useStore((s) => s.moveProject)
  const refreshBranch = useStore((s) => s.refreshBranch)
  const collapse = useStore((s) => s.collapse)
  const focusSession = useStore((s) => s.focusSession)
  const reorderSession = useStore((s) => s.reorderSession)

  const currentProjectId = activeProjectId(workspace)
  const manualIndexOf = (projectId: string): number =>
    workspace.projects.findIndex((p) => p.id === projectId)

  const handleCloseProject = (project: Project): void => {
    const working = workspace.sessions.some(
      (s) => s.projectId === project.id && s.status === 'working',
    )
    if (working) {
      const ok = window.confirm(`${project.name} has a session still working. Close it anyway?`)
      if (!ok) return
    }
    closeProject(project.id)
  }

  // Clicking a project jumps straight to its first session (usually the Claude
  // one), so you don't have to expand and pick. No-op for an empty project.
  const handleOpenProject = (projectId: string): void => {
    const first = projectSessions(workspace, projectId)[0]
    if (first) focusSession(first.id)
  }

  // A drop on a row of this section adopts the dragged project into it AND
  // places it, in one atomic workspace step (moveProjectToSection).
  const handleReorder = (draggedId: string, toIndex: number): void => {
    moveProject(draggedId, section, toIndex)
  }

  // Folders dropped from Finder become projects in this section. Row drop
  // handlers stopPropagation, so an internal reorder never reaches here.
  const { fileOver: folderOver, dropHandlers } = useFileDrop((paths) => {
    for (const path of paths) void addProjectFromPath(path, section)
  })

  // An internal project drag from the other section can drop on the header
  // area (or an empty section), adopting the project at the end.
  const acceptsSectionDrop = (): boolean => {
    const d = getDrag()
    if (d?.kind !== 'project') return false
    return workspace.projects.find((p) => p.id === d.projectId)?.section !== section
  }

  return (
    <section
      {...dropHandlers}
      className={['rounded-md pb-1', folderOver ? 'ring-1 ring-inset ring-gold' : ''].join(' ')}
    >
      <div
        onDragOver={(e) => {
          if (acceptsSectionDrop()) e.preventDefault()
        }}
        onDrop={(e) => {
          e.stopPropagation()
          const d = getDrag()
          if (d?.kind === 'project') handleReorder(d.projectId, workspace.projects.length - 1)
        }}
        className="flex h-7 items-center justify-between pl-2 pr-1 pt-1"
      >
        <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-dim/80">
          {SECTION_LABELS[section]}
        </span>
        <button
          onClick={() => void openProject(section)}
          title={`Add a ${section} project`}
          aria-label={`Add a ${section} project`}
          className="icon-btn h-5 w-5"
        >
          <PlusGlyph />
        </button>
      </div>

      {projects.length === 0 ? (
        <p className="px-2 py-1.5 text-xs leading-relaxed text-ink-dim/70">
          Drop a folder here or press +
        </p>
      ) : (
        projects.map((project) => (
          <ProjectRow
            key={project.id}
            project={project}
            index={manualIndexOf(project.id)}
            sessions={projectSessions(workspace, project.id)}
            status={projectStatus(workspace, project.id)}
            runningCount={runningSessionCount(workspace, project.id)}
            active={project.id === currentProjectId}
            activeSessionId={workspace.activeSessionId}
            railSide={workspace.settings.railSide}
            onToggleCollapse={() => collapse(project.id)}
            onOpenProject={() => handleOpenProject(project.id)}
            onNewClaude={() => newSession(project.id, 'claude')}
            onNewShell={() => newSession(project.id, 'shell')}
            onRename={(name) => rename(project.id, name)}
            onRecolor={(color) => recolor(project.id, color)}
            onMoveToSection={() =>
              setSection(project.id, section === 'professional' ? 'personal' : 'professional')
            }
            onRefreshBranch={() => void refreshBranch(project.id)}
            onClose={() => handleCloseProject(project)}
            onFocusSession={(id) => focusSession(id)}
            onCloseSession={(id) => closeSession(id)}
            onReorderProject={handleReorder}
            onReorderSession={(sessionId, toIndex) =>
              reorderSession(project.id, sessionId, toIndex)
            }
          />
        ))
      )}
    </section>
  )
}

/** A thin plus for the section add button, matching the icon set's stroke. */
function PlusGlyph(): React.JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
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
