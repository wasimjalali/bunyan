import { describe, it, expect } from 'vitest'
import {
  validateCreate,
  validateWrite,
  validateResize,
  validateKill,
  validateGitBranch,
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

  it('bounds the write payload size', () => {
    expect(validateWrite({ paneId: 'p1', data: 'hi' }).data).toBe('hi')
    expect(() => validateWrite({ paneId: 'p1', data: 'x'.repeat(2_000_000) })).toThrow()
  })

  it('validates resize and kill', () => {
    expect(validateResize({ paneId: 'p1', cols: 100, rows: 30 }).cols).toBe(100)
    expect(validateKill({ paneId: 'p1' }).paneId).toBe('p1')
    expect(() => validateKill({})).toThrow()
  })

  it('validates a git branch request', () => {
    expect(validateGitBranch({ path: '/repo' }).path).toBe('/repo')
    expect(() => validateGitBranch({})).toThrow()
  })
})
