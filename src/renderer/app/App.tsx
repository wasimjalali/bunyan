import { useMemo } from 'react'
import { TerminalPane } from '../terminal/TerminalPane'
import { xtermDark } from '../theme/xterm-theme'
import { DEFAULT_SETTINGS } from '@shared/types'
import { makeId } from '@shared/id'

// Phase 1 shell: a single live terminal proving the Electron + xterm + node-pty
// boundary works end to end. The rail, projects and persistence arrive in phase 2.
export function App(): React.JSX.Element {
  const ids = useMemo(() => ({ sessionId: makeId('ses'), paneId: makeId('pane') }), [])

  return (
    <div className="flex h-full flex-col bg-deep-navy text-cream-surface">
      <header className="drag-region flex h-9 shrink-0 items-center justify-center border-b border-navy-line">
        <span className="font-[family-name:var(--font-wordmark)] text-sm font-semibold tracking-wide">
          Bunyan
        </span>
      </header>
      <main className="min-h-0 flex-1">
        <TerminalPane
          paneId={ids.paneId}
          sessionId={ids.sessionId}
          kind="shell"
          cwd=""
          theme={xtermDark}
          fontFamily={DEFAULT_SETTINGS.fontFamily}
          fontSize={DEFAULT_SETTINGS.fontSize}
          cursorStyle={DEFAULT_SETTINGS.cursorStyle}
          focused
          onFocus={() => {}}
        />
      </main>
    </div>
  )
}
