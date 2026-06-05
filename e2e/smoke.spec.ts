import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { resolve } from 'node:path'

// End-to-end smoke over the real built app: Electron main + preload bridge +
// node-pty + the session monitor. We drive the PTY through window.bunyan rather
// than the native folder dialog (which can't be automated), which still exercises
// the full data and status path. See spec section 15.

let app: ElectronApplication

test.beforeAll(async () => {
  app = await electron.launch({ args: [resolve('out/main/index.js')] })
})

test.afterAll(async () => {
  await app?.close()
})

test('the window opens with the Bunyan title', async () => {
  const win = await app.firstWindow()
  await expect(win.locator('text=Bunyan').first()).toBeVisible({ timeout: 15_000 })
})

test('a shell session echoes back through the real PTY', async () => {
  const win = await app.firstWindow()
  const output: string = await win.evaluate(async () => {
    const api = (window as any).bunyan
    const paneId = 'e2e-shell-' + String(Date.now())
    return await new Promise<string>((resolveOut, rejectOut) => {
      let acc = ''
      const timeout = setTimeout(() => {
        off()
        rejectOut(new Error('no echo within timeout'))
      }, 12_000)
      const off = api.session.onData((e: { paneId: string; data: string }) => {
        if (e.paneId !== paneId) return
        acc += e.data
        if (acc.includes('hi-from-bunyan')) {
          clearTimeout(timeout)
          off()
          resolveOut(acc)
        }
      })
      void api.session
        .create({ sessionId: 'e2e-shell-ses', paneId, kind: 'shell', cwd: '', cols: 80, rows: 24 })
        .then(() => {
          setTimeout(() => api.session.write({ paneId, data: 'echo hi-from-bunyan\n' }), 400)
        })
        .catch(rejectOut)
    })
  })
  expect(output).toContain('hi-from-bunyan')
})

test('a bell in an unfocused session transitions it to needs-input', async () => {
  const win = await app.firstWindow()
  const status: string = await win.evaluate(async () => {
    const api = (window as any).bunyan
    const sessionId = 'e2e-bell-ses'
    const paneId = 'e2e-bell-' + String(Date.now())
    // Make sure this session is not the focused one, so a bell raises needs-input.
    api.app.setActiveSession('some-other-session')
    api.app.setNotifyPrefs({ notifications: false, bell: 'status-only' })
    return await new Promise<string>((resolveOut, rejectOut) => {
      const timeout = setTimeout(() => {
        off()
        rejectOut(new Error('no needs-input transition within timeout'))
      }, 12_000)
      const off = api.session.onStatus((e: { sessionId: string; status: string }) => {
        if (e.sessionId === sessionId && e.status === 'needs-input') {
          clearTimeout(timeout)
          off()
          resolveOut(e.status)
        }
      })
      void api.session
        .create({ sessionId, paneId, kind: 'shell', cwd: '', cols: 80, rows: 24 })
        .then(() => {
          // printf emits a real bell byte to stdout, which the monitor sees.
          setTimeout(() => api.session.write({ paneId, data: "printf '\\007'\n" }), 500)
        })
        .catch(rejectOut)
    })
  })
  expect(status).toBe('needs-input')
})
