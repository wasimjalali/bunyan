import { useLayoutEffect, useRef, useState } from 'react'
import type { Project, Session, SessionStatus } from '@shared/types'
import { StatusDot } from './StatusDot'
import { projectChipClass } from './badge'

interface ProjectHoverCardProps {
  project: Project
  sessions: Session[]
  /** The project's most urgent session status, as already shown on the row. */
  status: SessionStatus | null
  /** The row's viewport rect; the card flies out from the rail's inner edge. */
  anchor: DOMRect
  railSide: 'left' | 'right'
  onNewClaude: () => void
  onNewShell: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}

/**
 * The on-hover summary for a project row: full branch (no truncation pressure
 * here), per-status session counts, and the two session actions written out.
 * Fixed-position so the rail's scroll container can't clip it; it flips to
 * whichever side faces the terminal.
 */
export function ProjectHoverCard(props: ProjectHoverCardProps): React.JSX.Element {
  const { project, sessions, anchor, railSide } = props
  const cardRef = useRef<HTMLDivElement>(null)
  const [top, setTop] = useState(anchor.top)

  // Clamp to the viewport once the card's real height is known, so a row near
  // the bottom of the rail doesn't push the card off-screen. Re-clamps when the
  // branch arrives async, since that can grow the card after first paint.
  useLayoutEffect(() => {
    const h = cardRef.current?.offsetHeight ?? 0
    setTop(Math.max(8, Math.min(anchor.top, window.innerHeight - h - 8)))
  }, [anchor.top, project.branch, sessions.length])

  const sideStyle =
    railSide === 'right'
      ? { right: window.innerWidth - anchor.left + 8 }
      : { left: anchor.right + 8 }

  return (
    <div
      ref={cardRef}
      role="tooltip"
      onMouseEnter={props.onMouseEnter}
      onMouseLeave={props.onMouseLeave}
      style={{ top, ...sideStyle }}
      className="overlay-panel fixed z-30 w-64 rounded-lg border border-line bg-surface p-3 shadow-xl"
    >
      <div className="flex items-center gap-2">
        <span className={projectChipClass(false)} style={{ backgroundColor: project.color }}>
          {project.name.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 truncate text-sm font-medium text-ink">{project.name}</span>
      </div>

      <p className="mt-1 truncate text-xs text-ink-dim" title={project.path}>
        {project.path}
      </p>

      {project.branch && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-ink-dim">
          <BranchGlyph />
          <span className="min-w-0 break-all text-ink">{project.branch}</span>
        </div>
      )}

      <div className="mt-2 flex items-center gap-1.5 text-xs text-ink-dim">
        <StatusDot status={props.status} />
        <span>{statusSummary(sessions)}</span>
      </div>

      <div className="mt-3 flex gap-1.5">
        <button
          onClick={props.onNewClaude}
          className="row-smooth flex-1 rounded-md bg-gold/15 px-2 py-1.5 text-xs font-medium text-gold hover:bg-gold/25"
        >
          New Claude session
        </button>
        <button
          onClick={props.onNewShell}
          className="row-smooth flex-1 rounded-md border border-line px-2 py-1.5 text-xs font-medium text-ink hover:bg-line"
        >
          New shell
        </button>
      </div>
    </div>
  )
}

// "1 needs input · 2 working", most urgent first; quiet states only appear
// when nothing louder is running.
function statusSummary(sessions: Session[]): string {
  if (sessions.length === 0) return 'No sessions yet'
  const count = (status: Session['status']): number =>
    sessions.filter((s) => s.status === status).length
  const parts: string[] = []
  const needs = count('needs-input')
  const working = count('working')
  if (needs > 0) parts.push(`${needs} ${needs === 1 ? 'needs' : 'need'} input`)
  if (working > 0) parts.push(`${working} working`)
  if (parts.length === 0) {
    const idle = count('idle')
    if (idle > 0) parts.push(`${idle} idle`)
    const exited = count('exited')
    if (exited > 0) parts.push(`${exited} exited`)
  }
  return parts.join(' · ')
}

function BranchGlyph(): React.JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
      <circle cx="4" cy="3.5" r="1.75" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="4" cy="12.5" r="1.75" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="12" cy="5.5" r="1.75" stroke="currentColor" strokeWidth="1.25" />
      <path d="M4 5.25v5.5M12 7.25c0 2.5-3.5 2.25-6 3" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  )
}
