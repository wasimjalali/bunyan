import { useState } from 'react'
import type { Session } from '@shared/types'
import { StatusDot } from './StatusDot'
import { setDrag, getDrag, clearDrag } from './dnd'

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
      onDrop={() => {
        setDropTarget(false)
        const d = getDrag()
        if (d?.kind === 'session' && d.projectId === projectId) onReorder(d.sessionId, index)
      }}
      onClick={onFocus}
      className={[
        'group/session relative flex cursor-pointer items-center gap-2 rounded-md py-1 pl-6 pr-2 text-sm',
        active ? 'bg-surface text-ink' : 'text-ink-dim hover:bg-surface/40',
        dropTarget ? 'ring-1 ring-gold' : '',
      ].join(' ')}
    >
      {active && (
        <span className="absolute left-1 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-gold" />
      )}
      <StatusDot status={session.status} />
      <span className="flex-1 truncate">{session.title}</span>
      {session.status === 'needs-input' && (
        <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gold">
          needs you
        </span>
      )}
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
