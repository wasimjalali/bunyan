import type { SessionStatus } from '@shared/types'

// Events the status state machine reacts to. Detectors translate raw PTY bytes
// into these; the machine is a pure function of (status, event, context).
export type StatusEvent =
  | { type: 'spawn' }
  | { type: 'activity' } // bytes flowing that are not a recognised Claude signal
  | { type: 'quiet'; promptLikeTail: boolean } // the output went quiet
  | { type: 'bell' } // terminal bell (\x07): strongest "needs you"
  | { type: 'claude-working' } // Claude's working spinner / "esc to interrupt"
  | { type: 'claude-confirm' } // a Claude confirmation prompt
  | { type: 'focus' } // the session gained focus
  | { type: 'exit' } // the pane's process exited

export interface TransitionCtx {
  /** True when this session is the active one and the window is focused. */
  focused: boolean
}

export type { SessionStatus }
