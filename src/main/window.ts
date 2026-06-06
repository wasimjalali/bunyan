import { BrowserWindow, session, shell } from 'electron'
import path from 'node:path'
import type { WindowBounds } from '@shared/types'

const DEEP_NAVY = '#0C1929'
const isDev = !!process.env.ELECTRON_RENDERER_URL

interface WindowOptions {
  bounds?: WindowBounds | null
  onBoundsChanged?: (bounds: WindowBounds) => void
}

/** Content-Security-Policy. Strict in production; relaxed just enough for Vite HMR in dev. */
function cspHeader(): string {
  if (isDev) {
    // Vite injects inline scripts/styles and talks to its dev server over ws.
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self' ws: http: https:",
      "img-src 'self' data:",
      "font-src 'self' data:",
    ].join('; ')
  }
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'", // xterm.js sets inline styles on its DOM
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
  ].join('; ')
}

export function createMainWindow(options: WindowOptions = {}): BrowserWindow {
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [cspHeader()],
      },
    })
  })

  const saved = options.bounds
  const win = new BrowserWindow({
    width: saved?.width ?? 1200,
    height: saved?.height ?? 800,
    ...(saved ? { x: saved.x, y: saved.y } : {}),
    minWidth: 720,
    minHeight: 480,
    show: false,
    backgroundColor: DEEP_NAVY,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webgl: true,
    },
  })

  win.once('ready-to-show', () => win.show())

  if (options.onBoundsChanged) {
    const report = (): void => options.onBoundsChanged!(win.getBounds())
    win.on('resized', report)
    win.on('moved', report)
  }

  // External links open in the user's browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  // The app never navigates after load. This stops a stray file drop (or any
  // hijacked link) from replacing the renderer with a file:// page; same-URL
  // reloads in dev stay allowed.
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) e.preventDefault()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return win
}
