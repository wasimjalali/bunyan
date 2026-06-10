import { useEffect, useRef, useState } from 'react'
import type { Workspace } from '@shared/types'
import { useStore } from '../state/store'
import { startPersistence } from '../state/persistence'
import { listPanes } from '@shared/pane-tree'
import {
  activeOrFirstProjectId,
  orderProjectsByActivity,
  sessionByIndexIn,
  sessionByOffsetIn,
} from '@shared/workspace'
import { Rail } from '../rail/Rail'
import { SessionView } from '../terminal/SessionView'
import { CommandPalette } from '../palette/CommandPalette'
import { SettingsPanel } from '../settings/SettingsPanel'
import { SearchBar } from '../search/SearchBar'
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

  const railVisible = useStore((s) => s.ui.railVisible)
  const broadcastSessionIds = useStore((s) => s.ui.broadcastSessionIds)
  const stopBroadcast = useStore((s) => s.stopBroadcast)
  const [railWidth, setRailWidth] = useState(RAIL_DEFAULT)
  const settings = workspace.settings
  const theme = useResolvedTheme(settings.theme)

  useEffect(() => {
    void hydrate()
    const stop = startPersistence()
    return stop
  }, [hydrate])

  useMainEvents()
  useKeymap()
  useFileDropGuard()

  // Tell the main process which session is active so it can clear needs-input on
  // focus and decide when to notify.
  useEffect(() => {
    window.bunyan.app.setActiveSession(workspace.activeSessionId)
  }, [workspace.activeSessionId])

  // Keep the main process in step with notification and bell preferences.
  useEffect(() => {
    window.bunyan.app.setNotifyPrefs({
      notifications: settings.notifications,
      bell: settings.bell,
      silenceAlertSeconds: settings.silenceAlertSeconds,
    })
  }, [settings.notifications, settings.bell, settings.silenceAlertSeconds])

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
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {broadcastSessionIds && (
            <BroadcastBanner count={broadcastSessionIds.length} onStop={stopBroadcast} />
          )}
          <div className="relative min-h-0 min-w-0 flex-1">
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
                      shell={settings.defaultShell}
                      focusedPaneId={isActive ? focusedPaneId : null}
                      restoreNotes={restoreNotes}
                      theme={theme.xterm}
                      fontFamily={settings.fontFamily}
                      fontSize={settings.fontSize}
                      cursorStyle={settings.cursorStyle}
                      optionAsMeta={settings.optionAsMeta}
                      broadcasting={broadcastSessionIds?.includes(session.id) ?? false}
                      onFocusPane={focusPane}
                      onSetRatio={(path, ratio) => setSplitRatio(session.id, path, ratio)}
                    />
                  </div>
                )
              })}
            {hydrated && !activeSession && (
              <EmptyState
                hasProjects={workspace.projects.length > 0}
                onOpenProject={() => void openProject()}
                themeMode={theme.mode}
              />
            )}
            <SearchBar />
          </div>
        </main>

        {railVisible && (
          <>
            <RailDivider width={railWidth} onResize={setRailWidth} />
            <div style={{ width: railWidth }} className="shrink-0">
              <Rail />
            </div>
          </>
        )}
      </div>

      <CommandPalette />
      <SettingsPanel />
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
    // Mark a session unread when a background pane produces output. The handler
    // reads live state via getState (no React deps, so it never re-subscribes
    // per chunk); sessionForPty is an O(1) cached lookup, and the markUnread
    // guard keeps store writes to one per output burst.
    const offData = window.bunyan.session.onData((e) => {
      const s = useStore.getState()
      const ws = s.workspace
      const sessionId = sessionForPty(ws, e.paneId)
      if (!sessionId || sessionId === ws.activeSessionId) return
      if (!s.unread[sessionId]) s.markUnread(sessionId)
    })
    return () => {
      offStatus()
      offFocus()
      offData()
    }
  }, [applyStatus, focusSession])
}

/**
 * Find which session owns a pane's ptyId, or null. This runs on every PTY data
 * chunk (thousands per second under a flood), so the ptyId -> sessionId map is
 * cached against the sessions array reference and rebuilt only when the
 * workspace actually changes (zustand replaces the array immutably).
 */
let ptyMapSource: Workspace['sessions'] | null = null
let ptyMap = new Map<string, string>()
function sessionForPty(ws: Workspace, ptyId: string): string | null {
  if (ws.sessions !== ptyMapSource) {
    ptyMap = new Map()
    for (const session of ws.sessions) {
      for (const pane of listPanes(session.layout)) ptyMap.set(pane.ptyId, session.id)
    }
    ptyMapSource = ws.sessions
  }
  return ptyMap.get(ptyId) ?? null
}

/**
 * A file dropped outside an explicit drop target (rail, terminal pane) would
 * make Electron navigate the window to that file's URL, replacing the app.
 * Cancel the default for file drags everywhere; real drop targets have
 * already handled theirs by the time the event bubbles up here.
 */
function useFileDropGuard(): void {
  useEffect(() => {
    const cancelFileDrag = (e: DragEvent): void => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
    }
    window.addEventListener('dragover', cancelFileDrag)
    window.addEventListener('drop', cancelFileDrag)
    return () => {
      window.removeEventListener('dragover', cancelFileDrag)
      window.removeEventListener('drop', cancelFileDrag)
    }
  }, [])
}

/** The full keyboard map (spec 10.6). Reads live state via getState to stay current. */
function useKeymap(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.metaKey) return
      const s = useStore.getState()
      const ws = s.workspace
      const key = e.key.toLowerCase()

      // While typing in the palette, a rename field or settings inputs, let the
      // input keep the keystroke. Cmd-K is the one exception: the palette must
      // toggle closed from inside its own input.
      if (key !== 'k' && isEditableTarget(e.target)) return

      // Session navigation must follow what the eye sees: the rail's displayed
      // order, which auto-sort reshuffles when the setting is on.
      const displayed = ws.settings.autoSortProjects ? orderProjectsByActivity(ws) : ws.projects

      // Digits 1..9 jump to a session by rail order.
      if (/^[1-9]$/.test(key)) {
        const id = sessionByIndexIn(displayed, Number(key))
        if (id) {
          e.preventDefault()
          s.focusSession(id)
        }
        return
      }

      switch (key) {
        case 'k':
          e.preventDefault()
          s.setPalette(!s.ui.paletteOpen)
          break
        case 't': {
          e.preventDefault()
          const project = activeOrFirstProjectId(ws)
          if (project) s.newSession(project, e.shiftKey ? 'shell' : 'claude')
          break
        }
        case 'd':
          e.preventDefault()
          s.splitActivePane(e.shiftKey ? 'col' : 'row')
          break
        case 'w': {
          e.preventDefault()
          const session = ws.sessions.find((x) => x.id === ws.activeSessionId)
          if (!session || !s.focusedPaneId) break
          const lastPane = listPanes(session.layout).length <= 1
          if (lastPane && !window.confirm(`Close the "${session.title}" session?`)) break
          s.closePane(s.focusedPaneId)
          break
        }
        case 'f':
          e.preventDefault()
          s.setSearch(true)
          break
        case 'b':
          e.preventDefault()
          // Shift-B toggles broadcast; plain B toggles the rail.
          if (e.shiftKey) {
            if (s.ui.broadcastSessionIds) s.stopBroadcast()
            else s.startBroadcast()
          } else {
            s.toggleRail()
          }
          break
        case 'o':
          e.preventDefault()
          void s.openProject()
          break
        case ',':
          e.preventDefault()
          s.setSettingsOpen(!s.ui.settingsOpen)
          break
        case ']':
          e.preventDefault()
          s.focusSession(sessionByOffsetIn(ws, displayed, 1) ?? ws.activeSessionId)
          break
        case '[':
          e.preventDefault()
          s.focusSession(sessionByOffsetIn(ws, displayed, -1) ?? ws.activeSessionId)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/**
 * True for real text-entry targets (input, textarea, contenteditable). xterm's
 * hidden helper textarea is NOT counted: Cmd shortcuts must keep working while a
 * terminal is focused, since that textarea always holds focus inside a pane.
 */
function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.classList.contains('xterm-helper-textarea')) return false
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    el.isContentEditable
  )
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
    <header className="title-hairline drag-region flex h-9 shrink-0 items-center border-b border-line pl-20 pr-3">
      <div className="flex items-center gap-2">
        <BunyanMark size={16} theme={themeMode} />
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

function BroadcastBanner({
  count,
  onStop,
}: {
  count: number
  onStop: () => void
}): React.JSX.Element {
  return (
    <div className="flex h-7 shrink-0 items-center gap-2 border-b border-gold/30 bg-gold/15 px-3 text-xs text-gold">
      <span className="font-medium">Broadcasting to {count} sessions</span>
      <button
        onClick={onStop}
        className="ml-auto rounded px-2 py-0.5 text-gold hover:bg-gold/20"
      >
        Stop
      </button>
    </div>
  )
}

function EmptyState({
  hasProjects,
  onOpenProject,
  themeMode,
}: {
  hasProjects: boolean
  onOpenProject: () => void
  themeMode: 'dark' | 'light'
}): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
      <BunyanMark size={72} theme={themeMode} />
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
  const clamp = (n: number): number => Math.min(RAIL_MAX, Math.max(RAIL_MIN, n))

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (!dragging.current) return
      onResize(clamp(window.innerWidth - e.clientX))
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
      // If we unmount mid-drag, don't leave the resize cursor stuck.
      document.body.style.cursor = ''
    }
  }, [onResize])

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Rail width"
      aria-valuemin={RAIL_MIN}
      aria-valuemax={RAIL_MAX}
      aria-valuenow={width}
      tabIndex={0}
      onMouseDown={() => {
        dragging.current = true
        document.body.style.cursor = 'col-resize'
      }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 24 : 8
        // Arrow keys widen/narrow the rail (the rail sits on the right, so
        // ArrowLeft widens it).
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          onResize(clamp(width + step))
        } else if (e.key === 'ArrowRight') {
          e.preventDefault()
          onResize(clamp(width - step))
        }
      }}
      title={`Rail width ${width}px`}
      className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-gold/30"
    />
  )
}
