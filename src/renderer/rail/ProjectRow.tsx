import { useState } from 'react'
import { PROJECT_COLORS, type Project, type Session, type SessionStatus } from '@shared/types'
import { StatusDot } from './StatusDot'
import { SessionRow } from './SessionRow'

interface ProjectRowProps {
  project: Project
  sessions: Session[]
  status: SessionStatus | null
  activeSessionId: string | null
  onToggleCollapse: () => void
  onNewClaude: () => void
  onNewShell: () => void
  onRename: (name: string) => void
  onRecolor: (color: string) => void
  onClose: () => void
  onFocusSession: (id: string) => void
  onCloseSession: (id: string) => void
}

export function ProjectRow(props: ProjectRowProps): React.JSX.Element {
  const { project, sessions, status, activeSessionId } = props
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(project.name)

  const commitRename = (): void => {
    const trimmed = draftName.trim()
    if (trimmed && trimmed !== project.name) props.onRename(trimmed)
    setRenaming(false)
  }

  return (
    <div className="group/project select-none">
      <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-navy-surface/40">
        <button
          onClick={props.onToggleCollapse}
          className="flex h-4 w-4 shrink-0 items-center justify-center text-muted hover:text-cream-surface"
          title={project.collapsed ? 'Expand' : 'Collapse'}
        >
          <span className={project.collapsed ? '' : 'rotate-90'} style={{ transition: 'transform 120ms' }}>
            ›
          </span>
        </button>

        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-semibold text-deep-navy"
          style={{ backgroundColor: project.color }}
        >
          {project.name.charAt(0).toUpperCase()}
        </span>

        {renaming ? (
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') setRenaming(false)
            }}
            className="min-w-0 flex-1 rounded bg-deep-navy px-1 text-sm text-cream-surface outline-none ring-1 ring-gold"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-cream-surface">
            {project.name}
          </span>
        )}

        {project.branch && (
          <span className="max-w-20 truncate rounded bg-navy-line px-1.5 py-0.5 text-[10px] text-muted">
            {project.branch}
          </span>
        )}

        <span className="group-hover/project:hidden">
          {project.collapsed && sessions.length > 0 ? (
            <span className="text-[11px] text-muted">{sessions.length}</span>
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
            <div className="py-2 pl-6 text-xs text-muted">No sessions yet</div>
          ) : (
            sessions.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                active={s.id === activeSessionId}
                onFocus={() => props.onFocusSession(s.id)}
                onClose={() => props.onCloseSession(s.id)}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
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
      className="flex h-5 w-5 items-center justify-center rounded text-xs text-muted hover:bg-navy-line hover:text-cream-surface"
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
      <div className="absolute right-0 top-6 z-20 w-44 rounded-lg border border-navy-line bg-navy-surface p-1 shadow-xl">
        <button
          onClick={props.onRename}
          className="block w-full rounded px-2 py-1.5 text-left text-sm text-cream-surface hover:bg-navy-line"
        >
          Rename
        </button>
        <div className="px-2 py-1.5">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-muted">Colour</div>
          <div className="flex gap-1.5">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => props.onRecolor(c)}
                title={c}
                className="h-4 w-4 rounded-full ring-1 ring-navy-line"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <button
          onClick={props.onClose}
          className="block w-full rounded px-2 py-1.5 text-left text-sm text-error hover:bg-navy-line"
        >
          Close project
        </button>
      </div>
    </>
  )
}
