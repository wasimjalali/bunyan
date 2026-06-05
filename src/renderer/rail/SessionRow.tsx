import type { Session } from '@shared/types'
import { StatusDot } from './StatusDot'

interface SessionRowProps {
  session: Session
  active: boolean
  onFocus: () => void
  onClose: () => void
}

export function SessionRow({ session, active, onFocus, onClose }: SessionRowProps): React.JSX.Element {
  return (
    <div
      onClick={onFocus}
      className={[
        'group/session relative flex cursor-pointer items-center gap-2 rounded-md py-1 pl-6 pr-2 text-sm',
        active ? 'bg-navy-surface text-cream-surface' : 'text-muted hover:bg-navy-surface/40',
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
        className="hidden h-4 w-4 items-center justify-center rounded text-muted hover:text-cream-surface group-hover/session:flex"
      >
        ×
      </button>
    </div>
  )
}
