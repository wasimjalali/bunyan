import { useEffect, useRef } from 'react'

interface PasteGuardProps {
  text: string
  onPaste: () => void
  onCancel: () => void
}

const PREVIEW_LINES = 6
const MAX_LINE = 120

/**
 * A confirm dialog shown before a risky multiline paste into a terminal whose
 * shell has no bracketed paste, where each newline runs immediately. Modeled on
 * the command palette overlay (z-50, same backdrop). Enter pastes, Escape
 * cancels; the Paste button takes focus on open.
 */
export function PasteGuard({ text, onPaste, onCancel }: PasteGuardProps): React.JSX.Element {
  const pasteRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    pasteRef.current?.focus()
  }, [])

  const lines = text.split('\n')
  const lineCount = lines.length
  const shown = lines.slice(0, PREVIEW_LINES).map((l) => (l.length > MAX_LINE ? l.slice(0, MAX_LINE) + '…' : l))
  const moreLines = lineCount - PREVIEW_LINES

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      // Keep the Escape from also reaching global listeners (the settings
      // panel closes on any window-level Escape).
      e.stopPropagation()
      onCancel()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onPaste()
    }
  }

  return (
    <div
      className="overlay-backdrop fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[14vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
      onKeyDown={onKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Confirm paste"
    >
      <div className="overlay-panel w-[520px] max-w-[90vw] overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
        <div className="border-b border-line px-4 py-3 text-sm font-medium text-ink">
          Paste {lineCount} lines into this terminal?
        </div>
        <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-all bg-canvas px-4 py-3 font-mono text-xs text-ink-dim">
          {shown.join('\n')}
          {moreLines > 0 && `\n…and ${moreLines} more lines`}
        </pre>
        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button
            onClick={onCancel}
            className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-dim hover:bg-line/60 hover:text-ink"
          >
            Cancel
          </button>
          <button
            ref={pasteRef}
            onClick={onPaste}
            className="rounded-md bg-gold px-3 py-1.5 text-sm font-medium text-deep-navy hover:bg-gold-deep"
          >
            Paste
          </button>
        </div>
      </div>
    </div>
  )
}
