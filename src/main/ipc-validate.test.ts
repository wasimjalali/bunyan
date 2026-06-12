import { describe, it, expect } from 'vitest'
import {
  validateCreate,
  validateWrite,
  validateResize,
  validateKill,
  validateAck,
  validateGitBranch,
  validateNotifyPrefs,
  validateOpenInEditor,
} from './ipc-validate'

const goodCreate = {
  sessionId: 's1',
  paneId: 'p1',
  kind: 'shell',
  cwd: '/tmp',
  cols: 80,
  rows: 24,
}

describe('ipc-validate', () => {
  it('accepts a well-formed create request', () => {
    expect(validateCreate(goodCreate)).toMatchObject({ sessionId: 's1', cols: 80, kind: 'shell' })
  })

  it('rejects a non-object payload', () => {
    expect(() => validateCreate(null)).toThrow()
    expect(() => validateCreate('nope')).toThrow()
  })

  it('rejects an unknown session kind', () => {
    expect(() => validateCreate({ ...goodCreate, kind: 'rootkit' })).toThrow()
  })

  it('rejects out-of-range dimensions', () => {
    expect(() => validateCreate({ ...goodCreate, cols: 0 })).toThrow()
    expect(() => validateCreate({ ...goodCreate, rows: 99999 })).toThrow()
    expect(() => validateCreate({ ...goodCreate, cols: 12.5 })).toThrow()
  })

  it('rejects an empty id', () => {
    expect(() => validateCreate({ ...goodCreate, paneId: '' })).toThrow()
  })

  it('allows an optional shell, but rejects a non-string one', () => {
    expect(validateCreate({ ...goodCreate, shell: '/bin/bash' }).shell).toBe('/bin/bash')
    expect(() => validateCreate({ ...goodCreate, shell: 123 })).toThrow()
  })

  it('accepts absolute and ~/ claudeConfigDir paths only', () => {
    expect(
      validateCreate({ ...goodCreate, claudeConfigDir: '/Users/me/.claude-personal' })
        .claudeConfigDir,
    ).toBe('/Users/me/.claude-personal')
    expect(validateCreate({ ...goodCreate, claudeConfigDir: '~/.claude-work' }).claudeConfigDir).toBe(
      '~/.claude-work',
    )
    expect(validateCreate(goodCreate).claudeConfigDir).toBeUndefined()
    expect(() => validateCreate({ ...goodCreate, claudeConfigDir: 'relative/dir' })).toThrow()
    expect(() => validateCreate({ ...goodCreate, claudeConfigDir: '/dir\nVAR=evil' })).toThrow()
    expect(() => validateCreate({ ...goodCreate, claudeConfigDir: '/dir\0' })).toThrow()
    expect(() => validateCreate({ ...goodCreate, claudeConfigDir: 42 })).toThrow()
  })

  it('bounds the write payload size', () => {
    expect(validateWrite({ paneId: 'p1', data: 'hi' }).data).toBe('hi')
    expect(() => validateWrite({ paneId: 'p1', data: 'x'.repeat(2_000_000) })).toThrow()
  })

  it('validates resize and kill', () => {
    expect(validateResize({ paneId: 'p1', cols: 100, rows: 30 }).cols).toBe(100)
    expect(validateKill({ paneId: 'p1' }).paneId).toBe('p1')
    expect(() => validateKill({})).toThrow()
  })

  it('validates a flow-control ack, bounding the char count', () => {
    expect(validateAck({ paneId: 'p1', chars: 4096 }).chars).toBe(4096)
    expect(() => validateAck({ paneId: 'p1', chars: 0 })).toThrow()
    expect(() => validateAck({ paneId: 'p1', chars: 1.5 })).toThrow()
    expect(() => validateAck({ paneId: 'p1', chars: 20_000_000 })).toThrow()
    expect(() => validateAck({ paneId: '', chars: 1 })).toThrow()
  })

  it('validates a git branch request', () => {
    expect(validateGitBranch({ path: '/repo' }).path).toBe('/repo')
    expect(() => validateGitBranch({})).toThrow()
  })

  it('accepts a safe runOnStart command but rejects control characters', () => {
    expect(validateCreate({ ...goodCreate, runOnStart: 'claude' }).runOnStart).toBe('claude')
    expect(() => validateCreate({ ...goodCreate, runOnStart: 'claude\nrm -rf /' })).toThrow()
  })

  it('validates notification preferences', () => {
    expect(
      validateNotifyPrefs({ notifications: true, bell: 'sound', silenceAlertSeconds: 30 }),
    ).toEqual({
      notifications: true,
      bell: 'sound',
      silenceAlertSeconds: 30,
    })
    expect(
      validateNotifyPrefs({ notifications: false, bell: 'off', silenceAlertSeconds: 0 }).bell,
    ).toBe('off')
    expect(() =>
      validateNotifyPrefs({ notifications: 'yes', bell: 'off', silenceAlertSeconds: 0 }),
    ).toThrow()
    expect(() =>
      validateNotifyPrefs({ notifications: true, bell: 'kaboom', silenceAlertSeconds: 0 }),
    ).toThrow()
    // silenceAlertSeconds must be a non-negative integer within range.
    expect(() =>
      validateNotifyPrefs({ notifications: true, bell: 'off', silenceAlertSeconds: -1 }),
    ).toThrow()
  })

  it('validates an open-in-editor request', () => {
    expect(
      validateOpenInEditor({ path: '/Users/x/a.ts', line: 12, col: 3, editor: 'vscode' }),
    ).toEqual({ path: '/Users/x/a.ts', line: 12, col: 3, editor: 'vscode' })
    // line/col are optional.
    expect(validateOpenInEditor({ path: '/a.ts', editor: 'zed' })).toEqual({
      path: '/a.ts',
      line: undefined,
      col: undefined,
      editor: 'zed',
    })
  })

  it('rejects a bad open-in-editor request', () => {
    expect(() => validateOpenInEditor({ path: '', editor: 'vscode' })).toThrow()
    expect(() => validateOpenInEditor({ path: 'relative/a.ts', editor: 'vscode' })).toThrow()
    expect(() => validateOpenInEditor({ path: '/a\0b.ts', editor: 'vscode' })).toThrow()
    expect(() => validateOpenInEditor({ path: '/a.ts', editor: 'vim' })).toThrow()
    expect(() => validateOpenInEditor({ path: '/a.ts', line: 0, editor: 'vscode' })).toThrow()
    expect(() =>
      validateOpenInEditor({ path: '/a.ts', line: 2_000_000, editor: 'vscode' }),
    ).toThrow()
  })
})
