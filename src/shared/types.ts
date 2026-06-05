// Core data model for Bunyan. Shared verbatim between main and renderer.
// See spec section 8.

export type SessionKind = 'shell' | 'claude' | 'custom'
export type SessionStatus = 'idle' | 'working' | 'needs-input' | 'exited'
export type SplitDir = 'row' | 'col'

export interface Pane {
  id: string
  ptyId: string // 1:1 with a PTY in the main process
}

// A session's view is a binary tree of panes (splits). Leaf = a Pane.
export type PaneNode =
  | { type: 'leaf'; pane: Pane }
  | { type: 'split'; dir: SplitDir; a: PaneNode; b: PaneNode; ratio: number }

export interface Session {
  id: string
  projectId: string
  title: string // e.g. "claude", "dev server", "shell"
  kind: SessionKind
  cwd: string
  layout: PaneNode // defaults to a single leaf
  status: SessionStatus // aggregated from its panes
  autoRelaunch: boolean // claude sessions: re-run `claude` on restore
}

export interface Project {
  id: string
  name: string // from the folder, editable
  path: string
  color: string // initial-chip colour, from a brand-safe set
  branch?: string // git branch readout
  collapsed: boolean
  sessionIds: string[] // order in the rail
}

export type ThemeChoice = 'dark' | 'light' | 'system'
export type CursorStyle = 'block' | 'bar' | 'underline'
export type BellMode = 'status-only' | 'sound' | 'off'

export interface Settings {
  theme: ThemeChoice
  fontFamily: string
  fontSize: number
  cursorStyle: CursorStyle
  bell: BellMode
  notifications: boolean
  claudeAutoRelaunch: boolean
  defaultShell: string // resolved from $SHELL by default
}

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface Workspace {
  projects: Project[]
  sessions: Session[]
  activeSessionId: string | null
  windowBounds?: WindowBounds
  settings: Settings
}

// Brand-safe project colours (no sage). Assigned round-robin on add, editable.
export const PROJECT_COLORS = [
  '#D4A853',
  '#6E8AAE',
  '#C4932E',
  '#7995BB',
  '#B58AC2',
  '#3F699F',
] as const

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  fontFamily: 'JetBrains Mono, SF Mono, monospace',
  fontSize: 13,
  cursorStyle: 'block',
  bell: 'status-only',
  notifications: true,
  claudeAutoRelaunch: true,
  defaultShell: '',
}
