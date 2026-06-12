// Typed IPC contract between renderer and main. See spec section 7.3.
// The renderer never touches ipcRenderer directly; it talks to `window.bunyan`,
// whose shape is `BunyanApi` below.

import type { BellMode, SessionKind, SessionStatus, Workspace } from './types'

export const IPC = {
  sessionCreate: 'session:create',
  sessionWrite: 'session:write',
  sessionResize: 'session:resize',
  sessionKill: 'session:kill',
  sessionData: 'session:data',
  sessionAck: 'session:ack',
  sessionStatus: 'session:status',
  sessionExit: 'session:exit',
  projectOpenDialog: 'project:openDialog',
  projectFromPath: 'project:fromPath',
  projectGitBranch: 'project:gitBranch',
  storeLoad: 'store:load',
  storeSave: 'store:save',
  appFocusRequest: 'app:focusRequest',
  appActiveSession: 'app:activeSession',
  appNotifyPrefs: 'app:notifyPrefs',
  appOpenInEditor: 'app:openInEditor',
} as const

/** The subset of settings the main process needs for notifications and the bell. */
export interface NotifyPrefs {
  notifications: boolean
  bell: BellMode
  /** Notify when a working session goes quiet for this many seconds (0 = off). */
  silenceAlertSeconds: number
}

/**
 * The shape a Claude config dir must have: absolute or ~-relative. The renderer
 * gate (don't send a typo) and the main-process validator (trust boundary)
 * share this one predicate so the rule can't drift between them.
 */
export function isAbsoluteOrTildePath(p: string): boolean {
  return p.startsWith('/') || p === '~' || p.startsWith('~/')
}

// Bounds used by payload validation in the main process.
export const LIMITS = {
  minCols: 1,
  maxCols: 2000,
  minRows: 1,
  maxRows: 2000,
  maxWriteBytes: 1_000_000,
} as const

// --- request / response payloads (renderer -> main) ---

export interface SessionCreateRequest {
  sessionId: string
  paneId: string
  kind: SessionKind
  cwd: string
  shell?: string
  cols: number
  rows: number
  /** Project name, used only as the notification title when this session needs input. */
  projectName?: string
  /** A command to run once the shell is ready (e.g. "claude" for a Claude session). */
  runOnStart?: string
  /**
   * CLAUDE_CONFIG_DIR for this session's shell, so each rail section can hold
   * its own Claude login. Absolute or "~/" path; omitted = the default account.
   */
  claudeConfigDir?: string
}

export interface SessionCreateResult {
  paneId: string
}

export interface SessionWriteRequest {
  paneId: string
  data: string
}

export interface SessionResizeRequest {
  paneId: string
  cols: number
  rows: number
}

export interface SessionKillRequest {
  paneId: string
}

// Renderer flow-control ack: how many chars (JS string .length, i.e. UTF-16
// code units) it has drained for a pane. The SAME string crosses the bridge in
// session:data, so both sides count identically and the watermark stays honest.
export interface SessionAckRequest {
  paneId: string
  chars: number
}

export interface GitBranchRequest {
  path: string
}

export interface OpenInEditorRequest {
  /** Absolute file path (a leading "~" is expanded in the main process). */
  path: string
  line?: number
  col?: number
  /** An EditorChoice id; the main process maps it to a URI scheme. */
  editor: string
}

export interface OpenedProject {
  path: string
  name: string
}

export interface GitBranchResult {
  branch: string
}

// --- streamed events (main -> renderer) ---

export interface SessionDataEvent {
  paneId: string
  data: string
}

export interface SessionStatusEvent {
  sessionId: string
  status: SessionStatus
  reason: string
}

export interface SessionExitEvent {
  paneId: string
  code: number
}

export interface FocusRequestEvent {
  sessionId: string
}

export type Unsubscribe = () => void

// The single API object exposed on `window.bunyan` by the preload bridge.
export interface BunyanApi {
  session: {
    create(req: SessionCreateRequest): Promise<SessionCreateResult>
    write(req: SessionWriteRequest): void
    resize(req: SessionResizeRequest): void
    kill(req: SessionKillRequest): Promise<void>
    ack(req: SessionAckRequest): void
    onData(cb: (e: SessionDataEvent) => void): Unsubscribe
    onStatus(cb: (e: SessionStatusEvent) => void): Unsubscribe
    onExit(cb: (e: SessionExitEvent) => void): Unsubscribe
  }
  project: {
    openDialog(): Promise<OpenedProject | null>
    /** Resolve a dropped path to a project, or null if it is not a directory. */
    fromPath(path: string): Promise<OpenedProject | null>
    gitBranch(req: GitBranchRequest): Promise<GitBranchResult | null>
  }
  store: {
    load(): Promise<Workspace | null>
    save(workspace: Workspace): Promise<void>
  }
  app: {
    setActiveSession(sessionId: string | null): void
    setNotifyPrefs(prefs: NotifyPrefs): void
    /** The filesystem path of a dropped File (Electron webUtils). Empty if unknown. */
    pathForFile(file: File): string
    /** Open a file (optionally at a line/col) in the configured editor. */
    openInEditor(req: OpenInEditorRequest): Promise<void>
    onFocusRequest(cb: (e: FocusRequestEvent) => void): Unsubscribe
  }
}
