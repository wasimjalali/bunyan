import type { ITheme } from '@xterm/xterm'

// Brand-tuned ANSI tables. Green, red, magenta and cyan are functional terminal
// channels (programs drive them), not brand colours. See spec section 5.

export const xtermDark: ITheme = {
  background: '#0C1929',
  foreground: '#CDD9E8',
  cursor: '#D4A853',
  cursorAccent: '#0C1929',
  // A solid navy selection with a forced bright foreground: selected text stays
  // readable when you drag to copy, instead of dark glyphs washing out under a
  // translucent highlight. Inactive (unfocused) selection is a dimmer navy.
  selectionBackground: '#34557D',
  selectionForeground: '#FEFDFB',
  selectionInactiveBackground: '#2A3F5E',
  black: '#1B2A41',
  red: '#ED6A5E',
  green: '#79B488',
  yellow: '#D4A853',
  blue: '#6E8AAE',
  magenta: '#B58AC2',
  cyan: '#6FB6C9',
  white: '#CDD9E8',
  // The dim/gray slot, used by Claude Code and other tools for secondary text
  // and prompt framing. Lifted from #3A4F6E (~1.9:1, invisible on the dark bg)
  // to ~5:1 so those questions and hints stay legible.
  brightBlack: '#7A8AA6',
  brightRed: '#F2897E',
  brightGreen: '#95C8A2',
  brightYellow: '#E0C687',
  brightBlue: '#93AECB',
  brightMagenta: '#C9A6D4',
  brightCyan: '#92CEDD',
  brightWhite: '#FEFDFB',
}

// Same hues, darkened for contrast on cream (spec section 5, light table).
export const xtermLight: ITheme = {
  background: '#FAF7F2',
  foreground: '#2D3748',
  cursor: '#C4932E',
  cursorAccent: '#FAF7F2',
  // Forced dark foreground so selected text stays readable under the gold
  // highlight (slightly stronger than before for a clearer selection).
  selectionBackground: 'rgba(196,147,46,0.30)',
  selectionForeground: '#1B2A41',
  black: '#2D3748',
  red: '#C0392B',
  green: '#3E7A4F',
  yellow: '#B07F1E',
  blue: '#3F699F',
  magenta: '#8A5B9A',
  cyan: '#2F7E91',
  white: '#5A6B82',
  brightBlack: '#6E8AAE',
  brightRed: '#D45648',
  brightGreen: '#4E8F60',
  brightYellow: '#C4932E',
  brightBlue: '#3A5E8F',
  brightMagenta: '#9D6CAE',
  brightCyan: '#3990A5',
  brightWhite: '#1B2A41',
}
