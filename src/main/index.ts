import { app, type BrowserWindow } from 'electron'
import { createMainWindow } from './window'
import { PtyManager } from './pty/PtyManager'
import { WorkspaceStore } from './store/WorkspaceStore'
import { createCredentialStore } from './store/safe-credential-store'
import { SessionMonitor } from './monitor/SessionMonitor'
import { MacNotifier } from './notifications'
import {
  registerSessionIpc,
  registerProjectIpc,
  registerStoreIpc,
  registerCredentialIpc,
  makePtyHooks,
  makeMonitorEmit,
} from './ipc'

let mainWindow: BrowserWindow | null = null
let ptyManager: PtyManager | null = null
let monitor: SessionMonitor | null = null
const store = new WorkspaceStore()
// Built after app.whenReady (safeStorage needs the app initialised).
let credentials: ReturnType<typeof createCredentialStore> | null = null

function bootstrap(): void {
  const win = createMainWindow({
    bounds: store.loadBounds(),
    onBoundsChanged: (bounds) => store.saveBounds(bounds),
  })
  mainWindow = win

  const notifier = new MacNotifier(win)
  monitor = new SessionMonitor(makeMonitorEmit(win.webContents), notifier)
  // app.getLocale() is the macOS UI locale (e.g. "en-US"); PtyManager uses it to
  // synthesize a UTF-8 LANG for shells that would otherwise inherit none.
  ptyManager = new PtyManager(makePtyHooks(win.webContents, monitor), app.getLocale())
  credentials = createCredentialStore()

  registerSessionIpc(ptyManager, monitor, credentials)
  registerProjectIpc(win)
  registerStoreIpc(store)
  registerCredentialIpc(credentials)

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
