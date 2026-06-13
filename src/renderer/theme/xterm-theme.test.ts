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

  it('keeps dark-mode body and dim text readable on the background', () => {
    // Main text comfortably readable.
    expect(contrast(xtermDark.foreground!, xtermDark.background!)).toBeGreaterThanOrEqual(7)
    // brightBlack is the dim/gray slot tools (including Claude Code's prompts
    // and hints) use for secondary text; it must not vanish into the dark bg.
    expect(contrast(xtermDark.brightBlack!, xtermDark.background!)).toBeGreaterThanOrEqual(4.5)
  })

  it('forces a readable foreground on selected (copied) text', () => {
    // Without a selectionForeground, dark glyphs stay dark under the highlight
    // and disappear when you select to copy. Dark mode is what the user hit; the
    // light table defines one too for consistency.
    expect(xtermDark.selectionForeground).toBeTruthy()
    expect(
      contrast(xtermDark.selectionForeground!, xtermDark.selectionBackground!),
    ).toBeGreaterThanOrEqual(4.5)
    expect(xtermLight.selectionForeground).toBeTruthy()
  })
})

// WCAG relative-luminance contrast ratio between two #rrggbb colours.
function contrast(a: string, b: string): number {
  const lum = (hex: string): number => {
    const channel = (offset: number): number => {
      const v = parseInt(hex.slice(offset, offset + 2), 16) / 255
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
  }
  const la = lum(a)
  const lb = lum(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
