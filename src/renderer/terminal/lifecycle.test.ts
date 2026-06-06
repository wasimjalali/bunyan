import { describe, it, expect } from 'vitest'
import {
  markPtyClosed,
  wasPtyClosed,
  forgetClosedPty,
  stashPaneText,
  takePaneText,
} from './lifecycle'

// Distinct ids per test: the module state is process-wide by design.
describe('terminal lifecycle', () => {
  it('stashes and replays a pane text exactly once', () => {
    stashPaneText('pty-a', 'hello\r\nworld')
    expect(takePaneText('pty-a')).toBe('hello\r\nworld')
    // Reading clears it, so a second remount does not double-replay.
    expect(takePaneText('pty-a')).toBeUndefined()
  })

  it('treats empty text as nothing to stash', () => {
    stashPaneText('pty-b', '')
    expect(takePaneText('pty-b')).toBeUndefined()
  })

  it('marks a killed pty as closed and drops any stash for it', () => {
    stashPaneText('pty-c', 'leftover')
    markPtyClosed('pty-c')
    expect(wasPtyClosed('pty-c')).toBe(true)
    // A real close must not leave text to replay.
    expect(takePaneText('pty-c')).toBeUndefined()
  })

  it('forgetting a closed pty clears the flag', () => {
    markPtyClosed('pty-d')
    expect(wasPtyClosed('pty-d')).toBe(true)
    forgetClosedPty('pty-d')
    expect(wasPtyClosed('pty-d')).toBe(false)
  })

  it('reports unknown ptys as neither closed nor stashed', () => {
    expect(wasPtyClosed('pty-unknown')).toBe(false)
    expect(takePaneText('pty-unknown')).toBeUndefined()
  })
})
