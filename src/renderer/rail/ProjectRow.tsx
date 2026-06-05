import { useState } from 'react'
import { PROJECT_COLORS, type Project, type Session, type SessionStatus } from '@shared/types'
import { StatusDot } from './StatusDot'
import { SessionRow } from './SessionRow'
import { setDrag, getDrag, clearDrag } from './dnd'

interface ProjectRowProps {
  project: Project
  index: number
  sessions: Session[]
  status: SessionStatus | null
  active: boolean
  activeSessionId: string | null
  onToggleCollapse: () => void
  onOpenProject: () => void
  onNewClaude: () => void
  onNewShell: () => void
  onRename: (name: string) => void
  onRecolor: (color: string) => void
  onClose: () => void
  onFocusSession: (id: string) => void
  onCloseSession: (id: string) => void
  onReorderProject: (draggedId: string, toIndex: number) => void
  onReorderSession: (sessionId: string, toIndex: number) => void
}

export function ProjectRow(props: ProjectRowProps): React.JSX.Element {
  const { project, sessions, status, active, activeSessionId } = props
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(project.name)
  const [dropTarget, setDropTarget] = useState(false)

  const commitRename = (): void => {
    const trimmed = draftName.trim()
    if (trimmed && trimmed !== project.name) props.onRename(trimmed)
    setRenaming(false)
  }

  const acceptsProjectDrop = (): boolean => {
    const d = getDrag()
    return d?.kind === 'project' && d.projectId !== project.id
  }

  return (
    <div className="group/project select-none">
      <div
        draggable={!renaming}
        onDragStart={(e) => {
          // Don't start a project drag from inside the rename input.
          if (renaming) {
            e.preventDefault()
            return
          }
          setDrag({ kind: 'project', projectId: project.id })
        }}
        onDragEnd={clearDrag}
        onDragOver={(e) => {
          if (acceptsProjectDrop()) {
            e.preventDefault()
            setDropTarget(true)
          }
        }}
        onDragLeave={() => setDropTarget(false)}
        onDrop={(e) => {
          e.stopPropagation()
          setDropTarget(false)
          const d = getDrag()
          if (d?.kind === 'project') props.onReorderProject(d.projectId, props.index)
        }}
        className={[
          'row-smooth flex items-center gap-2 rounded-md px-2 py-1.5',
          active ? 'bg-surface/50' : 'hover:bg-surface/40',
          dropTarget ? 'ring-1 ring-gold' : '',
        ].join(' ')}
      >
        <button
          onClick={props.onToggleCollapse}
          className="flex h-4 w-4 shrink-0 items-center justify-center text-ink-dim hover:text-ink"
          title={project.collapsed ? 'Expand' : 'Collapse'}
        >
          <span className={project.collapsed ? '' : 'rotate-90'} style={{ transition: 'transform 120ms' }}>
            ›
          </span>
        </button>

        {renaming ? (
          <>
            <span
              className={chipClass(active)}
              style={{ backgroundColor: project.color }}
            >
              {project.name.charAt(0).toUpperCase()}
            </span>
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') setRenaming(false)
              }}
              className="min-w-0 flex-1 rounded bg-canvas px-1 text-sm text-ink outline-none ring-1 ring-gold"
            />
          </>
        ) : (
          // Clicking the chip or name opens the project's first session, no
          // expand needed. The chevron alone toggles collapse.
          <button
            onClick={props.onOpenProject}
            title={`Open ${project.name}`}
            className="group/open flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <span
              className={`${chipClass(active)} group-hover/open:-translate-y-px`}
              style={{ backgroundColor: project.color }}
            >
              {project.name.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
              {project.name}
            </span>
          </button>
        )}

        {project.branch && (
          <span className="max-w-20 truncate rounded bg-line px-1.5 py-0.5 text-[10px] text-ink-dim">
            {project.branch}
          </span>
        )}

        <span className="group-hover/project:hidden">
          {project.collapsed && sessions.length > 0 ? (
            <span className="text-[11px] text-ink-dim">{sessions.length}</span>
          ) : (
            <StatusDot status={status} />
          )}
        </span>

        <div className="relative hidden items-center gap-0.5 group-hover/project:flex">
          <ActionButton title="New Claude session" onClick={props.onNewClaude}>
            C
          </ActionButton>
          <ActionButton title="New shell" onClick={props.onNewShell}>
            S
          </ActionButton>
          <ActionButton title="More" onClick={() => setMenuOpen((v) => !v)}>
            ⋯
          </ActionButton>
          {menuOpen && (
            <ProjectMenu
              onRename={() => {
                setDraftName(project.name)
                setRenaming(true)
                setMenuOpen(false)
              }}
              onRecolor={(c) => {
                props.onRecolor(c)
              }}
              onClose={() => {
                props.onClose()
                setMenuOpen(false)
              }}
              dismiss={() => setMenuOpen(false)}
            />
          )}
        </div>
      </div>

      {!project.collapsed && (
        <div className="mt-0.5 flex flex-col gap-0.5 pb-1">
          {sessions.length === 0 ? (
            <div className="py-2 pl-6 text-xs text-ink-dim">No sessions yet</div>
          ) : (
            sessions.map((s, i) => (
              <SessionRow
                key={s.id}
                session={s}
                projectId={project.id}
                index={i}
                active={s.id === activeSessionId}
                onFocus={() => props.onFocusSession(s.id)}
                onClose={() => props.onCloseSession(s.id)}
                onReorder={props.onReorderSession}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// The project initial chip: raised with an inner highlight, gold-ringed when
// the project owns the active session.
function chipClass(active: boolean): string {
  return [
    'chip-raise flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-semibold text-deep-navy',
    active ? 'ring-1 ring-gold' : '',
  ].join(' ')
}

function ActionButton(props: {
  title: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      title={props.title}
      onClick={props.onClick}
      className="flex h-5 w-5 items-center justify-center rounded text-xs text-ink-dim hover:bg-line hover:text-ink"
    >
      {props.children}
    </button>
  )
}

function ProjectMenu(props: {
  onRename: () => void
  onRecolor: (color: string) => void
  onClose: () => void
  dismiss: () => void
}): React.JSX.Element {
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={props.dismiss} />
      <div className="absolute right-0 top-6 z-20 w-44 rounded-lg border border-line bg-surface p-1 shadow-xl">
        <button
          onClick={props.onRename}
          className="block w-full rounded px-2 py-1.5 text-left text-sm text-ink hover:bg-line"
        >
          Rename
        </button>
        <div className="px-2 py-1.5">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-ink-dim">Colour</div>
          <div className="flex gap-1.5">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => props.onRecolor(c)}
                title={c}
                className="h-4 w-4 rounded-full ring-1 ring-line"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <button
          onClick={props.onClose}
          className="block w-full rounded px-2 py-1.5 text-left text-sm text-error hover:bg-line"
        >
          Close project
        </button>
      </div>
    </>
  )
}
