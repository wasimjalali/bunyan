import { describe, it, expect } from 'vitest'
import { nextStatus, aggregateStatus } from './state-machine'
import type { SessionStatus } from '@shared/types'

const unfocused = { focused: false }
const focused = { focused: true }

describe('nextStatus', () => {
  it('spawns idle', () => {
    expect(nextStatus('idle', { type: 'spawn' }, unfocused)).toBe('idle')
  })

  it('goes to working on activity', () => {
    expect(nextStatus('idle', { type: 'activity' }, unfocused)).toBe('working')
  })

  it('drops working to idle only on quiet with a prompt-like tail', () => {
    expect(nextStatus('working', { type: 'quiet', promptLikeTail: true }, unfocused)).toBe('idle')
    expect(nextStatus('working', { type: 'quiet', promptLikeTail: false }, unfocused)).toBe('working')
  })

  it('a bell raises needs-input only while unfocused', () => {
    expect(nextStatus('working', { type: 'bell' }, unfocused)).toBe('needs-input')
    expect(nextStatus('working', { type: 'bell' }, focused)).toBe('working')
  })

  it('a Claude confirmation behaves like a bell', () => {
    expect(nextStatus('idle', { type: 'claude-confirm' }, unfocused)).toBe('needs-input')
    expect(nextStatus('idle', { type: 'claude-confirm' }, focused)).toBe('idle')
  })

  it('generic output does not clear needs-input, but a Claude working signal does', () => {
    expect(nextStatus('needs-input', { type: 'activity' }, unfocused)).toBe('needs-input')
    expect(nextStatus('needs-input', { type: 'claude-working' }, unfocused)).toBe('working')
  })

  it('gaining focus clears needs-input to idle', () => {
    expect(nextStatus('needs-input', { type: 'focus' }, focused)).toBe('idle')
    expect(nextStatus('working', { type: 'focus' }, focused)).toBe('working')
  })

  it('exit wins', () => {
    expect(nextStatus('working', { type: 'exit' }, unfocused)).toBe('exited')
  })
})

describe('aggregateStatus', () => {
  it('needs-input outranks everything', () => {
    expect(aggregateStatus(['idle', 'working', 'needs-input'])).toBe('needs-input')
  })
  it('working outranks idle and exited', () => {
    expect(aggregateStatus(['exited', 'idle', 'working'])).toBe('working')
  })
  it('idle outranks exited', () => {
    expect(aggregateStatus(['exited', 'idle'])).toBe('idle')
  })
  it('exited only wins when all panes have exited', () => {
    expect(aggregateStatus(['exited', 'exited'])).toBe('exited')
  })
  it('no panes aggregates to exited', () => {
    expect(aggregateStatus([] as SessionStatus[])).toBe('exited')
  })
})
