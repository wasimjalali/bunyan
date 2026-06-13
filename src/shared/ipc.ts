// Typed IPC contract between renderer and main. See spec section 7.3.
// The renderer never touches ipcRenderer directly; it talks to `window.bunyan`,
// whose shape is `BunyanApi` below.

import type { BellMode, ProjectSection, SessionKind, SessionStatus, Workspace } from './types'

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
  credSet: 'cred:set',
  credClear: 'cred:clear',
  credStatus: 'cred:status',
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
   * its own Claude settings/history. Absolute or "~/" path; omitted = default.
   */
  claudeConfigDir?: string
  /**
   * The rail section this session belongs to. The main process uses it to look
   * up the section's encrypted Claude OAuth token (CLAUDE_CODE_OAUTH_TOKEN); the
   * token itself never crosses to the renderer. Omitted = the default account.
   */
  section?: ProjectSection
}

/** Set (and encrypt) a section's Claude OAuth token. The token is write-only over IPC. */
export interface CredSetRequest {
  section: ProjectSection
  token: string
}

export interface CredSectionRequest {
  section: ProjectSection
}

/**
 * Per-section credential state for the UI. Never carries the token itself.
 * 'none' = no token; 'saved' = a token is stored and readable; 'unreadable' = a
 * token is stored but can't be decrypted (e.g. the OS key changed) and must be
 * re-entered, so the UI never shows a reassuring "saved" for a token that won't work.
 */
export type ClaudeAccountState = 'none' | 'saved' | 'unreadable'
export type ClaudeAccountStatus = Record<ProjectSection, ClaudeAccountState>

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
  cred: {
    /** Encrypt and store a section's Claude OAuth token in the main process. */
    set(req: CredSetRequest): Promise<void>
    /** Forget a section's token. */
    clear(req: CredSectionRequest): Promise<void>
    /** Which sections have a token saved (booleans only, never the token). */
    status(): Promise<ClaudeAccountStatus>
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
