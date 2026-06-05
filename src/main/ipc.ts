import { ipcMain, type WebContents } from 'electron'
import { IPC } from '@shared/ipc'
import type { SessionDataEvent, SessionExitEvent } from '@shared/ipc'
import type { PtyManager } from './pty/PtyManager'
import {
  validateCreate,
  validateWrite,
  validateResize,
  validateKill,
  ValidationError,
} from './ipc-validate'

/**
 * Wires every renderer -> main session channel to the PtyManager. Validation
 * failures surface as a generic rejected invoke; we never leak internal detail
 * to the renderer.
 */
export function registerSessionIpc(pty: PtyManager): void {
  ipcMain.handle(IPC.sessionCreate, (_e, raw) => {
    const req = guard(() => validateCreate(raw))
    pty.create({
      ptyId: req.paneId,
      cwd: req.cwd,
      shell: req.shell,
      cols: req.cols,
      rows: req.rows,
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
    pty.kill(req.paneId)
  })
}

/** Hooks the PtyManager uses to push data/exit to the renderer. */
export function makePtyHooks(sender: WebContents) {
  return {
    onData(ptyId: string, data: string): void {
      if (sender.isDestroyed()) return
      const event: SessionDataEvent = { paneId: ptyId, data }
      sender.send(IPC.sessionData, event)
    },
    onExit(ptyId: string, code: number): void {
      if (sender.isDestroyed()) return
      const event: SessionExitEvent = { paneId: ptyId, code }
      sender.send(IPC.sessionExit, event)
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
