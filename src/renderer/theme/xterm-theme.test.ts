import { describe, it, expect } from 'vitest'
import { xtermDark, xtermLight } from './xterm-theme'

const ANSI_SLOTS = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
] as const

const CORE = ['background', 'foreground', 'cursor', 'selectionBackground'] as const

describe('xterm theme tables', () => {
  for (const [name, theme] of [
    ['dark', xtermDark],
    ['light', xtermLight],
  ] as const) {
    it(`${name} defines every ANSI slot and core colour`, () => {
      for (const slot of ANSI_SLOTS) {
        expect(theme[slot], `${name}.${slot}`).toMatch(/^#[0-9a-fA-F]{6}$/)
      }
      for (const slot of CORE) {
        expect(theme[slot], `${name}.${slot}`).toBeTruthy()
      }
    })
  }

  it('uses the brand gold for the dark cursor and yellow', () => {
    expect(xtermDark.cursor).toBe('#D4A853')
    expect(xtermDark.yellow).toBe('#D4A853')
  })
})
