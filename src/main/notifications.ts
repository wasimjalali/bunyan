import { app, Notification, type BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'
import type { FocusRequestEvent } from '@shared/ipc'

export interface Notifier {
  notify(sessionId: string, projectName: string, opts?: { silent?: boolean }): void
  setBadgeCount(count: number): void
}

/**
 * macOS notifications and dock badge for sessions that need attention (spec 9.4).
 * Clicking a notification focuses the window and asks the renderer to focus that
 * session via app:focusRequest.
 */
export class MacNotifier implements Notifier {
  constructor(private readonly win: BrowserWindow) {}

  notify(sessionId: string, projectName: string, opts: { silent?: boolean } = {}): void {
    if (!Notification.isSupported()) return
    const n = new Notification({
      title: projectName || 'Bunyan',
      body: 'Claude needs your input',
      silent: opts.silent ?? true,
    })
    n.on('click', () => {
      if (this.win.isDestroyed()) return
      if (this.win.isMinimized()) this.win.restore()
      this.win.show()
      this.win.focus()
      const event: FocusRequestEvent = { sessionId }
      this.win.webContents.send(IPC.appFocusRequest, event)
    })
    n.show()
  }

  setBadgeCount(count: number): void {
    // app.dock is macOS-only; guard so this is harmless elsewhere.
    app.dock?.setBadge(count > 0 ? String(count) : '')
  }
}
