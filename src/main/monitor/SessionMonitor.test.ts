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
    monitor.setNotifyPrefs({ notifications: false, bell: 'status-only' })
    monitor.register('pty1', 'ses1', 'alpha')
    monitor.setActiveSession('other')
    monitor.onData('pty1', fixtures.bell)
    expect(last(statuses)).toBe('needs-input')
    expect(notify).not.toHaveBeenCalled()
  })

  it('respects bell-off: a bell no longer raises needs-input', () => {
    const { monitor, statuses } = setup()
    monitor.setNotifyPrefs({ notifications: true, bell: 'off' })
    monitor.register('pty1', 'ses1')
    monitor.setActiveSession('other')
    monitor.onData('pty1', fixtures.bell)
    expect(last(statuses)).not.toBe('needs-input')
  })

  it('plays a sound on notify when the bell mode is sound', () => {
    const { monitor, notify } = setup()
    monitor.setNotifyPrefs({ notifications: true, bell: 'sound' })
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
})
