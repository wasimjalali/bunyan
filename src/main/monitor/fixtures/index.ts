// Recorded-style PTY output samples used to tune and test the detectors.
// Control bytes are written explicitly so the corpus is readable and stable.
// Add real captures here as Claude Code's output evolves (spec 9.3, "Tuning").

const ESC = '\x1b'
const BEL = '\x07'

export const fixtures = {
  // A zsh prompt waiting for input.
  shellPrompt: `${ESC}[1m${ESC}[32mwasim@mac${ESC}[0m ${ESC}[34mbunyan${ESC}[0m % `,

  // A shell actively building something (no prompt at the tail).
  shellRunning: `Compiling bunyan v0.1.0\r\n  building renderer 3/10\r\n  building renderer 4/10\r\n`,

  // git-style prompt with a branch arrow.
  starshipPrompt: `${ESC}[32m❯${ESC}[0m `,

  // Bare terminal bell.
  bell: BEL,

  // Claude Code working line with the spinner and the interrupt hint.
  claudeWorking: `${ESC}[2K${ESC}[33m✻${ESC}[0m Crunching the codebase… (esc to interrupt)`,

  // A Claude confirmation prompt with numbered choices.
  claudeConfirm:
    `Do you want to proceed?\r\n` +
    `${ESC}[36m❯ 1. Yes${ESC}[0m\r\n` +
    `  2. Yes, and don't ask again\r\n` +
    `  3. No, tell Claude what to do differently\r\n`,

  // An OSC sequence setting the window title to a waiting state.
  titleWaiting: `${ESC}]0;bunyan — waiting for input${BEL}`,

  // An OSC sequence setting an ordinary title.
  titleNormal: `${ESC}]0;bunyan — zsh${BEL}`,

  // Plain program output, nothing special.
  plainOutput: `Listening on http://localhost:5173\r\n`,
} as const

export type FixtureName = keyof typeof fixtures
