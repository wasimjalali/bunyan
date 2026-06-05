import { app, type BrowserWindow } from 'electron'
import { createMainWindow } from './window'
import { PtyManager } from './pty/PtyManager'
import { WorkspaceStore } from './store/WorkspaceStore'
import { SessionMonitor } from './monitor/SessionMonitor'
import { MacNotifier } from './notifications'
import {
  registerSessionIpc,
  registerProjectIpc,
  registerStoreIpc,
  makePtyHooks,
  makeMonitorEmit,
} from './ipc'

let mainWindow: BrowserWindow | null = null
let ptyManager: PtyManager | null = null
let monitor: SessionMonitor | null = null
const store = new WorkspaceStore()

function bootstrap(): void {
  const win = createMainWindow({
    bounds: store.loadBounds(),
    onBoundsChanged: (bounds) => store.saveBounds(bounds),
  })
  mainWindow = win

  const notifier = new MacNotifier(win)
  monitor = new SessionMonitor(makeMonitorEmit(win.webContents), notifier)
  ptyManager = new PtyManager(makePtyHooks(win.webContents, monitor))

  registerSessionIpc(ptyManager, monitor)
  registerProjectIpc(win)
  registerStoreIpc(store)

  // Window focus feeds the monitor so a focused session clears its needs-input.
  win.on('focus', () => monitor?.setWindowFocused(true))
  win.on('blur', () => monitor?.setWindowFocused(false))

  win.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  bootstrap()

  // Single-window product: re-show the existing window rather than re-bootstrap
  // (which would double-register IPC handlers).
  app.on('activate', () => {
    mainWindow?.show()
  })
})

// macOS-only app: quit when the window closes (single-window product).
app.on('window-all-closed', () => {
  monitor?.dispose()
  ptyManager?.killAll()
  app.quit()
})

app.on('before-quit', () => {
  monitor?.dispose()
  ptyManager?.killAll()
})
