import type { BellMode, SessionStatus } from '@shared/types'
import type { Notifier } from '../notifications'
import { nextStatus, aggregateStatus } from './state-machine'
import {
  analyzeChunk,
  updateTail,
  isPromptLike,
  titleSuggestsWaiting,
} from './detectors'
import type { StatusEvent } from './types'

export interface MonitorEmit {
  onStatus(sessionId: string, status: SessionStatus, reason: string): void
}

interface PaneState {
  sessionId: string
  status: SessionStatus
  tail: string
  quietTimer: ReturnType<typeof setTimeout> | null
}

const DEFAULT_QUIET_MS = 700

/**
 * Owns per-pane status detection and aggregates it to per-session status.
 * Combines the pure detectors and state machine with the two stateful things
 * they can't own: time (the quiet timer) and focus. Emits session:status on
 * change, fires a notification and updates the dock badge for needs-input
 * sessions while they aren't focused. See spec 9.3 and 9.4.
 */
export class SessionMonitor {
  private readonly panes = new Map<string, PaneState>()
  private readonly sessionLabel = new Map<string, string>()
  private readonly sessionStatus = new Map<string, SessionStatus>()
  private activeSessionId: string | null = null
  private windowFocused = true
  private readonly quietMs: number
  private notificationsEnabled = true
  private bellMode: BellMode = 'status-only'

  constructor(
    private readonly emit: MonitorEmit,
    private readonly notifier: Notifier,
    options: { quietMs?: number } = {},
  ) {
    this.quietMs = options.quietMs ?? DEFAULT_QUIET_MS
  }

  register(ptyId: string, sessionId: string, projectName?: string): void {
    this.panes.set(ptyId, { sessionId, status: 'idle', tail: '', quietTimer: null })
    if (projectName) this.sessionLabel.set(sessionId, projectName)
    this.recompute(sessionId)
  }

  onData(ptyId: string, chunk: string): void {
    const pane = this.panes.get(ptyId)
    if (!pane) return
    const sig = analyzeChunk(chunk)
    pane.tail = updateTail(pane.tail, chunk)

    if (sig.bell && this.bellMode !== 'off') this.apply(ptyId, { type: 'bell' })
    if (sig.claudeConfirm) this.apply(ptyId, { type: 'claude-confirm' })
    if (sig.title && titleSuggestsWaiting(sig.title)) this.apply(ptyId, { type: 'claude-confirm' })
    if (sig.claudeWorking) this.apply(ptyId, { type: 'claude-working' })
    else if (sig.hasOutput) this.apply(ptyId, { type: 'activity' })

    if (sig.hasOutput || sig.claudeWorking) this.scheduleQuiet(ptyId)
  }

  onExit(ptyId: string): void {
    const pane = this.panes.get(ptyId)
    if (!pane) return
    this.clearQuiet(pane)
    this.apply(ptyId, { type: 'exit' })
  }

  /** Pane removed (session/pane closed). Stops tracking and refreshes the session. */
  remove(ptyId: string): void {
    const pane = this.panes.get(ptyId)
    if (!pane) return
    this.clearQuiet(pane)
    this.panes.delete(ptyId)
    this.recompute(pane.sessionId)
  }

  setActiveSession(sessionId: string | null): void {
    this.activeSessionId = sessionId
    if (sessionId) this.focusSession(sessionId)
  }

  setWindowFocused(focused: boolean): void {
    this.windowFocused = focused
    if (focused && this.activeSessionId) this.focusSession(this.activeSessionId)
  }

  setNotifyPrefs(prefs: { notifications: boolean; bell: BellMode }): void {
    this.notificationsEnabled = prefs.notifications
    this.bellMode = prefs.bell
  }

  dispose(): void {
    for (const pane of this.panes.values()) this.clearQuiet(pane)
    this.panes.clear()
  }

  // --- internals ---

  private isFocused(sessionId: string): boolean {
    return this.windowFocused && this.activeSessionId === sessionId
  }

  private focusSession(sessionId: string): void {
    for (const [ptyId, pane] of this.panes) {
      if (pane.sessionId === sessionId) this.apply(ptyId, { type: 'focus' })
    }
  }

  private apply(ptyId: string, event: StatusEvent): void {
    const pane = this.panes.get(ptyId)
    if (!pane) return
    const before = pane.status
    pane.status = nextStatus(before, event, { focused: this.isFocused(pane.sessionId) })
    if (pane.status !== before) this.recompute(pane.sessionId)
  }

  private scheduleQuiet(ptyId: string): void {
    const pane = this.panes.get(ptyId)
    if (!pane) return
    this.clearQuiet(pane)
    pane.quietTimer = setTimeout(() => {
      pane.quietTimer = null
      this.apply(ptyId, { type: 'quiet', promptLikeTail: isPromptLike(pane.tail) })
    }, this.quietMs)
  }

  private clearQuiet(pane: PaneState): void {
    if (pane.quietTimer) {
      clearTimeout(pane.quietTimer)
      pane.quietTimer = null
    }
  }

  private recompute(sessionId: string): void {
    const statuses: SessionStatus[] = []
    for (const pane of this.panes.values()) {
      if (pane.sessionId === sessionId) statuses.push(pane.status)
    }

    if (statuses.length === 0) {
      this.sessionStatus.delete(sessionId)
      this.updateBadge()
      return
    }

    const agg = aggregateStatus(statuses)
    const prev = this.sessionStatus.get(sessionId)
    if (agg === prev) return

    if (
      agg === 'needs-input' &&
      prev !== 'needs-input' &&
      !this.isFocused(sessionId) &&
      this.notificationsEnabled
    ) {
      this.notifier.notify(sessionId, this.sessionLabel.get(sessionId) ?? '', {
        silent: this.bellMode !== 'sound',
      })
    }

    this.sessionStatus.set(sessionId, agg)
    this.emit.onStatus(sessionId, agg, reasonFor(agg))
    this.updateBadge()
  }

  private updateBadge(): void {
    let count = 0
    for (const status of this.sessionStatus.values()) {
      if (status === 'needs-input') count++
    }
    this.notifier.setBadgeCount(count)
  }
}

function reasonFor(status: SessionStatus): string {
  switch (status) {
    case 'working':
      return 'output'
    case 'needs-input':
      return 'attention'
    case 'idle':
      return 'quiet'
    case 'exited':
      return 'exited'
  }
}
