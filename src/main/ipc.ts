import { ipcMain, shell, type BrowserWindow, type WebContents } from 'electron'
import os from 'node:os'
import { IPC } from '@shared/ipc'
import type { SessionDataEvent, SessionExitEvent, SessionStatusEvent } from '@shared/ipc'
import type { SessionStatus, Workspace } from '@shared/types'
import type { PtyManager } from './pty/PtyManager'
import type { WorkspaceStore } from './store/WorkspaceStore'
import type { SessionMonitor } from './monitor/SessionMonitor'
import { isDirectory, openProjectDialog, readGitBranch, resolveProjectPath } from './project'
import {
  validateCreate,
  validateWrite,
  validateResize,
  validateKill,
  validateAck,
  validateGitBranch,
  validateNotifyPrefs,
  validateOpenInEditor,
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
    // A saved session can outlive its working directory (moved or deleted repo).
    // Fail loud rather than silently dropping the user into their home folder;
    // the renderer renders this rejection as red error text in the pane.
    if (req.cwd !== '' && !isDirectory(req.cwd)) {
      throw new Error('Working directory no longer exists')
    }
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

  // Flow-control ack: the renderer reports how much output it has drained so the
  // PTY can resume after a backpressure pause. One-way, high frequency.
  ipcMain.on(IPC.sessionAck, (_e, raw) => {
    const req = tryValidate(() => validateAck(raw))
    if (req) pty.ack(req.paneId, req.chars)
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

  ipcMain.handle(IPC.appOpenInEditor, (_e, raw) => {
    // Expand a leading "~" to the home dir BEFORE validating, so the validator
    // can insist on an absolute path (the renderer can't reach os.homedir()).
    const expanded = expandHome(raw)
    const req = guard(() => validateOpenInEditor(expanded))
    // vscode/cursor/zed/windsurf all answer the same "{scheme}://file{path}"
    // URI, with ":line[:col]" appended when we have a position. encodeURI keeps
    // spaces and unicode from breaking the URI but passes "#" and "?" through,
    // which would truncate the path into a fragment or query; encode them too.
    const encodedPath = encodeURI(req.path).replace(/#/g, '%23').replace(/\?/g, '%3F')
    let uri = `${req.editor}://file${encodedPath}`
    if (req.line !== undefined) {
      uri += `:${req.line}`
      if (req.col !== undefined) uri += `:${req.col}`
    }
    void shell.openExternal(uri)
  })
}

// Replace a leading "~" in the request's path with the user's home directory,
// returning a shallow copy. Non-objects and non-string paths pass through for
// the validator to reject.
function expandHome(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw
  const o = raw as Record<string, unknown>
  const path = o.path
  if (typeof path !== 'string') return raw
  if (path === '~') return { ...o, path: os.homedir() }
  if (path.startsWith('~/')) return { ...o, path: os.homedir() + path.slice(1) }
  return raw
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
