import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { startPersistence } from '../state/persistence'
import { Rail } from '../rail/Rail'
import { SessionView } from '../terminal/SessionView'
import { BunyanMark } from './BunyanMark'
import { xtermDark } from '../theme/xterm-theme'

const RAIL_MIN = 200
const RAIL_MAX = 360
const RAIL_DEFAULT = 236

export function App(): React.JSX.Element {
  const hydrate = useStore((s) => s.hydrate)
  const hydrated = useStore((s) => s.hydrated)
  const workspace = useStore((s) => s.workspace)
  const focusedPaneId = useStore((s) => s.focusedPaneId)
  const restoreNotes = useStore((s) => s.restoreNotes)
  const focusPane = useStore((s) => s.focusPane)
  const openProject = useStore((s) => s.openProject)

  const [railWidth, setRailWidth] = useState(RAIL_DEFAULT)

  useEffect(() => {
    void hydrate()
    const stop = startPersistence()
    return stop
  }, [hydrate])

  const activeSession = workspace.sessions.find((s) => s.id === workspace.activeSessionId) ?? null
  const activeProject = activeSession
    ? (workspace.projects.find((p) => p.id === activeSession.projectId) ?? null)
    : null
  const settings = workspace.settings

  return (
    <div className="flex h-full flex-col bg-deep-navy text-cream-surface">
      <TitleBar
        breadcrumb={
          activeProject && activeSession ? `${activeProject.name} / ${activeSession.title}` : null
        }
      />
      <div className="flex min-h-0 flex-1">
        <main className="min-h-0 min-w-0 flex-1">
          {!hydrated ? null : activeSession ? (
            <SessionView
              key={activeSession.id}
              session={activeSession}
              focusedPaneId={focusedPaneId}
              restoreNotes={restoreNotes}
              theme={xtermDark}
              fontFamily={settings.fontFamily}
              fontSize={settings.fontSize}
              cursorStyle={settings.cursorStyle}
              onFocusPane={focusPane}
            />
          ) : (
            <EmptyState
              hasProjects={workspace.projects.length > 0}
              onOpenProject={() => void openProject()}
            />
          )}
        </main>

        <RailDivider width={railWidth} onResize={setRailWidth} />
        <div style={{ width: railWidth }} className="shrink-0">
          <Rail />
        </div>
      </div>
    </div>
  )
}

function TitleBar({ breadcrumb }: { breadcrumb: string | null }): React.JSX.Element {
  return (
    <header className="drag-region flex h-9 shrink-0 items-center border-b border-navy-line pl-20 pr-3">
      <div className="flex items-center gap-2">
        <BunyanMark size={16} />
        <span className="font-[family-name:var(--font-wordmark)] text-sm font-semibold">
          Bunyan
        </span>
      </div>
      {breadcrumb && (
        <>
          <span className="mx-2 text-muted">·</span>
          <span className="font-[family-name:var(--font-wordmark)] truncate text-sm text-muted">
            {breadcrumb}
          </span>
        </>
      )}
    </header>
  )
}

function EmptyState({
  hasProjects,
  onOpenProject,
}: {
  hasProjects: boolean
  onOpenProject: () => void
}): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
      <BunyanMark size={72} />
      <p className="font-[family-name:var(--font-wordmark)] text-lg text-cream-surface">
        {hasProjects ? 'Start a session to begin' : 'Open a folder to start'}
      </p>
      {!hasProjects && (
        <button
          onClick={onOpenProject}
          className="rounded-lg bg-gold px-4 py-2 text-sm font-medium text-deep-navy transition-colors hover:bg-gold-deep"
        >
          Open project
        </button>
      )}
    </div>
  )
}

function RailDivider({
  width,
  onResize,
}: {
  width: number
  onResize: (w: number) => void
}): React.JSX.Element {
  const dragging = useRef(false)

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (!dragging.current) return
      const next = window.innerWidth - e.clientX
      onResize(Math.min(RAIL_MAX, Math.max(RAIL_MIN, next)))
    }
    const onUp = (): void => {
      dragging.current = false
      document.body.style.cursor = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [onResize])

  return (
    <div
      onMouseDown={() => {
        dragging.current = true
        document.body.style.cursor = 'col-resize'
      }}
      title={`Rail width ${width}px`}
      className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-gold/30"
    />
  )
}
