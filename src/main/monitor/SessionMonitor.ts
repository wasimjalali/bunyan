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
  // Fires when a 'working' pane produces no output for silenceAlertSeconds.
  silenceTimer: ReturnType<typeof setTimeout> | null
  // True once a silence alert has fired; cleared on the next data chunk so a
  // single stall can't notify repeatedly.
  silenceNotified: boolean
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
  // Notify when a 'working' pane goes quiet for this many seconds (0 = off).
  private silenceAlertSeconds = 0

  constructor(
    private readonly emit: MonitorEmit,
    private readonly notifier: Notifier,
    options: { quietMs?: number } = {},
  ) {
    this.quietMs = options.quietMs ?? DEFAULT_QUIET_MS
  }

  register(ptyId: string, sessionId: string, projectName?: string): void {
    // A renderer reload re-creates panes with their persisted ptyIds while this
    // monitor (main process) survives. Clear the old entry's timers before
    // overwriting, or an orphaned quiet/silence timer fires against the
    // recycled pane. Mirrors the duplicate-create guard in PtyManager.
    const prev = this.panes.get(ptyId)
    if (prev) {
      this.clearQuiet(prev)
      this.clearSilence(prev)
    }
    this.panes.set(ptyId, {
      sessionId,
      status: 'idle',
      tail: '',
      quietTimer: null,
      silenceTimer: null,
      silenceNotified: false,
    })
    if (projectName) this.sessionLabel.set(sessionId, projectName)
    this.recompute(sessionId)
  }

  onData(ptyId: string, chunk: string): void {
    const pane = this.panes.get(ptyId)
    if (!pane) return
    const sig = analyzeChunk(chunk)
    pane.tail = updateTail(pane.tail, chunk)

    // An agent- or shell-authored OSC 9/777 notification is a zero-false-positive
    // "needs you" signal. When the session is unfocused, fire ONE notification
    // carrying the agent's message, then raise needs-input via the same event as
    // a Claude confirm. We notify here (not via recompute) so the body is the
    // agent's text; the suppression flag keeps recompute from double-notifying.
    if (sig.oscNotification && !this.isFocused(pane.sessionId)) {
      if (this.notificationsEnabled) {
        this.notifier.notify(pane.sessionId, this.sessionLabel.get(pane.sessionId) ?? '', {
          silent: this.bellMode !== 'sound',
          ...(sig.oscNotification.title !== null ? { title: sig.oscNotification.title } : {}),
          body: sig.oscNotification.body,
        })
      }
      this.apply(ptyId, { type: 'claude-confirm' }, { suppressNotify: true })
    }

    if (sig.bell && this.bellMode !== 'off') this.apply(ptyId, { type: 'bell' })
    if (sig.claudeConfirm) this.apply(ptyId, { type: 'claude-confirm' })
    if (sig.title && titleSuggestsWaiting(sig.title)) this.apply(ptyId, { type: 'claude-confirm' })
    if (sig.claudeWorking) this.apply(ptyId, { type: 'claude-working' })
    else if (sig.hasOutput) this.apply(ptyId, { type: 'activity' })

    if (sig.hasOutput || sig.claudeWorking) this.scheduleQuiet(ptyId)
    // Fresh output clears any prior silence alert and re-arms the timer, so a
    // stall is measured from the LAST byte the pane produced.
    pane.silenceNotified = false
    this.scheduleSilence(ptyId)
  }

  onExit(ptyId: string): void {
    const pane = this.panes.get(ptyId)
    if (!pane) return
    this.clearQuiet(pane)
    // Emit the exit transition WHILE the pane still exists, so a single-pane
    // session still shows 'exited' to the renderer, then drop it. Without the
    // drop the pane/session maps grow forever and the label is never cleared.
    this.apply(ptyId, { type: 'exit' })
    this.dropPane(ptyId)
  }

  /** Pane removed (session/pane closed). Stops tracking and refreshes the session. */
  remove(ptyId: string): void {
    const pane = this.panes.get(ptyId)
    if (!pane) return
    const { sessionId } = pane
    this.dropPane(ptyId)
    // A surviving sibling pane may now drive a different aggregate; recompute so
    // the renderer sees it. (For the last pane, dropPane already cleared maps.)
    this.recompute(sessionId)
  }

  setActiveSession(sessionId: string | null): void {
    this.activeSessionId = sessionId
    if (sessionId) this.focusSession(sessionId)
  }

  setWindowFocused(focused: boolean): void {
    this.windowFocused = focused
    if (focused && this.activeSessionId) this.focusSession(this.activeSessionId)
  }

  setNotifyPrefs(prefs: {
    notifications: boolean
    bell: BellMode
    silenceAlertSeconds: number
  }): void {
    this.notificationsEnabled = prefs.notifications
    this.bellMode = prefs.bell
    this.silenceAlertSeconds = prefs.silenceAlertSeconds
  }

  dispose(): void {
    for (const pane of this.panes.values()) {
      this.clearQuiet(pane)
      this.clearSilence(pane)
    }
    this.panes.clear()
  }

  /** Test-only seam: how many panes are still tracked. */
  paneCount(): number {
    return this.panes.size
  }

  // --- internals ---

  /**
   * Forget a pane: stop its timer, remove it, and once its session has no panes
   * left, drop the session's status and label too. Does not emit; the caller
   * decides whether a status change should reach the renderer first.
   */
  private dropPane(ptyId: string): void {
    const pane = this.panes.get(ptyId)
    if (!pane) return
    this.clearQuiet(pane)
    this.clearSilence(pane)
    this.panes.delete(ptyId)
    let stillHasPanes = false
    for (const p of this.panes.values()) {
      if (p.sessionId === pane.sessionId) {
        stillHasPanes = true
        break
      }
    }
    if (!stillHasPanes) {
      this.sessionStatus.delete(pane.sessionId)
      this.sessionLabel.delete(pane.sessionId)
      this.updateBadge()
    }
  }

  private isFocused(sessionId: string): boolean {
    return this.windowFocused && this.activeSessionId === sessionId
  }

  private focusSession(sessionId: string): void {
    for (const [ptyId, pane] of this.panes) {
      if (pane.sessionId === sessionId) this.apply(ptyId, { type: 'focus' })
    }
  }

  // suppressNotify: the caller already fired a notification for this transition
  // (the OSC path, whose body is the agent's own message), so recompute must not
  // add the generic needs-input one on top.
  private apply(ptyId: string, event: StatusEvent, opts?: { suppressNotify: boolean }): void {
    const pane = this.panes.get(ptyId)
    if (!pane) return
    const before = pane.status
    pane.status = nextStatus(before, event, { focused: this.isFocused(pane.sessionId) })
    if (pane.status !== before) this.recompute(pane.sessionId, opts?.suppressNotify)
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

  /**
   * (Re)arm the per-pane silence alert: if the pane is 'working' (or will be,
   * once the quiet window settles) and silenceAlertSeconds is on, fire one
   * notification after that many seconds of no output. Disabled when the pref is
   * 0. Shares the same timer seam as the quiet timer so the fake-timer tests
   * drive both. The fire callback re-checks 'working' so a pane that has since
   * gone idle or needs-input does not get a stale silence alert.
   */
  private scheduleSilence(ptyId: string): void {
    const pane = this.panes.get(ptyId)
    if (!pane) return
    this.clearSilence(pane)
    if (this.silenceAlertSeconds <= 0) return
    const seconds = this.silenceAlertSeconds
    pane.silenceTimer = setTimeout(() => {
      pane.silenceTimer = null
      if (pane.status !== 'working' || pane.silenceNotified) return
      pane.silenceNotified = true
      if (this.notificationsEnabled && !this.isFocused(pane.sessionId)) {
        this.notifier.notify(pane.sessionId, this.sessionLabel.get(pane.sessionId) ?? '', {
          silent: this.bellMode !== 'sound',
          body: `Still working but quiet for ${seconds}s`,
        })
      }
    }, seconds * 1000)
  }

  private clearSilence(pane: PaneState): void {
    if (pane.silenceTimer) {
      clearTimeout(pane.silenceTimer)
      pane.silenceTimer = null
    }
  }

  private recompute(sessionId: string, suppressNotify = false): void {
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
      this.notificationsEnabled &&
      !suppressNotify
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
