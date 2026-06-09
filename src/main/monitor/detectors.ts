// Pure detectors over PTY output. No timers, no state beyond a rolling tail.
// These are the heuristic layer; they are isolated and fixture-tested so they
// can be tuned without touching the state machine (spec 9.3).

import type { OscNotification } from './types'

export const BELL = '\x07'

// Matches CSI / OSC / other escape sequences so prompt detection sees plain text.
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g

export function stripAnsi(input: string): string {
  return input.replace(ANSI, '')
}

/** Keep the last `max` chars of (tail + chunk) for prompt-tail inspection. */
export function updateTail(tail: string, chunk: string, max = 512): string {
  const combined = tail + chunk
  return combined.length > max ? combined.slice(combined.length - max) : combined
}

/**
 * Does the (already accumulated) tail look like a shell waiting at a prompt?
 * After stripping ANSI and trailing whitespace, the last glyph is a common
 * prompt terminator. Deliberately conservative: a false negative just delays
 * the drop to idle; a false positive would wrongly mark a busy shell idle.
 */
export function isPromptLike(tail: string): boolean {
  const text = stripAnsi(tail).replace(/[ \t\r\n]+$/, '')
  if (text.length === 0) return false
  return /[$%#>❯➜][)\]]?$/.test(text)
}

// OSC title: ESC ] 0;<title> BEL  or  ESC ] 2;<title> ST.
// eslint-disable-next-line no-control-regex
const OSC_TITLE = /\x1b\]([02]);([^\x07\x1b]*)(?:\x07|\x1b\\)/
export function parseTitle(chunk: string): string | null {
  const m = OSC_TITLE.exec(chunk)
  return m ? (m[2] ?? null) : null
}

// Agent / shell self-authored notifications:
//   OSC 9:   ESC ] 9 ; <body> (BEL | ST)
//   OSC 777: ESC ] 777 ; notify ; <title> ; <body> (BEL | ST)
// Bodies are matched without a length cap so over-long ones still match (we
// truncate after), but capped to keep a single notification reasonable.
// eslint-disable-next-line no-control-regex
const OSC_9 = /\x1b\]9;([^\x07\x1b]*)(?:\x07|\x1b\\)/
// eslint-disable-next-line no-control-regex
const OSC_777_NOTIFY = /\x1b\]777;notify;([^;\x07\x1b]{0,100});([^\x07\x1b]*)(?:\x07|\x1b\\)/
const OSC_MSG_MAX = 200

function parseOscNotification(chunk: string): OscNotification | undefined {
  // OSC 777 first: it is the richer form (title + body).
  const m777 = OSC_777_NOTIFY.exec(chunk)
  if (m777) return { title: m777[1] || null, body: m777[2]!.slice(0, OSC_MSG_MAX) }
  const m9 = OSC_9.exec(chunk)
  if (m9) return { title: null, body: m9[1]!.slice(0, OSC_MSG_MAX) }
  return undefined
}

export interface ChunkSignals {
  bell: boolean
  claudeWorking: boolean
  claudeConfirm: boolean
  hasOutput: boolean
  title: string | null
  /** An agent- or shell-authored OSC 9/777 notification, if the chunk had one. */
  oscNotification?: OscNotification
}

// Claude Code prints a working line with "esc to interrupt"; confirmation
// prompts ask to proceed with numbered choices. Both patterns are best-effort.
const CLAUDE_WORKING = /esc to interrupt/i
const CLAUDE_CONFIRM = /(do you want to proceed|would you like to proceed|❯\s*1\.\s|^\s*1\.\s+yes)/im

// eslint-disable-next-line no-control-regex
const CONTROL = /[\x00-\x1f\x7f]/g

export function analyzeChunk(chunk: string): ChunkSignals {
  const plain = stripAnsi(chunk)
  // Visible content only: drop control bytes (bell, CR/LF, etc.) so a lone bell
  // or a bare newline doesn't register as program output.
  const visible = plain.replace(CONTROL, '').trim()
  const oscNotification = parseOscNotification(chunk)
  return {
    bell: chunk.includes(BELL),
    claudeWorking: CLAUDE_WORKING.test(plain),
    claudeConfirm: CLAUDE_CONFIRM.test(plain),
    hasOutput: visible.length > 0,
    title: parseTitle(chunk),
    ...(oscNotification ? { oscNotification } : {}),
  }
}

// A title hinting the tool is waiting (some CLIs set this). Conservative.
const TITLE_WAITING = /(waiting|input needed|needs input|action required)/i
export function titleSuggestsWaiting(title: string): boolean {
  return TITLE_WAITING.test(title)
}
