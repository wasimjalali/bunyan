import { useEffect, useRef, useState } from 'react'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebglAddon } from '@xterm/addon-webgl'
import type { CursorStyle, Pane, ProjectSection, SessionKind } from '@shared/types'
import { registerPaneTerminal, unregisterPaneTerminal } from './registry'
import { captureScrollback, markScrollbackDirty } from './scrollback'
import {
  forgetClosedPty,
  stashPaneText,
  takePaneText,
  wasPtyClosed,
} from './lifecycle'
import { pastedPathsText } from './drop-paste'
import { findFileRefs } from './file-links'
import { ARM_WINDOW_MS, LinkGuard } from './link-guard'
import { PasteGuard } from './PasteGuard'
import { useFileDrop } from '../useFileDrop'
import { useStore } from '../state/store'
import { listPanes } from '@shared/pane-tree'
import '@xterm/xterm/css/xterm.css'

interface TerminalPaneProps {
  pane: Pane
  sessionId: string
  kind: SessionKind
  cwd: string
  projectName: string
  /** Preferred shell; empty falls back to $SHELL in the main process. */
  shell?: string
  /** A command to run once the shell is ready, e.g. "claude". */
  runOnStart?: string
  /** CLAUDE_CONFIG_DIR for this shell (the project section's Claude settings dir). */
  claudeConfigDir?: string
  /** The project's rail section; the main process maps it to the section's Claude token. */
  section?: ProjectSection
  /** Optional dimmed scrollback from a previous run, written above the live prompt. */
  restoreNote?: string
  theme: ITheme
  fontFamily: string
  fontSize: number
  cursorStyle: CursorStyle
  /** macOS: Option sends Meta (readline word shortcuts) instead of accents. */
  optionAsMeta: boolean
  onFocus: () => void
}

// PTYs are created once per pty id. This guards against React remounts spawning
// a second shell for the same pane (we never run StrictMode, but the guard makes
// the contract explicit and safe).
const createdPtys = new Set<string>()

// Resolve a clicked file ref to a path the main process can open, then hand it
// off. Absolute and "~/" paths pass through (main expands "~"); a relative path
// is joined onto the pane's cwd so it resolves to the project the shell runs in.
function openFileRef(
  ref: { path: string; line?: number; col?: number },
  cwd: string,
): void {
  let path = ref.path
  if (!path.startsWith('/') && !path.startsWith('~')) {
    const rel = path.startsWith('./') ? path.slice(2) : path
    path = cwd ? `${cwd.replace(/\/$/, '')}/${rel}` : rel
  }
  // The validator rejects line/col 0 (positions are 1-based); a tool that
  // prints "file.ts:0" still deserves to open the file, just without a jump.
  const line = ref.line && ref.line >= 1 ? ref.line : undefined
  void window.bunyan.app
    .openInEditor({
      path,
      line,
      col: line !== undefined && ref.col && ref.col >= 1 ? ref.col : undefined,
      editor: useStore.getState().workspace.settings.editor,
    })
    .catch(() => {
      // A rejected open (editor not installed, odd path) is not worth an error
      // banner in the pane; the click simply does nothing.
    })
}

// Only ship a resize when xterm reports real dimensions. A fit() against a
// zero-size or detached host can leave cols/rows at 0 or NaN, which would
// corrupt the PTY's window size.
function sendResize(ptyId: string, term: Terminal): void {
  const { cols, rows } = term
  if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols <= 0 || rows <= 0) return
  window.bunyan.session.resize({ paneId: ptyId, cols, rows })
}

export function TerminalPane(props: TerminalPaneProps): React.JSX.Element {
  const {
    pane,
    sessionId,
    kind,
    cwd,
    projectName,
    shell,
    runOnStart,
    claudeConfigDir,
    section,
    restoreNote,
    theme,
    fontFamily,
    fontSize,
    cursorStyle,
    optionAsMeta,
  } = props
  const ptyId = pane.ptyId
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  // Text held back by the multiline paste guard, awaiting confirm/cancel.
  const [pendingPaste, setPendingPaste] = useState<string | null>(null)
  // The insecure http link awaiting its confirm click, shown as a hint toast.
  const [armedLink, setArmedLink] = useState<string | null>(null)
  const armedLinkTimer = useRef<number | null>(null)

  // Dropping files pastes their escaped paths, exactly like Terminal.app.
  // paste() honours bracketed paste, which Claude Code relies on to turn a
  // dropped image path into an attachment.
  const { fileOver, dropHandlers } = useFileDrop((paths) => {
    const term = termRef.current
    if (!term) return
    term.paste(pastedPathsText(paths))
    term.focus()
    props.onFocus()
  })

  // Mount once per pane. Theme/font changes are applied in a separate effect.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    // Guards the async create() callback against a terminal disposed mid-flight.
    let disposed = false

    const term = new Terminal({
      fontFamily,
      fontSize,
      cursorStyle,
      cursorBlink: true,
      allowProposedApi: true,
      macOptionIsMeta: optionAsMeta,
      theme,
      scrollback: 5000,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    const search = new SearchAddon()
    term.loadAddon(search)
    // URL clicks go through the LinkGuard: https and localhost open at once;
    // plain http arms on the first click and opens on the second. window.open
    // is intercepted by the main process and routed to the system browser.
    const linkGuard = new LinkGuard()
    term.loadAddon(
      new WebLinksAddon((_event, uri) => {
        if (armedLinkTimer.current !== null) window.clearTimeout(armedLinkTimer.current)
        if (linkGuard.decide(uri, Date.now()) === 'open') {
          setArmedLink(null)
          window.open(uri, '_blank')
        } else {
          setArmedLink(uri)
          armedLinkTimer.current = window.setTimeout(() => setArmedLink(null), ARM_WINDOW_MS)
        }
      }),
    )
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

    // Multiline paste guard. Only intercept the dangerous case: bracketed paste
    // OFF means each newline in the clipboard runs as a command the instant it
    // lands (a bare sh/dash or a REPL). Claude Code and modern zsh turn bracketed
    // paste ON, which makes a multiline paste safe, so we let those through.
    const textarea = term.textarea
    const onPaste = (e: ClipboardEvent): void => {
      if (!useStore.getState().workspace.settings.pasteWarning) return
      const text = e.clipboardData?.getData('text') ?? ''
      if (!text.includes('\n')) return
      if (term.modes.bracketedPasteMode) return
      e.preventDefault()
      e.stopImmediatePropagation()
      setPendingPaste(text)
    }
    textarea?.addEventListener('paste', onPaste, true)

    // Clickable file:line links. We scan each buffer row with findFileRefs and
    // open the match in the configured editor. NOTE: refs are matched within a
    // single buffer row, so a path that soft-wraps across rows won't link; that
    // is an acceptable limitation for this iteration.
    const linkProvider = term.registerLinkProvider({
      provideLinks(lineNo, cb) {
        const text = term.buffer.active.getLine(lineNo - 1)?.translateToString(true)
        if (!text) {
          cb(undefined)
          return
        }
        const links = findFileRefs(text).map((ref) => ({
          // xterm ranges are 1-based and end-inclusive; our offsets are 0-based.
          range: {
            start: { x: ref.start + 1, y: lineNo },
            end: { x: ref.end, y: lineNo },
          },
          text: ref.text,
          activate: () => openFileRef(ref, cwd),
        }))
        cb(links.length > 0 ? links : undefined)
      },
    })

    fit.fit()
    termRef.current = term
    fitRef.current = fit
    registerPaneTerminal(pane.id, { term, search })

    // Flow control: ack each chunk back to the PTY once xterm has actually
    // written it, so main can pause a flooding PTY and resume as we catch up.
    // pendingChars tracks chars received but not yet acked; the cleanup flushes
    // the remainder so a pane unmounting mid-flood can't leave the PTY paused.
    let pendingChars = 0
    const offData = window.bunyan.session.onData((e) => {
      if (e.paneId !== ptyId) return
      pendingChars += e.data.length
      term.write(e.data, () => {
        pendingChars -= e.data.length
        window.bunyan.session.ack({ paneId: ptyId, chars: e.data.length })
      })
      markScrollbackDirty()
    })
    const offExit = window.bunyan.session.onExit((e) => {
      if (e.paneId === ptyId) term.writeln('\r\n\x1b[2m[process exited]\x1b[0m')
    })

    // User keystrokes flow to the PTY. When broadcast is on and this pane's
    // session is in the set, the same data also fans out to the first pane of
    // every OTHER member, so one keyboard drives several sessions at once.
    // Reads live state with no subscription: the keystroke path must not
    // re-render on every key.
    const inputSub = term.onData((data) => {
      window.bunyan.session.write({ paneId: ptyId, data })
      const { ui, workspace } = useStore.getState()
      const ids = ui.broadcastSessionIds
      if (!ids || !ids.includes(sessionId)) return
      for (const otherId of ids) {
        if (otherId === sessionId) continue
        const other = workspace.sessions.find((s) => s.id === otherId)
        const otherPtyId = other ? listPanes(other.layout)[0]?.ptyId : undefined
        if (otherPtyId && otherPtyId !== ptyId) {
          window.bunyan.session.write({ paneId: otherPtyId, data })
        }
      }
    })

    // Subscribe before create so no early output is lost.
    if (!createdPtys.has(ptyId)) {
      createdPtys.add(ptyId)
      if (restoreNote) term.write(restoreNote)
      void window.bunyan.session
        .create({
          sessionId,
          paneId: ptyId,
          kind,
          cwd,
          projectName,
          shell: shell && shell.trim() !== '' ? shell : undefined,
          runOnStart,
          claudeConfigDir,
          section,
          cols: term.cols,
          rows: term.rows,
        })
        .catch(() => {
          createdPtys.delete(ptyId)
          if (!disposed) term.writeln('\x1b[31mCould not start the session.\x1b[0m')
        })
    } else {
      // The PTY already exists, so this is a remount caused by the split tree
      // changing shape, not a fresh pane. Replay the text we stashed on unmount
      // so the pane keeps its history instead of going blank while its shell
      // keeps running.
      const stashed = takePaneText(ptyId)
      if (stashed) term.write(stashed)
    }

    const ro = new ResizeObserver(() => {
      if (!termRef.current || !fitRef.current) return
      // A hidden pane (background session) or a mid-layout host can report zero
      // size; fitting then would compute NaN/0 dimensions and ship a bad resize
      // to the PTY, scrambling the shell. Skip until the host has real space.
      if (host.clientWidth === 0 || host.clientHeight === 0) return
      fitRef.current.fit()
      sendResize(ptyId, term)
    })
    ro.observe(host)

    return () => {
      disposed = true
      ro.disconnect()
      offData()
      // Flush any chunks whose write callbacks haven't fired yet, so a pane
      // unmounting mid-flood (a split restructure) can't strand the PTY paused.
      // Best effort: xterm's write buffer still runs callbacks after dispose,
      // so late acks can re-send chars we flushed here. FlowGate clamps its
      // outstanding count at zero on the main side to absorb exactly that.
      if (pendingChars > 0) {
        window.bunyan.session.ack({ paneId: ptyId, chars: pendingChars })
        pendingChars = 0
      }
      offExit()
      inputSub.dispose()
      linkProvider.dispose()
      if (armedLinkTimer.current !== null) {
        window.clearTimeout(armedLinkTimer.current)
        armedLinkTimer.current = null
      }
      textarea?.removeEventListener('paste', onPaste, true)
      unregisterPaneTerminal(pane.id)
      // A real close (the PTY was killed) discards the pane for good; a
      // restructure unmount leaves the PTY running, so keep its on-screen text
      // to replay when the pane remounts in its new position.
      if (wasPtyClosed(ptyId)) {
        forgetClosedPty(ptyId)
        createdPtys.delete(ptyId)
      } else {
        stashPaneText(ptyId, captureScrollback(term))
      }
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
    term.options.macOptionIsMeta = optionAsMeta
    fitRef.current?.fit()
  }, [theme, fontFamily, fontSize, cursorStyle, optionAsMeta])

  return (
    <div
      ref={hostRef}
      onMouseDown={props.onFocus}
      {...dropHandlers}
      className={[
        'relative h-full w-full overflow-hidden px-2 pt-2',
        fileOver ? 'ring-2 ring-inset ring-gold' : '',
      ].join(' ')}
    >
      {armedLink !== null && (
        <div
          role="status"
          aria-live="polite"
          className="absolute bottom-2 left-1/2 z-10 flex max-w-[90%] -translate-x-1/2 items-center gap-2 rounded-md border border-line bg-surface px-3 py-1.5 text-xs shadow-lg"
        >
          <span className="shrink-0 font-medium text-gold">Not secure</span>
          <span className="truncate text-ink-dim">{armedLink}</span>
          <span className="shrink-0 text-ink">click again to open</span>
        </div>
      )}
      {pendingPaste !== null && (
        <PasteGuard
          text={pendingPaste}
          onPaste={() => {
            const term = termRef.current
            setPendingPaste(null)
            if (term) {
              term.paste(pendingPaste)
              term.focus()
            }
          }}
          onCancel={() => {
            setPendingPaste(null)
            termRef.current?.focus()
          }}
        />
      )}
    </div>
  )
}
