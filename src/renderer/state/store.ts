import { create } from 'zustand'
import { DEFAULT_SETTINGS } from '@shared/types'
import type {
  PaneNode,
  ProjectSection,
  SessionKind,
  Settings,
  SplitDir,
  Workspace,
} from '@shared/types'
import type { OpenedProject } from '@shared/ipc'
import { makeId } from '@shared/id'
import { markPtyClosed } from '../terminal/lifecycle'
import {
  listPanes,
  newPane,
  splitPane,
  closePane as closePaneInTree,
  setRatioAtPath,
  nextFocusAfterClose,
} from '@shared/pane-tree'
import {
  createDefaultWorkspace,
  createProject,
  createSession,
  nextProjectColor,
  nextSessionTitle,
  normalizeProjects,
  addProject,
  addSession,
  removeSession,
  removeProject,
  renameProject,
  setProjectColor,
  setProjectBranch,
  setProjectSection,
  moveProjectToSection,
  toggleCollapse,
  setActiveSession,
  setSessionStatus,
  setSessionLayout,
  reorderProject,
  reorderSession,
} from '@shared/workspace'

interface BunyanState {
  workspace: Workspace
  hydrated: boolean
  /** The focused pane within the active session. Transient (not persisted). */
  focusedPaneId: string | null
  /** Dimmed "previous session" text to write into a restored pane, keyed by ptyId. */
  restoreNotes: Record<string, string>
  /** Sessions with new output since they were last active. Transient, keyed by sessionId. */
  unread: Record<string, true>
  /** Transient UI flags (not persisted). */
  ui: {
    paletteOpen: boolean
    settingsOpen: boolean
    searchOpen: boolean
    railVisible: boolean
    /** Sessions receiving broadcast keystrokes, or null when broadcast is off. */
    broadcastSessionIds: string[] | null
  }

  hydrate(): Promise<void>
  openProject(section?: ProjectSection): Promise<void>
  addProjectFromPath(path: string, section?: ProjectSection): Promise<void>
  newSession(projectId: string, kind: SessionKind): void
  closeSession(sessionId: string): void
  closeProject(projectId: string): void
  rename(projectId: string, name: string): void
  recolor(projectId: string, color: string): void
  setSection(projectId: string, section: ProjectSection): void
  moveProject(projectId: string, section: ProjectSection, toIndex: number): void
  refreshBranch(projectId: string): Promise<void>
  collapse(projectId: string): void
  reorderProject(projectId: string, toIndex: number): void
  reorderSession(projectId: string, sessionId: string, toIndex: number): void
  focusSession(sessionId: string | null): void
  markUnread(sessionId: string): void
  clearUnread(sessionId: string): void
  focusPane(paneId: string): void
  splitActivePane(dir: SplitDir): void
  closePane(paneId: string): void
  setSplitRatio(sessionId: string, path: Array<'a' | 'b'>, ratio: number): void
  applyStatus(sessionId: string, status: Workspace['sessions'][number]['status']): void
  updateSettings(patch: Partial<Settings>): void
  setPalette(open: boolean): void
  setSettingsOpen(open: boolean): void
  setSearch(open: boolean): void
  toggleRail(): void
  startBroadcast(): void
  stopBroadcast(): void
}

function firstPaneId(ws: Workspace, sessionId: string | null): string | null {
  if (!sessionId) return null
  const session = ws.sessions.find((s) => s.id === sessionId)
  if (!session) return null
  return listPanes(session.layout)[0]?.id ?? null
}

const DIM = '\x1b[2m'
const RESET = '\x1b[0m'

// Transient per-project timestamps for the hover-driven branch refresh.
const BRANCH_REFRESH_COOLDOWN_MS = 10_000
const branchRefreshedAt = new Map<string, number>()

// The dimmed block written above the live prompt of a restored pane. Includes
// the captured scrollback when there is some, then an honest separator: the old
// process is gone, a fresh shell follows.
function restoreNote(cwd: string, scrollback?: string): string {
  const body = scrollback ? `${DIM}${scrollback}${RESET}\r\n` : ''
  return (
    body +
    `${DIM}── Previous session restored. A live shell follows; the old process is gone.\r\n` +
    `   ${cwd}${RESET}\r\n\r\n`
  )
}

export const useStore = create<BunyanState>((set, get) => ({
  workspace: createDefaultWorkspace(),
  hydrated: false,
  focusedPaneId: null,
  restoreNotes: {},
  unread: {},
  ui: {
    paletteOpen: false,
    settingsOpen: false,
    searchOpen: false,
    railVisible: true,
    broadcastSessionIds: null,
  },

  async hydrate() {
    const loaded = await window.bunyan.store.load()
    const workspace = loaded ?? createDefaultWorkspace()
    // Backfill any settings keys added since this workspace was last saved, so an
    // older saved file gets defaults for new fields (e.g. silenceAlertSeconds)
    // instead of leaving them undefined.
    if (loaded) {
      workspace.settings = { ...DEFAULT_SETTINGS, ...loaded.settings }
      // claudeConfigDirs is an object; a partial saved value (or none) merges
      // over the defaults so both sections always have a key.
      workspace.settings.claudeConfigDirs = {
        ...DEFAULT_SETTINGS.claudeConfigDirs,
        ...loaded.settings?.claudeConfigDirs,
      }
      // Projects saved before the professional/personal split get a section.
      workspace.projects = normalizeProjects(workspace.projects)
    }
    // The claude-auto-relaunch setting governs restore: when it's off, restored
    // Claude sessions come back as plain shells (no auto `claude`).
    if (loaded && !workspace.settings.claudeAutoRelaunch) {
      workspace.sessions = workspace.sessions.map((s) => ({ ...s, autoRelaunch: false }))
    }
    // Build a dimmed restore note for every restored pane, including its saved
    // scrollback when we have it. Keyed by ptyId (what TerminalPane writes into).
    const restoreNotes: Record<string, string> = {}
    const scrollback = workspace.scrollback ?? {}
    for (const session of workspace.sessions) {
      for (const pane of paneList(session.layout)) {
        restoreNotes[pane.ptyId] = restoreNote(session.cwd, scrollback[pane.id])
      }
    }
    set({
      workspace,
      hydrated: true,
      restoreNotes,
      focusedPaneId: firstPaneId(workspace, workspace.activeSessionId),
    })
  },

  async openProject(section = 'professional') {
    const opened = await window.bunyan.project.openDialog()
    if (opened) await addOpenedProject(get, set, opened, section)
  },

  async addProjectFromPath(path, section = 'professional') {
    const opened = await window.bunyan.project.fromPath(path)
    if (opened) await addOpenedProject(get, set, opened, section)
  },

  newSession(projectId, kind) {
    const ws = get().workspace
    const project = ws.projects.find((p) => p.id === projectId)
    if (!project) return
    const ptyId = makeId('pty')
    const title = nextSessionTitle(ws, projectId, kind)
    const session = createSession(projectId, kind, project.path, title, ptyId)
    const workspace = addSession(ws, session)
    set({ workspace, focusedPaneId: firstPaneId(workspace, session.id) })
  },

  closeSession(sessionId) {
    const ws = get().workspace
    const session = ws.sessions.find((s) => s.id === sessionId)
    if (session) {
      for (const pane of paneList(session.layout)) {
        markPtyClosed(pane.ptyId)
        void window.bunyan.session.kill({ paneId: pane.ptyId })
      }
    }
    const workspace = removeSession(ws, sessionId)
    set((s) => ({
      workspace,
      focusedPaneId: firstPaneId(workspace, workspace.activeSessionId),
      // A broadcast member closing breaks the set; stop rather than silently
      // dropping a target.
      ui: clearBroadcastIfMember(s.ui, sessionId),
    }))
  },

  closeProject(projectId) {
    const ws = get().workspace
    for (const session of ws.sessions.filter((s) => s.projectId === projectId)) {
      for (const pane of paneList(session.layout)) {
        markPtyClosed(pane.ptyId)
        void window.bunyan.session.kill({ paneId: pane.ptyId })
      }
    }
    const closedIds = new Set(ws.sessions.filter((s) => s.projectId === projectId).map((s) => s.id))
    const workspace = removeProject(ws, projectId)
    set((s) => ({
      workspace,
      focusedPaneId: firstPaneId(workspace, workspace.activeSessionId),
      // Closing the project that owns broadcast members ends broadcast.
      ui: clearBroadcastIfAnyMember(s.ui, closedIds),
    }))
  },

  rename(projectId, name) {
    set((s) => ({ workspace: renameProject(s.workspace, projectId, name) }))
  },

  recolor(projectId, color) {
    set((s) => ({ workspace: setProjectColor(s.workspace, projectId, color) }))
  },

  setSection(projectId, section) {
    set((s) => ({ workspace: setProjectSection(s.workspace, projectId, section) }))
  },

  moveProject(projectId, section, toIndex) {
    set((s) => ({ workspace: moveProjectToSection(s.workspace, projectId, section, toIndex) }))
  },

  // Re-read a project's git branch on demand (the hover card opening), so the
  // readout reflects checkouts made since the project was added. Throttled per
  // project: each read forks a git process, and sweeping the pointer down the
  // rail would otherwise fork one per row.
  async refreshBranch(projectId) {
    const last = branchRefreshedAt.get(projectId) ?? 0
    const now = Date.now()
    if (now - last < BRANCH_REFRESH_COOLDOWN_MS) return
    branchRefreshedAt.set(projectId, now)
    const project = get().workspace.projects.find((p) => p.id === projectId)
    if (!project) return
    const branch = await window.bunyan.project.gitBranch({ path: project.path })
    if (branch && branch.branch !== project.branch) {
      set((s) => ({ workspace: setProjectBranch(s.workspace, projectId, branch.branch) }))
    }
  },

  collapse(projectId) {
    set((s) => ({ workspace: toggleCollapse(s.workspace, projectId) }))
  },

  reorderProject(projectId, toIndex) {
    set((s) => ({ workspace: reorderProject(s.workspace, projectId, toIndex) }))
  },

  reorderSession(projectId, sessionId, toIndex) {
    set((s) => ({ workspace: reorderSession(s.workspace, projectId, sessionId, toIndex) }))
  },

  focusSession(sessionId) {
    set((s) => ({
      workspace: setActiveSession(s.workspace, sessionId),
      focusedPaneId: firstPaneId(s.workspace, sessionId),
      // Focusing a session means you've seen its output; drop its unread flag.
      unread: sessionId ? clearUnread(s.unread, sessionId) : s.unread,
      // Leaving the broadcast set ends broadcast: typing into an outside session
      // shouldn't silently fan out to the old group.
      ui: clearBroadcastIfOutside(s.ui, sessionId),
    }))
  },

  markUnread(sessionId) {
    set((s) => ({ unread: { ...s.unread, [sessionId]: true } }))
  },

  clearUnread(sessionId) {
    set((s) => ({ unread: clearUnread(s.unread, sessionId) }))
  },

  focusPane(paneId) {
    set({ focusedPaneId: paneId })
  },

  splitActivePane(dir) {
    const { workspace, focusedPaneId } = get()
    const session = workspace.sessions.find((s) => s.id === workspace.activeSessionId)
    if (!session || !focusedPaneId) return
    const pane = newPane(makeId('pty'))
    const layout = splitPane(session.layout, focusedPaneId, dir, pane)
    set({
      workspace: setSessionLayout(workspace, session.id, layout),
      focusedPaneId: pane.id,
    })
  },

  closePane(paneId) {
    const { workspace } = get()
    const session = workspace.sessions.find((s) => s.id === workspace.activeSessionId)
    if (!session) return
    const pane = listPanes(session.layout).find((p) => p.id === paneId)
    if (pane) {
      markPtyClosed(pane.ptyId)
      void window.bunyan.session.kill({ paneId: pane.ptyId })
    }
    const layout = closePaneInTree(session.layout, paneId)
    if (layout === null) {
      // Last pane closed: the session goes with it.
      const next = removeSession(workspace, session.id)
      set((s) => ({
        workspace: next,
        focusedPaneId: firstPaneId(next, next.activeSessionId),
        // A broadcast member's session closing breaks the set; stop broadcast.
        ui: clearBroadcastIfMember(s.ui, session.id),
      }))
      return
    }
    set({
      workspace: setSessionLayout(workspace, session.id, layout),
      focusedPaneId: nextFocusAfterClose(session.layout, paneId),
    })
  },

  // Keyed by the divider's own session, not the active one: a session switch
  // mid-drag must not write the ratio into whichever session became active.
  setSplitRatio(sessionId, path, ratio) {
    const { workspace } = get()
    const session = workspace.sessions.find((s) => s.id === sessionId)
    if (!session) return
    const layout = setRatioAtPath(session.layout, path, ratio)
    set({ workspace: setSessionLayout(workspace, session.id, layout) })
  },

  applyStatus(sessionId, status) {
    set((s) => ({ workspace: setSessionStatus(s.workspace, sessionId, status) }))
  },

  updateSettings(patch) {
    set((s) => ({ workspace: { ...s.workspace, settings: { ...s.workspace.settings, ...patch } } }))
  },

  setPalette(open) {
    set((s) => ({ ui: { ...s.ui, paletteOpen: open } }))
  },

  setSettingsOpen(open) {
    set((s) => ({ ui: { ...s.ui, settingsOpen: open } }))
  },

  setSearch(open) {
    set((s) => ({ ui: { ...s.ui, searchOpen: open } }))
  },

  toggleRail() {
    set((s) => ({ ui: { ...s.ui, railVisible: !s.ui.railVisible } }))
  },

  // Broadcast keystrokes to every live session of the active project. Fewer than
  // two live members is a no-op: broadcasting to yourself is just noise.
  startBroadcast() {
    const ws = get().workspace
    const active = ws.sessions.find((s) => s.id === ws.activeSessionId)
    if (!active) return
    const ids = ws.sessions
      .filter((s) => s.projectId === active.projectId && s.status !== 'exited')
      .map((s) => s.id)
    if (ids.length < 2) return
    set((s) => ({ ui: { ...s.ui, broadcastSessionIds: ids } }))
  },

  stopBroadcast() {
    set((s) => (s.ui.broadcastSessionIds === null ? {} : { ui: { ...s.ui, broadcastSessionIds: null } }))
  },
}))

function paneList(node: PaneNode) {
  return listPanes(node)
}

// Drop one session's unread flag, returning the same object reference when it
// wasn't set so callers don't trigger a needless re-render.
function clearUnread(unread: Record<string, true>, sessionId: string): Record<string, true> {
  if (!unread[sessionId]) return unread
  const next = { ...unread }
  delete next[sessionId]
  return next
}

type Ui = BunyanState['ui']

// End broadcast when the newly active session is NOT one of its targets.
function clearBroadcastIfOutside(ui: Ui, sessionId: string | null): Ui {
  const ids = ui.broadcastSessionIds
  if (!ids || (sessionId !== null && ids.includes(sessionId))) return ui
  return { ...ui, broadcastSessionIds: null }
}

// End broadcast when a target session is closing.
function clearBroadcastIfMember(ui: Ui, sessionId: string): Ui {
  const ids = ui.broadcastSessionIds
  if (!ids || !ids.includes(sessionId)) return ui
  return { ...ui, broadcastSessionIds: null }
}

// End broadcast when any of `sessionIds` is a target (a whole project closing).
function clearBroadcastIfAnyMember(ui: Ui, sessionIds: Set<string>): Ui {
  const ids = ui.broadcastSessionIds
  if (!ids || !ids.some((id) => sessionIds.has(id))) return ui
  return { ...ui, broadcastSessionIds: null }
}

// Shared by openProject (dialog) and addProjectFromPath (drop): add the project,
// then read its git branch once. Ignores folders that are already open.
async function addOpenedProject(
  get: () => BunyanState,
  set: (partial: (s: BunyanState) => Partial<BunyanState>) => void,
  opened: OpenedProject,
  section: ProjectSection,
): Promise<void> {
  const ws = get().workspace
  if (ws.projects.some((p) => p.path === opened.path)) return
  const project = createProject(
    opened.path,
    opened.name,
    nextProjectColor(ws.projects.map((p) => p.color)),
    section,
  )
  set((s) => ({ workspace: addProject(s.workspace, project) }))
  const branch = await window.bunyan.project.gitBranch({ path: opened.path })
  if (branch) {
    set((s) => ({ workspace: setProjectBranch(s.workspace, project.id, branch.branch) }))
  }
}
