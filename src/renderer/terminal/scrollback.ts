import type { Terminal } from '@xterm/xterm'
import { allPaneHandles } from './registry'

const MAX_LINES = 1000
const MAX_CHARS = 64 * 1024 // hard per-pane cap on serialized size

// Set whenever a pane receives output; lets the periodic flush skip work when
// nothing has changed instead of re-serializing every idle pane on each tick.
let dirty = false

export function markScrollbackDirty(): void {
  dirty = true
}

/** Capture scrollback only if a pane has produced output since the last capture. */
export function captureScrollbackIfDirty(): Record<string, string> | null {
  if (!dirty) return null
  dirty = false
  return captureAllScrollback()
}

/**
 * Serialize the tail of a terminal's buffer to plain text (no escape codes),
 * capped at MAX_LINES and MAX_CHARS on whole-line boundaries. Trailing blank
 * lines are dropped. This becomes the dimmed "previous session" block on
 * restore (spec 9.5).
 */
export function captureScrollback(term: Terminal, maxLines = MAX_LINES): string {
  const buf = term.buffer.active
  const total = buf.length
  const start = Math.max(0, total - maxLines)
  const lines: string[] = []
  for (let i = start; i < total; i++) {
    const line = buf.getLine(i)
    lines.push(line ? line.translateToString(true) : '')
  }
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === '') lines.pop()

  // Cap by whole lines from the tail so the restored block never starts mid-line.
  let chars = 0
  let from = lines.length
  while (from > 0 && chars + lines[from - 1]!.length + 1 <= MAX_CHARS) {
    from -= 1
    chars += lines[from]!.length + 1
  }
  return lines.slice(from).join('\r\n')
}

/** Capture every live pane's scrollback, keyed by pane id. Empty panes are skipped. */
export function captureAllScrollback(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [paneId, handles] of allPaneHandles()) {
    const text = captureScrollback(handles.term)
    if (text !== '') out[paneId] = text
  }
  return out
}
