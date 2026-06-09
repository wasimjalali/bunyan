import { describe, expect, it } from 'vitest'
import { FlowGate } from './flow-gate'

describe('FlowGate', () => {
  it('stays open under the high watermark', () => {
    const g = new FlowGate(100, 25)
    expect(g.add(99)).toBe(null)
  })
  it('asks to pause when outstanding crosses the high watermark', () => {
    const g = new FlowGate(100, 25)
    expect(g.add(60)).toBe(null)
    expect(g.add(60)).toBe('pause')
    expect(g.add(10)).toBe(null) // already paused, no repeat signal
  })
  it('asks to resume only when acks drop outstanding below the low watermark', () => {
    const g = new FlowGate(100, 25)
    g.add(120)
    expect(g.ack(50)).toBe(null) // 70 still >= low
    expect(g.ack(50)).toBe('resume') // 20 < low
    expect(g.ack(50)).toBe(null) // clamped at 0, no repeat
  })
  it('re-pauses on a fresh flood after a resume', () => {
    const g = new FlowGate(100, 25)
    g.add(120)
    expect(g.ack(100)).toBe('resume') // 20 < low, gate re-arms
    expect(g.add(90)).toBe('pause') // 110 >= high, second crossing signals again
  })
  it('reset clears outstanding and paused state', () => {
    const g = new FlowGate(100, 25)
    g.add(120)
    g.reset()
    expect(g.add(99)).toBe(null)
  })
})
