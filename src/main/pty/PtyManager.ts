import { spawn, type IPty } from 'node-pty'
import os from 'node:os'
import process from 'node:process'

export interface SpawnOptions {
  ptyId: string
  cwd: string
  shell?: string
  cols: number
  rows: number
}

export interface PtyManagerHooks {
  onData(ptyId: string, data: string): void
  onExit(ptyId: string, code: number): void
}

/**
 * Owns every PTY. Lives only in the main process. The renderer reaches it
 * exclusively through validated IPC. PTY output is opaque bytes, never evaluated.
 */
export class PtyManager {
  private readonly ptys = new Map<string, IPty>()

  constructor(private readonly hooks: PtyManagerHooks) {}

  /** The user's login shell, falling back to a sane default per platform. */
  static defaultShell(): string {
    if (process.env.SHELL) return process.env.SHELL
    return process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh'
  }

  create(opts: SpawnOptions): string {
    const shell = opts.shell && opts.shell.trim() !== '' ? opts.shell : PtyManager.defaultShell()
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    }

    const pty = spawn(shell, [], {
      name: 'xterm-256color',
      cols: opts.cols,
      rows: opts.rows,
      cwd: opts.cwd || os.homedir(),
      env,
    })

    pty.onData((data) => this.hooks.onData(opts.ptyId, data))
    pty.onExit(({ exitCode }) => {
      this.ptys.delete(opts.ptyId)
      this.hooks.onExit(opts.ptyId, exitCode)
    })

    this.ptys.set(opts.ptyId, pty)
    return opts.ptyId
  }

  write(ptyId: string, data: string): void {
    this.ptys.get(ptyId)?.write(data)
  }

  resize(ptyId: string, cols: number, rows: number): void {
    const pty = this.ptys.get(ptyId)
    if (!pty) return
    try {
      pty.resize(cols, rows)
    } catch {
      // A resize racing a process exit can throw; the PTY is gone, nothing to do.
    }
  }

  kill(ptyId: string): void {
    const pty = this.ptys.get(ptyId)
    if (!pty) return
    this.ptys.delete(ptyId)
    pty.kill()
  }

  has(ptyId: string): boolean {
    return this.ptys.has(ptyId)
  }

  killAll(): void {
    for (const pty of this.ptys.values()) pty.kill()
    this.ptys.clear()
  }
}
