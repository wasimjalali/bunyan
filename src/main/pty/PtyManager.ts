import { spawn, type IPty } from 'node-pty'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { FlowGate } from './flow-gate'
import { resolveLocaleEnv } from './locale'

export interface SpawnOptions {
  ptyId: string
  cwd: string
  shell?: string
  cols: number
  rows: number
  /** A command written to the shell once it has had a moment to initialise. */
  runOnStart?: string
}

// Give the login shell a beat to run its rc files before we type into it, so a
// Claude session's `claude` lands at a real prompt rather than mid-init.
const RUN_ON_START_DELAY_MS = 300

// Flow-control watermarks in chars (UTF-16 code units, the unit both sides count
// in). Pause a PTY once ~1M chars are outstanding (sent but not yet acked by the
// renderer) and resume once acks drain it below 250K. The gap gives hysteresis
// so a `yes`-style flood doesn't flap pause/resume on every chunk.
const FLOW_HIGH_WATER = 1_000_000
const FLOW_LOW_WATER = 250_000

// Shells that take a `-l` login flag. A packaged app launched from Finder
// inherits launchd's minimal PATH; a login shell sources the user's profile so
// `claude` and Homebrew tools resolve as they do in Terminal.app.
const LOGIN_SHELLS = new Set(['zsh', 'bash', 'fish', 'sh'])

export interface PtyManagerHooks {
  onData(ptyId: string, data: string): void
  onExit(ptyId: string, code: number): void
}

/**
 * Owns every PTY. Lives only in the main process. The renderer reaches it
 * exclusively through validated IPC. PTY output is opaque bytes, never evaluated.
 */
interface PtyEntry {
  pty: IPty
  /** Backpressure accounting for this PTY's output stream. */
  gate: FlowGate
}

export class PtyManager {
  private readonly ptys = new Map<string, PtyEntry>()
  // Resolved once: the inputs (process.env at startup, the OS locale) don't
  // change while the app runs, and resolving stats the locale dir on disk.
  private readonly localeEnv: NodeJS.ProcessEnv

  /**
   * @param hooks     data/exit callbacks back into the main process
   * @param osLocale  the macOS UI locale (Electron app.getLocale()), used to give
   *                  a Finder-launched shell a UTF-8 LANG when it would otherwise
   *                  inherit none. Optional; the locale helper falls back to the
   *                  JS runtime locale, then en_US.UTF-8.
   */
  constructor(
    private readonly hooks: PtyManagerHooks,
    osLocale?: string,
  ) {
    this.localeEnv = resolveLocaleEnv(process.env, osLocale)
  }

  /** The user's login shell, falling back to a sane default per platform. */
  static defaultShell(): string {
    if (process.env.SHELL) return process.env.SHELL
    return process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh'
  }

  create(opts: SpawnOptions): string {
    // A renderer reload can lose its created-set while main still holds live
    // PTYs; replacing is the recoverable choice (kill the orphan, spawn fresh).
    if (this.ptys.has(opts.ptyId)) this.kill(opts.ptyId)

    const shell = opts.shell && opts.shell.trim() !== '' ? opts.shell : PtyManager.defaultShell()
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      // Give a Finder-launched shell a UTF-8 LANG when it inherited none, so
      // multibyte text (umlauts, eszett, euro) keeps its width and copies clean.
      // No-op when the user/profile already set a locale. See locale.ts for why.
      ...this.localeEnv,
    }

    const args = loginArgs(shell)
    const gate = new FlowGate(FLOW_HIGH_WATER, FLOW_LOW_WATER)
    const pty = spawn(shell, args, {
      name: 'xterm-256color',
      cols: opts.cols,
      rows: opts.rows,
      cwd: opts.cwd || os.homedir(),
      env,
    })

    pty.onData((data) => {
      this.hooks.onData(opts.ptyId, data)
      // Backpressure: once the renderer is too far behind, pause the source so
      // a `yes`/`cat bigfile` flood can't outrun the bridge and OOM the renderer.
      if (gate.add(data.length) === 'pause') pty.pause()
    })
    pty.onExit(({ exitCode }) => {
      gate.reset()
      this.ptys.delete(opts.ptyId)
      this.hooks.onExit(opts.ptyId, exitCode)
    })

    this.ptys.set(opts.ptyId, { pty, gate })

    if (opts.runOnStart) {
      const command = opts.runOnStart
      setTimeout(() => {
        // Only run if the PTY is still the one we spawned (not killed meanwhile).
        if (this.ptys.get(opts.ptyId)?.pty === pty) pty.write(`${command}\r`)
      }, RUN_ON_START_DELAY_MS)
    }

    return opts.ptyId
  }

  write(ptyId: string, data: string): void {
    this.ptys.get(ptyId)?.pty.write(data)
  }

  /** The renderer drained `chars` for this pane; resume the PTY if it can keep up. */
  ack(ptyId: string, chars: number): void {
    const entry = this.ptys.get(ptyId)
    if (!entry) return
    if (entry.gate.ack(chars) === 'resume') entry.pty.resume()
  }

  resize(ptyId: string, cols: number, rows: number): void {
    const entry = this.ptys.get(ptyId)
    if (!entry) return
    try {
      entry.pty.resize(cols, rows)
    } catch {
      // A resize racing a process exit can throw; the PTY is gone, nothing to do.
    }
  }

  kill(ptyId: string): void {
    const entry = this.ptys.get(ptyId)
    if (!entry) return
    entry.gate.reset()
    this.ptys.delete(ptyId)
    entry.pty.kill()
  }

  has(ptyId: string): boolean {
    return this.ptys.has(ptyId)
  }

  killAll(): void {
    for (const entry of this.ptys.values()) {
      entry.gate.reset()
      entry.pty.kill()
    }
    this.ptys.clear()
  }
}

// On a POSIX shell we know takes `-l`, spawn it as a login shell so it sources
// the user's profile (PATH etc.). Anything else gets no extra args.
function loginArgs(shell: string): string[] {
  if (process.platform === 'win32') return []
  const name = path.basename(shell)
  return LOGIN_SHELLS.has(name) ? ['-l'] : []
}
