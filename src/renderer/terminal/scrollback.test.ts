import { describe, it, expect } from 'vitest'
import type { Terminal } from '@xterm/xterm'
import { captureScrollback } from './scrollback'

// Minimal stand-in for the bits of Terminal that captureScrollback touches.
function mockTerm(lines: string[]): Terminal {
  return {
    buffer: {
      active: {
        length: lines.length,
        getLine: (i: number) => ({ translateToString: () => lines[i] ?? '' }),
      },
    },
  } as unknown as Terminal
}

describe('captureScrollback', () => {
  it('joins lines and drops trailing blanks', () => {
    expect(captureScrollback(mockTerm(['a', 'b', '', '']))).toBe('a\r\nb')
  })

  it('keeps interior blank lines', () => {
    expect(captureScrollback(mockTerm(['a', '', 'b']))).toBe('a\r\n\r\nb')
  })

  it('keeps only the last maxLines', () => {
    const lines = Array.from({ length: 1500 }, (_, i) => `line ${i}`)
    const out = captureScrollback(mockTerm(lines), 1000).split('\r\n')
    expect(out).toHaveLength(1000)
    expect(out[0]).toBe('line 500')
    expect(out[out.length - 1]).toBe('line 1499')
  })

  it('returns empty for an all-blank buffer', () => {
    expect(captureScrollback(mockTerm(['', '   ', '']))).toBe('')
  })
})
