import { app, type BrowserWindow } from 'electron'
import { createMainWindow } from './window'
import { PtyManager } from './pty/PtyManager'
import { WorkspaceStore } from './store/WorkspaceStore'
import { registerSessionIpc, registerProjectIpc, registerStoreIpc, makePtyHooks } from './ipc'

let mainWindow: BrowserWindow | null = null
let ptyManager: PtyManager | null = null
const store = new WorkspaceStore()

function bootstrap(): void {
  mainWindow = createMainWindow({
    bounds: store.loadBounds(),
    onBoundsChanged: (bounds) => store.saveBounds(bounds),
  })

  const hooks = makePtyHooks(mainWindow.webContents)
  ptyManager = new PtyManager(hooks)

  registerSessionIpc(ptyManager)
  registerProjectIpc(mainWindow)
  registerStoreIpc(store)

  mainWindow.on('closed', () => {
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
  ptyManager?.killAll()
  app.quit()
})

app.on('before-quit', () => {
  ptyManager?.killAll()
})
