import { app, BrowserWindow } from 'electron'
import { createMainWindow } from './window'
import { PtyManager } from './pty/PtyManager'
import { registerSessionIpc, makePtyHooks } from './ipc'

let mainWindow: BrowserWindow | null = null
let ptyManager: PtyManager | null = null

function bootstrap(): void {
  mainWindow = createMainWindow()
  const hooks = makePtyHooks(mainWindow.webContents)
  ptyManager = new PtyManager(hooks)
  registerSessionIpc(ptyManager)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  bootstrap()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) bootstrap()
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
