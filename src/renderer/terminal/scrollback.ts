import type { Terminal } from '@xterm/xterm'
import { allPaneHandles } from './registry'

const MAX_LINES = 1000
const MAX_CHARS = 64 * 1024 // hard per-pane cap on serialized size

/**
 * Serialize the tail of a terminal's buffer to plain text (no escape codes),
 * capped at MAX_LINES and MAX_CHARS. Trailing blank lines are dropped. This is
 * what gets shown as the dimmed "previous session" block on restore (spec 9.5).
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
  let text = lines.join('\r\n')
  if (text.length > MAX_CHARS) text = text.slice(text.length - MAX_CHARS)
  return text
}

/** Capture every live pane's scrollback, keyed by pane id. Empty panes are skipped. */
export function captureAllScrollback(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [paneId, handles] of allPaneHandles()) {
    const text = captureScrollback(handles.term)
    if (text.trim() !== '') out[paneId] = text
  }
  return out
}
