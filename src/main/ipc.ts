import { ipcMain, type BrowserWindow, type WebContents } from 'electron'
import { IPC } from '@shared/ipc'
import type { SessionDataEvent, SessionExitEvent, SessionStatusEvent } from '@shared/ipc'
import type { SessionStatus, Workspace } from '@shared/types'
import type { PtyManager } from './pty/PtyManager'
import type { WorkspaceStore } from './store/WorkspaceStore'
import type { SessionMonitor } from './monitor/SessionMonitor'
import { openProjectDialog, readGitBranch, resolveProjectPath } from './project'
import {
  validateCreate,
  validateWrite,
  validateResize,
  validateKill,
  validateGitBranch,
  validateNotifyPrefs,
  ValidationError,
} from './ipc-validate'

/**
 * Wires every renderer -> main session channel to the PtyManager and the
 * SessionMonitor. Validation failures surface as a generic rejected invoke; we
 * never leak internal detail to the renderer.
 */
export function registerSessionIpc(pty: PtyManager, monitor: SessionMonitor): void {
  ipcMain.handle(IPC.sessionCreate, (_e, raw) => {
    const req = guard(() => validateCreate(raw))
    monitor.register(req.paneId, req.sessionId, req.projectName)
    pty.create({
      ptyId: req.paneId,
      cwd: req.cwd,
      shell: req.shell,
      cols: req.cols,
      rows: req.rows,
      runOnStart: req.runOnStart,
    })
    return { paneId: req.paneId }
  })

  // write/resize are one-way (high frequency, no response needed).
  ipcMain.on(IPC.sessionWrite, (_e, raw) => {
    const req = tryValidate(() => validateWrite(raw))
    if (req) pty.write(req.paneId, req.data)
  })

  ipcMain.on(IPC.sessionResize, (_e, raw) => {
    const req = tryValidate(() => validateResize(raw))
    if (req) pty.resize(req.paneId, req.cols, req.rows)
  })

  ipcMain.handle(IPC.sessionKill, (_e, raw) => {
    const req = guard(() => validateKill(raw))
    monitor.remove(req.paneId)
    pty.kill(req.paneId)
  })

  ipcMain.on(IPC.appActiveSession, (_e, raw) => {
    monitor.setActiveSession(typeof raw === 'string' ? raw : null)
  })

  ipcMain.on(IPC.appNotifyPrefs, (_e, raw) => {
    const prefs = tryValidate(() => validateNotifyPrefs(raw))
    if (prefs) monitor.setNotifyPrefs(prefs)
  })
}

/** Folder picker and git-branch readout. */
export function registerProjectIpc(win: BrowserWindow): void {
  ipcMain.handle(IPC.projectOpenDialog, () => openProjectDialog(win))
  ipcMain.handle(IPC.projectFromPath, (_e, raw) => {
    const req = guard(() => validateGitBranch(raw))
    return resolveProjectPath(req.path)
  })
  ipcMain.handle(IPC.projectGitBranch, (_e, raw) => {
    const req = guard(() => validateGitBranch(raw))
    return readGitBranch(req.path)
  })
}

/** Workspace load/save. */
export function registerStoreIpc(store: WorkspaceStore): void {
  ipcMain.handle(IPC.storeLoad, () => store.load())
  ipcMain.handle(IPC.storeSave, (_e, raw) => {
    store.save(raw as Workspace)
  })
}

/**
 * Hooks the PtyManager uses to push data/exit to the renderer AND feed the
 * monitor. PTY output goes to the terminal for display and to the monitor for
 * status detection; the two never block each other.
 */
export function makePtyHooks(sender: WebContents, monitor: SessionMonitor) {
  return {
    onData(ptyId: string, data: string): void {
      monitor.onData(ptyId, data)
      if (sender.isDestroyed()) return
      const event: SessionDataEvent = { paneId: ptyId, data }
      sender.send(IPC.sessionData, event)
    },
    onExit(ptyId: string, code: number): void {
      monitor.onExit(ptyId)
      if (sender.isDestroyed()) return
      const event: SessionExitEvent = { paneId: ptyId, code }
      sender.send(IPC.sessionExit, event)
    },
  }
}

/** The monitor's emit sink: streams session:status to the renderer. */
export function makeMonitorEmit(sender: WebContents) {
  return {
    onStatus(sessionId: string, status: SessionStatus, reason: string): void {
      if (sender.isDestroyed()) return
      const event: SessionStatusEvent = { sessionId, status, reason }
      sender.send(IPC.sessionStatus, event)
    },
  }
}

// Translate a validation failure into a generic invoke rejection.
function guard<T>(fn: () => T): T {
  try {
    return fn()
  } catch (err) {
    if (err instanceof ValidationError) throw new Error('Invalid request')
    throw err
  }
}

// For one-way channels: drop invalid payloads silently (no channel to reject on).
function tryValidate<T>(fn: () => T): T | null {
  try {
    return fn()
  } catch {
    return null
  }
}
