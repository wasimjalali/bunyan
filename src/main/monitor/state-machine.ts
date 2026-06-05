import type { SessionStatus } from '@shared/types'
import type { StatusEvent, TransitionCtx } from './types'

/**
 * The pane-level status state machine (spec 9.3). Pure: same inputs, same
 * output. Time and focus live in the monitor; this only decides the next status.
 *
 * Key rules:
 *  - A bell or a Claude confirmation only raises "needs-input" while the session
 *    is NOT focused (if you're looking at it, you don't need a nudge).
 *  - Generic trailing output does not clear "needs-input" (the prompt is still
 *    waiting); only focus, or a definite Claude "working" signal, clears it.
 *  - Quiet only drops "working" to "idle" when the tail looks like a prompt.
 */
export function nextStatus(
  current: SessionStatus,
  event: StatusEvent,
  ctx: TransitionCtx,
): SessionStatus {
  switch (event.type) {
    case 'spawn':
      return 'idle'
    case 'exit':
      return 'exited'
    case 'activity':
      return current === 'needs-input' ? 'needs-input' : 'working'
    case 'claude-working':
      return 'working'
    case 'quiet':
      return current === 'working' && event.promptLikeTail ? 'idle' : current
    case 'bell':
    case 'claude-confirm':
      return ctx.focused ? current : 'needs-input'
    case 'focus':
      return current === 'needs-input' ? 'idle' : current
  }
}

const URGENCY: Record<SessionStatus, number> = {
  'needs-input': 3,
  working: 2,
  idle: 1,
  exited: 0,
}

/**
 * A session's status is its most urgent pane: needs-input > working > idle >
 * exited. "exited" only wins when every pane has exited.
 */
export function aggregateStatus(paneStatuses: SessionStatus[]): SessionStatus {
  if (paneStatuses.length === 0) return 'exited'
  return paneStatuses.reduce((most, s) => (URGENCY[s] > URGENCY[most] ? s : most), 'exited')
}
