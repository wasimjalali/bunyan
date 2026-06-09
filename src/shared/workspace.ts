// Pure operations on the Workspace. No React, no IPC: fully unit-testable.
// The renderer's Zustand store is a thin wrapper over these.

import {
  PROJECT_COLORS,
  DEFAULT_SETTINGS,
  type Project,
  type Session,
  type SessionKind,
  type SessionStatus,
  type Workspace,
} from './types'
import { makeId } from './id'
import { makeLeaf, newPane } from './pane-tree'

export function createDefaultWorkspace(): Workspace {
  return {
    projects: [],
    sessions: [],
    activeSessionId: null,
    settings: { ...DEFAULT_SETTINGS },
  }
}

/**
 * The next project colour: the first brand colour no open project is using, so
 * each add gets a distinct hue. Once every colour is taken, fall back to
 * round-robin by count so adds keep cycling the brand set.
 */
export function nextProjectColor(usedColors: readonly string[]): string {
  const free = PROJECT_COLORS.find((c) => !usedColors.includes(c))
  return free ?? PROJECT_COLORS[usedColors.length % PROJECT_COLORS.length]!
}

export function createProject(path: string, name: string, color: string): Project {
  return {
    id: makeId('proj'),
    name,
    path,
    color,
    collapsed: false,
    sessionIds: [],
  }
}

/** A new session with a single leaf pane bound to the given pty id. */
export function createSession(
  projectId: string,
  kind: SessionKind,
  cwd: string,
  title: string,
  ptyId: string,
): Session {
  return {
    id: makeId('ses'),
    projectId,
    title,
    kind,
    cwd,
    layout: makeLeaf(newPane(ptyId)),
    status: 'idle',
    autoRelaunch: kind === 'claude',
  }
}

/**
 * Default title for a new session of `kind` in a project: "claude", "claude 2",
 * "shell", "shell 2", and so on. Counts existing same-kind sessions.
 */
export function nextSessionTitle(ws: Workspace, projectId: string, kind: SessionKind): string {
  const base = kind === 'claude' ? 'claude' : kind === 'shell' ? 'shell' : 'session'
  const count = ws.sessions.filter((s) => s.projectId === projectId && s.kind === kind).length
  return count === 0 ? base : `${base} ${count + 1}`
}

export function addProject(ws: Workspace, project: Project): Workspace {
  return { ...ws, projects: [...ws.projects, project] }
}

export function addSession(ws: Workspace, session: Session): Workspace {
  const projects = ws.projects.map((p) =>
    p.id === session.projectId ? { ...p, sessionIds: [...p.sessionIds, session.id] } : p,
  )
  return {
    ...ws,
    projects,
    sessions: [...ws.sessions, session],
    activeSessionId: session.id,
  }
}

export function removeSession(ws: Workspace, sessionId: string): Workspace {
  const sessions = ws.sessions.filter((s) => s.id !== sessionId)
  const projects = ws.projects.map((p) =>
    p.sessionIds.includes(sessionId)
      ? { ...p, sessionIds: p.sessionIds.filter((id) => id !== sessionId) }
      : p,
  )
  const activeSessionId =
    ws.activeSessionId === sessionId ? (sessions[0]?.id ?? null) : ws.activeSessionId
  return { ...ws, sessions, projects, activeSessionId }
}

export function removeProject(ws: Workspace, projectId: string): Workspace {
  const sessions = ws.sessions.filter((s) => s.projectId !== projectId)
  const projects = ws.projects.filter((p) => p.id !== projectId)
  const activeStillExists = sessions.some((s) => s.id === ws.activeSessionId)
  return {
    ...ws,
    projects,
    sessions,
    activeSessionId: activeStillExists ? ws.activeSessionId : (sessions[0]?.id ?? null),
  }
}

export function renameProject(ws: Workspace, projectId: string, name: string): Workspace {
  return {
    ...ws,
    projects: ws.projects.map((p) => (p.id === projectId ? { ...p, name } : p)),
  }
}

export function setProjectColor(ws: Workspace, projectId: string, color: string): Workspace {
  return {
    ...ws,
    projects: ws.projects.map((p) => (p.id === projectId ? { ...p, color } : p)),
  }
}

export function setProjectBranch(
  ws: Workspace,
  projectId: string,
  branch: string | undefined,
): Workspace {
  return {
    ...ws,
    projects: ws.projects.map((p) => (p.id === projectId ? { ...p, branch } : p)),
  }
}

export function toggleCollapse(ws: Workspace, projectId: string): Workspace {
  return {
    ...ws,
    projects: ws.projects.map((p) => (p.id === projectId ? { ...p, collapsed: !p.collapsed } : p)),
  }
}

export function setActiveSession(ws: Workspace, sessionId: string | null): Workspace {
  return { ...ws, activeSessionId: sessionId }
}

export function setSessionStatus(
  ws: Workspace,
  sessionId: string,
  status: SessionStatus,
): Workspace {
  return {
    ...ws,
    sessions: ws.sessions.map((s) => (s.id === sessionId ? { ...s, status } : s)),
  }
}

export function setSessionLayout(
  ws: Workspace,
  sessionId: string,
  layout: Session['layout'],
): Workspace {
  return {
    ...ws,
    sessions: ws.sessions.map((s) => (s.id === sessionId ? { ...s, layout } : s)),
  }
}

const STATUS_URGENCY: Record<SessionStatus, number> = {
  'needs-input': 3,
  working: 2,
  idle: 1,
  exited: 0,
}

/** A project's status is its most urgent session: needs-input > working > idle > exited. */
export function projectStatus(ws: Workspace, projectId: string): SessionStatus | null {
  const sessions = ws.sessions.filter((s) => s.projectId === projectId)
  if (sessions.length === 0) return null
  return sessions.reduce<SessionStatus>((most, s) => {
    return STATUS_URGENCY[s.status] > STATUS_URGENCY[most] ? s.status : most
  }, 'exited')
}

export function projectSessions(ws: Workspace, projectId: string): Session[] {
  const project = ws.projects.find((p) => p.id === projectId)
  if (!project) return []
  return project.sessionIds
    .map((id) => ws.sessions.find((s) => s.id === id))
    .filter((s): s is Session => s !== undefined)
}

// Activity tiers for the rail's auto-sort: lower sorts higher. An agent running
// right now (needs-input or working) outranks a live prompt (idle), which
// outranks a project of only finished sessions, which outranks an empty one.
const ACTIVITY_TIER: Record<SessionStatus, number> = {
  'needs-input': 0,
  working: 0,
  idle: 1,
  exited: 2,
}

/** Count of a project's sessions with an agent running now (working or needs-input). */
export function runningSessionCount(ws: Workspace, projectId: string): number {
  return ws.sessions.filter(
    (s) => s.projectId === projectId && (s.status === 'working' || s.status === 'needs-input'),
  ).length
}

/**
 * Projects sorted by activity, so the ones with a live agent rise to the top.
 * The sort is stable within a tier: a project's manual rail position is the
 * tiebreaker, so dragging still sticks among equally-active projects.
 */
export function orderProjectsByActivity(ws: Workspace): Project[] {
  const tierOf = (p: Project): number => {
    const status = projectStatus(ws, p.id)
    return status === null ? 3 : ACTIVITY_TIER[status]
  }
  return ws.projects
    .map((project, index) => ({ project, index, tier: tierOf(project) }))
    .sort((a, b) => a.tier - b.tier || a.index - b.index)
    .map((d) => d.project)
}

/** Count of sessions currently needing input, for the dock badge. */
export function needsInputCount(ws: Workspace): number {
  return ws.sessions.filter((s) => s.status === 'needs-input').length
}

/** All session ids in the given project order: each project's sessions, in turn. */
export function orderedSessionIdsFor(projects: readonly Project[]): string[] {
  return projects.flatMap((p) => p.sessionIds)
}

/**
 * The session `step` away from the active one, wrapping around, walking the
 * given displayed project order so Cmd-]/[ track what the eye sees. Null if none.
 */
export function sessionByOffsetIn(
  ws: Workspace,
  projects: readonly Project[],
  step: number,
): string | null {
  const order = orderedSessionIdsFor(projects)
  if (order.length === 0) return null
  const current = ws.activeSessionId ? order.indexOf(ws.activeSessionId) : -1
  if (current === -1) return order[0]!
  const next = (current + step + order.length) % order.length
  return order[next]!
}

/** The nth session (1-based) in the given displayed project order. Null if out of range. */
export function sessionByIndexIn(
  projects: readonly Project[],
  oneBased: number,
): string | null {
  return orderedSessionIdsFor(projects)[oneBased - 1] ?? null
}

/** Move the item at `from` to `to` in a copy of the array. Indices are clamped. */
export function moveInArray<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length) return items
  const next = items.slice()
  const [moved] = next.splice(from, 1)
  if (moved === undefined) return items
  const target = Math.min(Math.max(to, 0), next.length)
  next.splice(target, 0, moved)
  return next
}

/** Reorder a project to a new index in the rail. */
export function reorderProject(ws: Workspace, projectId: string, toIndex: number): Workspace {
  const from = ws.projects.findIndex((p) => p.id === projectId)
  if (from === -1) return ws
  return { ...ws, projects: moveInArray(ws.projects, from, toIndex) }
}

/** Reorder a session within its project's session list. */
export function reorderSession(
  ws: Workspace,
  projectId: string,
  sessionId: string,
  toIndex: number,
): Workspace {
  return {
    ...ws,
    projects: ws.projects.map((p) => {
      if (p.id !== projectId) return p
      const from = p.sessionIds.indexOf(sessionId)
      if (from === -1) return p
      return { ...p, sessionIds: moveInArray(p.sessionIds, from, toIndex) }
    }),
  }
}

/** The project owning the active session, or null when no session is active. */
export function activeProjectId(ws: Workspace): string | null {
  return ws.sessions.find((s) => s.id === ws.activeSessionId)?.projectId ?? null
}

/** The project that should receive a new session: the active session's, else the first. */
export function activeOrFirstProjectId(ws: Workspace): string | null {
  const active = ws.sessions.find((s) => s.id === ws.activeSessionId)
  if (active) return active.projectId
  return ws.projects[0]?.id ?? null
}
