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
  sessionStatus: 'session:status',
  sessionExit: 'session:exit',
  projectOpenDialog: 'project:openDialog',
  projectGitBranch: 'project:gitBranch',
  storeLoad: 'store:load',
  storeSave: 'store:save',
  appFocusRequest: 'app:focusRequest',
  appActiveSession: 'app:activeSession',
  appNotifyPrefs: 'app:notifyPrefs',
} as const

/** The subset of settings the main process needs for notifications and the bell. */
export interface NotifyPrefs {
  notifications: boolean
  bell: BellMode
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

export interface GitBranchRequest {
  path: string
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
    onData(cb: (e: SessionDataEvent) => void): Unsubscribe
    onStatus(cb: (e: SessionStatusEvent) => void): Unsubscribe
    onExit(cb: (e: SessionExitEvent) => void): Unsubscribe
  }
  project: {
    openDialog(): Promise<OpenedProject | null>
    gitBranch(req: GitBranchRequest): Promise<GitBranchResult | null>
  }
  store: {
    load(): Promise<Workspace | null>
    save(workspace: Workspace): Promise<void>
  }
  app: {
    setActiveSession(sessionId: string | null): void
    setNotifyPrefs(prefs: NotifyPrefs): void
    onFocusRequest(cb: (e: FocusRequestEvent) => void): Unsubscribe
  }
}
