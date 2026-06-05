import { create } from 'zustand'
import type { PaneNode, SessionKind, Settings, SplitDir, Workspace } from '@shared/types'
import type { OpenedProject } from '@shared/ipc'
import { makeId } from '@shared/id'
import {
  listPanes,
  newPane,
  splitPane,
  closePane as closePaneInTree,
  setRatio as setRatioInTree,
  nextFocusAfterClose,
} from '@shared/pane-tree'
import {
  createDefaultWorkspace,
  createProject,
  createSession,
  nextProjectColor,
  nextSessionTitle,
  addProject,
  addSession,
  removeSession,
  removeProject,
  renameProject,
  setProjectColor,
  setProjectBranch,
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
  /** Transient UI flags (not persisted). */
  ui: {
    paletteOpen: boolean
    settingsOpen: boolean
    searchOpen: boolean
    railVisible: boolean
  }

  hydrate(): Promise<void>
  openProject(): Promise<void>
  addProjectFromPath(path: string): Promise<void>
  newSession(projectId: string, kind: SessionKind): void
  closeSession(sessionId: string): void
  closeProject(projectId: string): void
  rename(projectId: string, name: string): void
  recolor(projectId: string, color: string): void
  collapse(projectId: string): void
  reorderProject(projectId: string, toIndex: number): void
  reorderSession(projectId: string, sessionId: string, toIndex: number): void
  focusSession(sessionId: string | null): void
  focusPane(paneId: string): void
  splitActivePane(dir: SplitDir): void
  closePane(paneId: string): void
  setSplitRatio(anchorPaneId: string, ratio: number): void
  applyStatus(sessionId: string, status: Workspace['sessions'][number]['status']): void
  updateSettings(patch: Partial<Settings>): void
  setPalette(open: boolean): void
  setSettingsOpen(open: boolean): void
  setSearch(open: boolean): void
  toggleRail(): void
}

function firstPaneId(ws: Workspace, sessionId: string | null): string | null {
  if (!sessionId) return null
  const session = ws.sessions.find((s) => s.id === sessionId)
  if (!session) return null
  return listPanes(session.layout)[0]?.id ?? null
}

const DIM = '\x1b[2m'
const RESET = '\x1b[0m'

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
  ui: { paletteOpen: false, settingsOpen: false, searchOpen: false, railVisible: true },

  async hydrate() {
    const loaded = await window.bunyan.store.load()
    const workspace = loaded ?? createDefaultWorkspace()
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

  async openProject() {
    const opened = await window.bunyan.project.openDialog()
    if (opened) await addOpenedProject(get, set, opened)
  },

  async addProjectFromPath(path) {
    const opened = await window.bunyan.project.fromPath(path)
    if (opened) await addOpenedProject(get, set, opened)
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
        void window.bunyan.session.kill({ paneId: pane.ptyId })
      }
    }
    const workspace = removeSession(ws, sessionId)
    set({ workspace, focusedPaneId: firstPaneId(workspace, workspace.activeSessionId) })
  },

  closeProject(projectId) {
    const ws = get().workspace
    for (const session of ws.sessions.filter((s) => s.projectId === projectId)) {
      for (const pane of paneList(session.layout)) {
        void window.bunyan.session.kill({ paneId: pane.ptyId })
      }
    }
    const workspace = removeProject(ws, projectId)
    set({ workspace, focusedPaneId: firstPaneId(workspace, workspace.activeSessionId) })
  },

  rename(projectId, name) {
    set((s) => ({ workspace: renameProject(s.workspace, projectId, name) }))
  },

  recolor(projectId, color) {
    set((s) => ({ workspace: setProjectColor(s.workspace, projectId, color) }))
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
    }))
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
    if (pane) void window.bunyan.session.kill({ paneId: pane.ptyId })
    const layout = closePaneInTree(session.layout, paneId)
    if (layout === null) {
      // Last pane closed: the session goes with it.
      const next = removeSession(workspace, session.id)
      set({ workspace: next, focusedPaneId: firstPaneId(next, next.activeSessionId) })
      return
    }
    set({
      workspace: setSessionLayout(workspace, session.id, layout),
      focusedPaneId: nextFocusAfterClose(session.layout, paneId),
    })
  },

  setSplitRatio(anchorPaneId, ratio) {
    const { workspace } = get()
    const session = workspace.sessions.find((s) => s.id === workspace.activeSessionId)
    if (!session) return
    const layout = setRatioInTree(session.layout, anchorPaneId, ratio)
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
}))

function paneList(node: PaneNode) {
  return listPanes(node)
}

// Shared by openProject (dialog) and addProjectFromPath (drop): add the project,
// then read its git branch once. Ignores folders that are already open.
async function addOpenedProject(
  get: () => BunyanState,
  set: (partial: (s: BunyanState) => Partial<BunyanState>) => void,
  opened: OpenedProject,
): Promise<void> {
  const ws = get().workspace
  if (ws.projects.some((p) => p.path === opened.path)) return
  const project = createProject(
    opened.path,
    opened.name,
    nextProjectColor(ws.projects.map((p) => p.color)),
  )
  set((s) => ({ workspace: addProject(s.workspace, project) }))
  const branch = await window.bunyan.project.gitBranch({ path: opened.path })
  if (branch) {
    set((s) => ({ workspace: setProjectBranch(s.workspace, project.id, branch.branch) }))
  }
}
