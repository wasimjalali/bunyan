import { useEffect, useRef } from 'react'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebglAddon } from '@xterm/addon-webgl'
import type { CursorStyle, Pane, SessionKind } from '@shared/types'
import { registerPaneTerminal, unregisterPaneTerminal } from './registry'
import '@xterm/xterm/css/xterm.css'

interface TerminalPaneProps {
  pane: Pane
  sessionId: string
  kind: SessionKind
  cwd: string
  /** Optional dimmed scrollback from a previous run, written above the live prompt. */
  restoreNote?: string
  theme: ITheme
  fontFamily: string
  fontSize: number
  cursorStyle: CursorStyle
  onFocus: () => void
}

// PTYs are created once per pty id. This guards against React remounts spawning
// a second shell for the same pane (we never run StrictMode, but the guard makes
// the contract explicit and safe).
const createdPtys = new Set<string>()

export function TerminalPane(props: TerminalPaneProps): React.JSX.Element {
  const { pane, sessionId, kind, cwd, restoreNote, theme, fontFamily, fontSize, cursorStyle } =
    props
  const ptyId = pane.ptyId
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  // Mount once per pane. Theme/font changes are applied in a separate effect.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const term = new Terminal({
      fontFamily,
      fontSize,
      cursorStyle,
      cursorBlink: true,
      allowProposedApi: true,
      theme,
      scrollback: 5000,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new SearchAddon())
    term.loadAddon(new WebLinksAddon())
    const unicode = new Unicode11Addon()
    term.loadAddon(unicode)
    term.unicode.activeVersion = '11'

    term.open(host)

    // WebGL renderer with a canvas fallback on context loss (spec 9.2, risks).
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => webgl.dispose())
      term.loadAddon(webgl)
    } catch {
      // No WebGL: xterm falls back to its DOM/canvas renderer automatically.
    }

    fit.fit()
    termRef.current = term
    fitRef.current = fit
    registerPaneTerminal(pane.id, term)

    const offData = window.bunyan.session.onData((e) => {
      if (e.paneId === ptyId) term.write(e.data)
    })
    const offExit = window.bunyan.session.onExit((e) => {
      if (e.paneId === ptyId) term.writeln('\r\n\x1b[2m[process exited]\x1b[0m')
    })

    // User keystrokes flow to the PTY.
    const inputSub = term.onData((data) => window.bunyan.session.write({ paneId: ptyId, data }))

    // Subscribe before create so no early output is lost.
    if (!createdPtys.has(ptyId)) {
      createdPtys.add(ptyId)
      if (restoreNote) term.write(restoreNote)
      void window.bunyan.session
        .create({ sessionId, paneId: ptyId, kind, cwd, cols: term.cols, rows: term.rows })
        .catch(() => {
          createdPtys.delete(ptyId)
          term.writeln('\x1b[31mCould not start the session.\x1b[0m')
        })
    }

    const ro = new ResizeObserver(() => {
      if (!termRef.current || !fitRef.current) return
      fitRef.current.fit()
      window.bunyan.session.resize({ paneId: ptyId, cols: term.cols, rows: term.rows })
    })
    ro.observe(host)

    return () => {
      ro.disconnect()
      offData()
      offExit()
      inputSub.dispose()
      unregisterPaneTerminal(pane.id)
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
    // Mount-once: identity props only. Visual props handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane.id, ptyId, sessionId, kind, cwd])

  // Live theme / font updates without re-creating the terminal.
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.theme = theme
    term.options.fontFamily = fontFamily
    term.options.fontSize = fontSize
    term.options.cursorStyle = cursorStyle
    fitRef.current?.fit()
  }, [theme, fontFamily, fontSize, cursorStyle])

  return (
    <div ref={hostRef} onMouseDown={props.onFocus} className="h-full w-full overflow-hidden px-2 pt-2" />
  )
}
