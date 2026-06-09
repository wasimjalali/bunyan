import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SessionMonitor, type MonitorEmit } from './SessionMonitor'
import type { Notifier } from '../notifications'
import type { SessionStatus } from '@shared/types'
import { fixtures } from './fixtures'

function setup() {
  const statuses: Array<{ sessionId: string; status: SessionStatus }> = []
  const emit: MonitorEmit = {
    onStatus: (sessionId, status) => statuses.push({ sessionId, status }),
  }
  const notify = vi.fn()
  const setBadgeCount = vi.fn()
  const notifier: Notifier = { notify, setBadgeCount }
  const monitor = new SessionMonitor(emit, notifier, { quietMs: 700 })
  return { monitor, statuses, notify, setBadgeCount }
}

const last = (xs: Array<{ status: SessionStatus }>): SessionStatus | undefined =>
  xs[xs.length - 1]?.status

describe('SessionMonitor', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('registers a pane as idle', () => {
    const { monitor, statuses } = setup()
    monitor.register('pty1', 'ses1')
    expect(last(statuses)).toBe('idle')
  })

  it('goes working on output, then idle after the quiet window at a prompt', () => {
    const { monitor, statuses } = setup()
    monitor.register('pty1', 'ses1')
    monitor.onData('pty1', fixtures.shellRunning)
    expect(last(statuses)).toBe('working')
    // Output settles at a prompt -> idle after the quiet window.
    monitor.onData('pty1', fixtures.shellPrompt)
    vi.advanceTimersByTime(700)
    expect(last(statuses)).toBe('idle')
  })

  it('rings the bell to needs-input and notifies when the session is not focused', () => {
    const { monitor, statuses, notify, setBadgeCount } = setup()
    monitor.register('pty1', 'ses1', 'alpha')
    monitor.setActiveSession('other') // ses1 is not focused
    monitor.onData('pty1', fixtures.bell)
    expect(last(statuses)).toBe('needs-input')
    expect(notify).toHaveBeenCalledWith('ses1', 'alpha', { silent: true })
    expect(setBadgeCount).toHaveBeenLastCalledWith(1)
  })

  it('does not raise needs-input while the session is focused', () => {
    const { monitor, statuses, notify } = setup()
    monitor.register('pty1', 'ses1')
    monitor.setActiveSession('ses1') // focused
    monitor.onData('pty1', fixtures.bell)
    expect(last(statuses)).not.toBe('needs-input')
    expect(notify).not.toHaveBeenCalled()
  })

  it('focusing a needs-input session clears it and the badge', () => {
    const { monitor, statuses, setBadgeCount } = setup()
    monitor.register('pty1', 'ses1')
    monitor.setActiveSession('other')
    monitor.onData('pty1', fixtures.bell)
    expect(last(statuses)).toBe('needs-input')
    monitor.setActiveSession('ses1') // now focused
    expect(last(statuses)).toBe('idle')
    expect(setBadgeCount).toHaveBeenLastCalledWith(0)
  })

  it('a Claude confirmation prompt while unfocused needs input', () => {
    const { monitor, statuses, notify } = setup()
    monitor.register('pty1', 'ses1', 'beta')
    monitor.setActiveSession(null)
    monitor.onData('pty1', fixtures.claudeConfirm)
    expect(last(statuses)).toBe('needs-input')
    expect(notify).toHaveBeenCalledWith('ses1', 'beta', { silent: true })
  })

  it('aggregates two panes: needs-input wins until cleared', () => {
    const { monitor, statuses } = setup()
    monitor.register('p1', 'ses1')
    monitor.register('p2', 'ses1')
    monitor.setActiveSession('other')
    monitor.onData('p1', fixtures.shellRunning) // working
    monitor.onData('p2', fixtures.bell) // needs-input
    expect(last(statuses)).toBe('needs-input')
  })

  it('respects notifications-off: status still changes but no notification fires', () => {
    const { monitor, statuses, notify } = setup()
    monitor.setNotifyPrefs({ notifications: false, bell: 'status-only', silenceAlertSeconds: 0 })
    monitor.register('pty1', 'ses1', 'alpha')
    monitor.setActiveSession('other')
    monitor.onData('pty1', fixtures.bell)
    expect(last(statuses)).toBe('needs-input')
    expect(notify).not.toHaveBeenCalled()
  })

  it('respects bell-off: a bell no longer raises needs-input', () => {
    const { monitor, statuses } = setup()
    monitor.setNotifyPrefs({ notifications: true, bell: 'off', silenceAlertSeconds: 0 })
    monitor.register('pty1', 'ses1')
    monitor.setActiveSession('other')
    monitor.onData('pty1', fixtures.bell)
    expect(last(statuses)).not.toBe('needs-input')
  })

  it('plays a sound on notify when the bell mode is sound', () => {
    const { monitor, notify } = setup()
    monitor.setNotifyPrefs({ notifications: true, bell: 'sound', silenceAlertSeconds: 0 })
    monitor.register('pty1', 'ses1', 'alpha')
    monitor.setActiveSession('other')
    monitor.onData('pty1', fixtures.bell)
    expect(notify).toHaveBeenCalledWith('ses1', 'alpha', { silent: false })
  })

  it('marks a session exited only when all its panes exit', () => {
    const { monitor, statuses } = setup()
    monitor.register('p1', 'ses1')
    monitor.register('p2', 'ses1')
    monitor.onExit('p1')
    expect(last(statuses)).not.toBe('exited') // p2 still alive (idle)
    monitor.onExit('p2')
    expect(last(statuses)).toBe('exited')
  })

  it('an OSC notification while unfocused needs input and notifies once with the message', () => {
    const { monitor, statuses, notify } = setup()
    monitor.register('pty1', 'ses1', 'alpha')
    monitor.setActiveSession('other') // ses1 is not focused
    monitor.onData('pty1', '\x1b]9;Claude needs your approval\x07')
    expect(last(statuses)).toBe('needs-input')
    // Exactly one notification, carrying the agent-authored body verbatim.
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith('ses1', 'alpha', {
      silent: true,
      body: 'Claude needs your approval',
    })
  })

  it('notifies once when a working session goes quiet, and re-arms on new data', () => {
    const { monitor, notify } = setup()
    monitor.setNotifyPrefs({ notifications: true, bell: 'status-only', silenceAlertSeconds: 5 })
    monitor.register('pty1', 'ses1', 'alpha')
    monitor.setActiveSession('other')
    monitor.onData('pty1', fixtures.shellRunning) // -> working, arms the silence timer
    // The quiet window (700ms) settles first; the tail is not prompt-like, so the
    // pane stays 'working'. The silence timer (5s) then fires.
    vi.advanceTimersByTime(5000)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith('ses1', 'alpha', {
      silent: true,
      body: 'Still working but quiet for 5s',
    })
    // It must not spam: more silence with no new data does not re-notify.
    vi.advanceTimersByTime(5000)
    expect(notify).toHaveBeenCalledTimes(1)
    // New data re-arms the timer and clears the notified flag.
    monitor.onData('pty1', fixtures.shellRunning)
    vi.advanceTimersByTime(5000)
    expect(notify).toHaveBeenCalledTimes(2)
  })

  it('re-registering a live pane clears its old timers (renderer reload)', () => {
    const { monitor, notify } = setup()
    monitor.setNotifyPrefs({ notifications: true, bell: 'status-only', silenceAlertSeconds: 5 })
    monitor.register('pty1', 'ses1', 'alpha')
    monitor.setActiveSession('other')
    monitor.onData('pty1', fixtures.shellRunning) // working, silence timer armed
    // A renderer reload re-creates the pane with the same persisted ptyId. The
    // old pane's timers must not fire against the fresh registration.
    monitor.register('pty1', 'ses1', 'alpha')
    vi.advanceTimersByTime(60_000)
    expect(notify).not.toHaveBeenCalled()
  })

  it('does not arm the silence timer when silenceAlertSeconds is 0', () => {
    const { monitor, notify } = setup()
    monitor.register('pty1', 'ses1', 'alpha')
    monitor.setActiveSession('other')
    monitor.onData('pty1', fixtures.shellRunning)
    vi.advanceTimersByTime(60_000)
    expect(notify).not.toHaveBeenCalled()
  })

  it('drops a pane from its maps when the process exits on its own', () => {
    const { monitor, statuses } = setup()
    monitor.register('pty1', 'ses1', 'alpha')
    monitor.onData('pty1', fixtures.shellRunning)
    expect(monitor.paneCount()).toBe(1)
    monitor.onExit('pty1')
    // The exit still reaches the renderer for a single-pane session...
    expect(last(statuses)).toBe('exited')
    // ...but the pane entry is gone, so the maps don't grow unbounded.
    expect(monitor.paneCount()).toBe(0)
    // A later aggregate must not resurrect the dropped pane's status.
    statuses.length = 0
    monitor.setActiveSession('ses1')
    expect(statuses).toHaveLength(0)
  })
})
