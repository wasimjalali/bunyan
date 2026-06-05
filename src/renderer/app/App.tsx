import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { startPersistence } from '../state/persistence'
import { listPanes } from '@shared/pane-tree'
import { Rail } from '../rail/Rail'
import { SessionView } from '../terminal/SessionView'
import { BunyanMark } from './BunyanMark'
import { useResolvedTheme } from '../theme/useTheme'

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
  const setSplitRatio = useStore((s) => s.setSplitRatio)
  const openProject = useStore((s) => s.openProject)
  const updateSettings = useStore((s) => s.updateSettings)

  const [railWidth, setRailWidth] = useState(RAIL_DEFAULT)
  const settings = workspace.settings
  const theme = useResolvedTheme(settings.theme)

  useEffect(() => {
    void hydrate()
    const stop = startPersistence()
    return stop
  }, [hydrate])

  useMainEvents()
  useGlobalKeys()

  // Tell the main process which session is active so it can clear needs-input on
  // focus and decide when to notify.
  useEffect(() => {
    window.bunyan.app.setActiveSession(workspace.activeSessionId)
  }, [workspace.activeSessionId])

  const activeSession = workspace.sessions.find((s) => s.id === workspace.activeSessionId) ?? null
  const activeProject = activeSession
    ? (workspace.projects.find((p) => p.id === activeSession.projectId) ?? null)
    : null

  return (
    <div className="flex h-full flex-col bg-canvas text-ink">
      <TitleBar
        breadcrumb={
          activeProject && activeSession ? `${activeProject.name} / ${activeSession.title}` : null
        }
        themeMode={theme.mode}
        onToggleTheme={() => updateSettings({ theme: theme.mode === 'dark' ? 'light' : 'dark' })}
      />
      <div className="flex min-h-0 flex-1">
        <main className="relative min-h-0 min-w-0 flex-1">
          {/*
            Every session stays mounted so background sessions keep receiving
            output (the whole point of running several Claudes at once). Only the
            active one is visible; the rest are kept laid-out-but-hidden so their
            terminals retain size and scrollback.
          */}
          {hydrated &&
            workspace.sessions.map((session) => {
              const isActive = session.id === workspace.activeSessionId
              const project = workspace.projects.find((p) => p.id === session.projectId)
              return (
                <div
                  key={session.id}
                  className={['absolute inset-0', isActive ? '' : 'invisible'].join(' ')}
                  aria-hidden={!isActive}
                >
                  <SessionView
                    session={session}
                    projectName={project?.name ?? ''}
                    focusedPaneId={isActive ? focusedPaneId : null}
                    restoreNotes={restoreNotes}
                    theme={theme.xterm}
                    fontFamily={settings.fontFamily}
                    fontSize={settings.fontSize}
                    cursorStyle={settings.cursorStyle}
                    onFocusPane={focusPane}
                    onSetRatio={setSplitRatio}
                  />
                </div>
              )
            })}
          {hydrated && !activeSession && (
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

/** Subscribes to main-process streams: session status updates and focus requests. */
function useMainEvents(): void {
  const applyStatus = useStore((s) => s.applyStatus)
  const focusSession = useStore((s) => s.focusSession)

  useEffect(() => {
    const offStatus = window.bunyan.session.onStatus((e) => applyStatus(e.sessionId, e.status))
    const offFocus = window.bunyan.app.onFocusRequest((e) => focusSession(e.sessionId))
    return () => {
      offStatus()
      offFocus()
    }
  }, [applyStatus, focusSession])
}

/** Phase 3 keybindings: split and close panes. The full keymap arrives in phase 5. */
function useGlobalKeys(): void {
  const splitActivePane = useStore((s) => s.splitActivePane)
  const closePane = useStore((s) => s.closePane)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.metaKey) return
      const key = e.key.toLowerCase()
      if (key === 'd') {
        e.preventDefault()
        splitActivePane(e.shiftKey ? 'col' : 'row')
      } else if (key === 'w') {
        e.preventDefault()
        const { workspace, focusedPaneId } = useStore.getState()
        const session = workspace.sessions.find((s) => s.id === workspace.activeSessionId)
        if (!session || !focusedPaneId) return
        const lastPane = listPanes(session.layout).length <= 1
        if (lastPane && !window.confirm(`Close the "${session.title}" session?`)) return
        closePane(focusedPaneId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [splitActivePane, closePane])
}

function TitleBar({
  breadcrumb,
  themeMode,
  onToggleTheme,
}: {
  breadcrumb: string | null
  themeMode: 'dark' | 'light'
  onToggleTheme: () => void
}): React.JSX.Element {
  return (
    <header className="drag-region flex h-9 shrink-0 items-center border-b border-line pl-20 pr-3">
      <div className="flex items-center gap-2">
        <BunyanMark size={16} />
        <span className="font-[family-name:var(--font-wordmark)] text-sm font-semibold">Bunyan</span>
      </div>
      {breadcrumb && (
        <>
          <span className="mx-2 text-ink-dim">·</span>
          <span className="font-[family-name:var(--font-wordmark)] truncate text-sm text-ink-dim">
            {breadcrumb}
          </span>
        </>
      )}
      <button
        onClick={onToggleTheme}
        title={themeMode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        className="no-drag ml-auto flex h-6 w-6 items-center justify-center rounded text-ink-dim hover:bg-surface hover:text-ink"
      >
        {themeMode === 'dark' ? '☀' : '☾'}
      </button>
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
      <p className="font-[family-name:var(--font-wordmark)] text-lg text-ink">
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
