import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { resolve } from 'node:path'

// Regression for the non-English copy bug. A Finder-launched app inherits no
// LANG/LC_* from launchd; without one the shell can fall into the C/POSIX locale,
// where multibyte text (umlauts, eszett, euro) is mis-measured and the on-screen
// grid that xterm copies from gets corrupted. PtyManager now synthesizes a UTF-8
// LANG in that case (see src/main/pty/locale.ts). This spec launches the app with
// the locale env stripped, exactly like a Finder launch, and proves:
//   1. the shell ends up in a real xx_XX.UTF-8 locale (the one our code set), and
//   2. German round-trips through the PTY byte-for-byte.

const GERMAN = 'Gruesse äöüß€'

let app: ElectronApplication

test.beforeAll(async () => {
  // Strip every locale var so the shell starts as it would from Finder.
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue
    if (k === 'LANG' || k === 'LC_ALL' || k.startsWith('LC_')) continue
    env[k] = v
  }
  app = await electron.launch({ args: [resolve('out/main/index.js')], env })
})

test.afterAll(async () => {
  await app?.close()
})

// Run one command in a fresh shell PTY and return everything the PTY emitted in a
// short settle window. We send the command, then read the buffer after it drains.
async function runOnce(command: string): Promise<string> {
  const win = await app.firstWindow()
  return await win.evaluate(async ({ command }) => {
    const api = (window as any).bunyan
    const paneId = 'e2e-i18n-' + String(Date.now()) + '-' + String(Math.random())
    let acc = ''
    const off = api.session.onData((e: { paneId: string; data: string }) => {
      if (e.paneId === paneId) acc += e.data
    })
    await api.session.create({
      sessionId: 'e2e-i18n-ses',
      paneId,
      kind: 'shell',
      cwd: '',
      cols: 120,
      rows: 40,
    })
    await new Promise((r) => setTimeout(r, 900))
    api.session.write({ paneId, data: command + '\n' })
    await new Promise((r) => setTimeout(r, 900))
    off()
    return acc
  }, { command })
}

test('a Finder-launched shell gets a UTF-8 locale, not C/POSIX', async () => {
  const out = await runOnce('echo "LANGIS:$LANG:"')
  // The output carries the line twice: the shell's typed echo (still literal
  // "$LANG") and the expanded result. We want the expanded one, so collect all
  // captures and pick the value that actually looks like a locale.
  const values = [...out.matchAll(/LANGIS:([^:\r\n]+):/g)].map((m) => m[1])
  expect(values.length, 'shell did not report a LANG').toBeGreaterThan(0)
  const expanded = values.find((v) => v !== '$LANG')
  expect(expanded, 'shell reported no expanded LANG: ' + JSON.stringify(values)).toBeDefined()
  // A real xx_XX.UTF-8 locale that our code synthesized, not C/POSIX.
  expect(expanded!).toMatch(/^[a-z]{2}_[A-Z]{2}\.UTF-8$/)
})

test('German multibyte text round-trips through the PTY cleanly', async () => {
  // printf emits raw UTF-8 bytes for "Grüße äöü€"; in a UTF-8 locale the terminal
  // renders them unchanged. In C/POSIX the width math desyncs and the copy is dirty.
  const out = await runOnce(
    "printf 'ECHOED:Gr\\xc3\\xbc\\xc3\\x9fe \\xc3\\xa4\\xc3\\xb6\\xc3\\xbc\\xe2\\x82\\xac\\n'",
  )
  expect(out).toContain('ECHOED:Grüße äöü€')
})

test('selected German text lands in the clipboard byte-for-byte (NFC)', async () => {
  const win = await app.firstWindow()
  // The copy path is Electron's default Edit > Copy acting on the DOM selection
  // xterm maintains. This proves that selection -> OS clipboard preserves
  // multibyte exactly, with no decomposition or mojibake.
  await win.evaluate((german) => {
    const div = document.createElement('div')
    div.id = 'e2e-clip-src'
    div.textContent = german
    document.body.appendChild(div)
    const range = document.createRange()
    range.selectNodeContents(div)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
    document.execCommand('copy')
  }, GERMAN)
  const fromClipboard = await app.evaluate(({ clipboard }) => clipboard.readText())
  expect(fromClipboard.normalize('NFC')).toBe(GERMAN.normalize('NFC'))
  expect(fromClipboard).toBe(GERMAN)
})
