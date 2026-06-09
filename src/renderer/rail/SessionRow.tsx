import { useState } from 'react'
import type { Session } from '@shared/types'
import { useStore } from '../state/store'
import { StatusDot } from './StatusDot'
import { setDrag, getDrag, clearDrag } from './dnd'
import { railBadgeClass } from './badge'

interface SessionRowProps {
  session: Session
  projectId: string
  index: number
  active: boolean
  onFocus: () => void
  onClose: () => void
  onReorder: (draggedSessionId: string, toIndex: number) => void
}

export function SessionRow({
  session,
  projectId,
  index,
  active,
  onFocus,
  onClose,
  onReorder,
}: SessionRowProps): React.JSX.Element {
  const [dropTarget, setDropTarget] = useState(false)
  // New output in a background session. "needs you" outranks it, so we only show
  // the unread dot when the row is not active and not already flagged for input.
  const unread = useStore((s) => Boolean(s.unread[session.id]))
  const needsInput = session.status === 'needs-input'
  const showUnread = unread && !active && !needsInput

  const acceptsDrop = (): boolean => {
    const d = getDrag()
    return d?.kind === 'session' && d.projectId === projectId && d.sessionId !== session.id
  }

  return (
    <div
      draggable
      onDragStart={() => setDrag({ kind: 'session', projectId, sessionId: session.id })}
      onDragEnd={clearDrag}
      onDragOver={(e) => {
        if (acceptsDrop()) {
          e.preventDefault()
          setDropTarget(true)
        }
      }}
      onDragLeave={() => setDropTarget(false)}
      onDrop={(e) => {
        e.stopPropagation()
        setDropTarget(false)
        const d = getDrag()
        if (d?.kind === 'session' && d.projectId === projectId) onReorder(d.sessionId, index)
      }}
      onClick={onFocus}
      className={[
        'row-smooth group/session relative flex cursor-pointer items-center gap-2 rounded-md py-1 pl-6 pr-2 text-sm',
        active ? 'bg-surface text-ink' : 'text-ink-dim hover:bg-surface/40',
        dropTarget ? 'ring-1 ring-gold' : '',
      ].join(' ')}
    >
      {active && (
        <span className="absolute left-1 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-gold" />
      )}
      <StatusDot status={session.status} />
      <span className="flex-1 truncate">{session.title}</span>
      {showUnread && (
        <span className="text-xs leading-none text-gold" title="New output" aria-label="New output">
          •
        </span>
      )}
      {needsInput && <span className={railBadgeClass}>needs you</span>}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        title="Close session"
        className="hidden h-4 w-4 items-center justify-center rounded text-ink-dim hover:text-ink group-hover/session:flex"
      >
        ×
      </button>
    </div>
  )
}
