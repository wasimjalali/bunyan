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
// Single source of truth for the supported editors: the validator and the
// settings UI both derive from this list, so adding an editor is a one-place change.
export const EDITOR_CHOICES = ['vscode', 'cursor', 'zed', 'windsurf'] as const
export type EditorChoice = (typeof EDITOR_CHOICES)[number]

/** A saved prompt the user can fire into a terminal from the command palette. */
export interface Snippet {
  id: string
  name: string
  text: string
}

export interface Settings {
  theme: ThemeChoice
  fontFamily: string
  fontSize: number
  cursorStyle: CursorStyle
  bell: BellMode
  notifications: boolean
  /** Notify when a working session goes quiet for this many seconds (0 = off). */
  silenceAlertSeconds: number
  /** Float projects with a running session to the top of the rail. */
  autoSortProjects: boolean
  claudeAutoRelaunch: boolean
  defaultShell: string // resolved from $SHELL by default
  /** Which editor clickable file:line links open in. */
  editor: EditorChoice
  /** Ask before pasting multiple lines into a shell without bracketed paste. */
  pasteWarning: boolean
  /** macOS: Option sends Meta (for readline word shortcuts) instead of accents. */
  optionAsMeta: boolean
  /** Saved prompts surfaced in the command palette. */
  snippets: Snippet[]
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
  /** Last captured scrollback per pane (keyed by pane id), for restore. Capped. */
  scrollback?: Record<string, string>
}

// Project chip colours: a bright, premium gold and cream family. Spaced by
// lightness and saturation so all eight stay distinct at a 16px chip, and every
// shade carries the deep espresso chip letter at 4.5:1 or better. Assigned
// round-robin on add and editable from the picker; saved colours are never
// migrated, so older workspaces keep whatever hex they stored.
export const PROJECT_COLORS = [
  '#E6B33E', // Royal Gold
  '#F8EFCB', // Soft Cream
  '#D08C24', // Deep Honey
  '#ECD79A', // Champagne
  '#F39B2E', // Amber Honey
  '#F4E2A6', // Pale Gold
  '#EFC163', // Apricot Gold
  '#DBBA6E', // Warm Sand
] as const

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  fontFamily: 'JetBrains Mono, SF Mono, monospace',
  fontSize: 13,
  cursorStyle: 'block',
  bell: 'status-only',
  notifications: true,
  silenceAlertSeconds: 0,
  autoSortProjects: true,
  claudeAutoRelaunch: true,
  defaultShell: '',
  editor: 'vscode',
  pasteWarning: true,
  // Off by default: German and other European layouts need Option to type
  // everyday characters (@, [, ], {, }, |); meta-by-default would break them.
  // Users who want readline word shortcuts flip it in Settings.
  optionAsMeta: false,
  snippets: [],
}
