import { describe, it, expect } from 'vitest'
import {
  createDefaultWorkspace,
  nextProjectColor,
  createProject,
  createSession,
  nextSessionTitle,
  addProject,
  addSession,
  removeSession,
  removeProject,
  renameProject,
  toggleCollapse,
  setActiveSession,
  setSessionStatus,
  projectStatus,
  projectSessions,
  needsInputCount,
  activeProjectId,
  activeOrFirstProjectId,
  moveInArray,
  reorderProject,
  reorderSession,
  orderProjectsByActivity,
  orderedSessionIdsFor,
  runningSessionCount,
  sessionByIndexIn,
  sessionByOffsetIn,
} from './workspace'
import { PROJECT_COLORS } from './types'

function seed() {
  let ws = createDefaultWorkspace()
  const p = createProject('/repo/alpha', 'alpha', PROJECT_COLORS[0]!)
  ws = addProject(ws, p)
  return { ws, p }
}

describe('workspace', () => {
  it('starts empty with default settings', () => {
    const ws = createDefaultWorkspace()
    expect(ws.projects).toEqual([])
    expect(ws.sessions).toEqual([])
    expect(ws.activeSessionId).toBeNull()
    expect(ws.settings.theme).toBe('dark')
  })

  it('picks the first unused brand colour, then cycles when all are taken', () => {
    // No projects yet: the first brand colour.
    expect(nextProjectColor([])).toBe(PROJECT_COLORS[0])
    // First colour taken: skip to the next free one, not a duplicate.
    expect(nextProjectColor([PROJECT_COLORS[0]])).toBe(PROJECT_COLORS[1])
    // A gap in the middle is filled before later colours.
    expect(nextProjectColor([PROJECT_COLORS[0], PROJECT_COLORS[2]])).toBe(PROJECT_COLORS[1])
    // Every colour used: fall back to round-robin by count.
    expect(nextProjectColor([...PROJECT_COLORS])).toBe(PROJECT_COLORS[0])
  })

  it('adds a session, links it to its project, and makes it active', () => {
    const { ws, p } = seed()
    const s = createSession(p.id, 'shell', p.path, 'shell', 'pty_1')
    const next = addSession(ws, s)
    expect(next.sessions).toHaveLength(1)
    expect(next.projects[0]!.sessionIds).toEqual([s.id])
    expect(next.activeSessionId).toBe(s.id)
  })

  it('names sessions by kind, incrementing duplicates', () => {
    const { p } = seed()
    let ws = addProject(createDefaultWorkspace(), p)
    expect(nextSessionTitle(ws, p.id, 'claude')).toBe('claude')
    ws = addSession(ws, createSession(p.id, 'claude', p.path, 'claude', 'pty_1'))
    expect(nextSessionTitle(ws, p.id, 'claude')).toBe('claude 2')
    expect(nextSessionTitle(ws, p.id, 'shell')).toBe('shell')
  })

  it('claude sessions default to auto-relaunch, shells do not', () => {
    const { p } = seed()
    expect(createSession(p.id, 'claude', p.path, 'claude', 'pty_1').autoRelaunch).toBe(true)
    expect(createSession(p.id, 'shell', p.path, 'shell', 'pty_2').autoRelaunch).toBe(false)
  })

  it('removing the active session re-points active to a survivor', () => {
    const { p } = seed()
    let ws = addProject(createDefaultWorkspace(), p)
    const s1 = createSession(p.id, 'shell', p.path, 'shell', 'pty_1')
    const s2 = createSession(p.id, 'shell', p.path, 'shell 2', 'pty_2')
    ws = addSession(addSession(ws, s1), s2)
    expect(ws.activeSessionId).toBe(s2.id)
    ws = removeSession(ws, s2.id)
    expect(ws.activeSessionId).toBe(s1.id)
    expect(ws.projects[0]!.sessionIds).toEqual([s1.id])
  })

  it('removing a project drops its sessions and clears active', () => {
    const { p } = seed()
    let ws = addProject(createDefaultWorkspace(), p)
    ws = addSession(ws, createSession(p.id, 'shell', p.path, 'shell', 'pty_1'))
    ws = removeProject(ws, p.id)
    expect(ws.projects).toEqual([])
    expect(ws.sessions).toEqual([])
    expect(ws.activeSessionId).toBeNull()
  })

  it('renames, recolours, collapses and re-activates', () => {
    const { p } = seed()
    let ws = addProject(createDefaultWorkspace(), p)
    ws = renameProject(ws, p.id, 'beta')
    expect(ws.projects[0]!.name).toBe('beta')
    ws = toggleCollapse(ws, p.id)
    expect(ws.projects[0]!.collapsed).toBe(true)
    ws = setActiveSession(ws, null)
    expect(ws.activeSessionId).toBeNull()
  })

  it('aggregates project status by urgency', () => {
    const { p } = seed()
    let ws = addProject(createDefaultWorkspace(), p)
    const s1 = createSession(p.id, 'shell', p.path, 'shell', 'pty_1')
    const s2 = createSession(p.id, 'claude', p.path, 'claude', 'pty_2')
    ws = addSession(addSession(ws, s1), s2)
    ws = setSessionStatus(ws, s1.id, 'working')
    ws = setSessionStatus(ws, s2.id, 'needs-input')
    expect(projectStatus(ws, p.id)).toBe('needs-input')
    expect(needsInputCount(ws)).toBe(1)
    ws = setSessionStatus(ws, s2.id, 'idle')
    expect(projectStatus(ws, p.id)).toBe('working')
  })

  it('navigates sessions by offset with wraparound', () => {
    const { p } = seed()
    let ws = addProject(createDefaultWorkspace(), p)
    const s1 = createSession(p.id, 'shell', p.path, 'shell', 'pty_1')
    const s2 = createSession(p.id, 'shell', p.path, 'shell 2', 'pty_2')
    ws = addSession(addSession(ws, s1), s2) // active is s2
    expect(sessionByOffsetIn(ws, ws.projects, 1)).toBe(s1.id) // wraps to start
    expect(sessionByOffsetIn(ws, ws.projects, -1)).toBe(s1.id)
    expect(sessionByIndexIn(ws.projects, 1)).toBe(s1.id)
    expect(sessionByIndexIn(ws.projects, 2)).toBe(s2.id)
    expect(sessionByIndexIn(ws.projects, 9)).toBeNull()
  })

  it('picks the active project, or the first, for a new session', () => {
    const { p } = seed()
    let ws = addProject(createDefaultWorkspace(), p)
    expect(activeOrFirstProjectId(ws)).toBe(p.id) // no active -> first
    const s1 = createSession(p.id, 'shell', p.path, 'shell', 'pty_1')
    ws = addSession(ws, s1)
    expect(activeOrFirstProjectId(ws)).toBe(p.id)
  })

  it('resolves the active project, or null when nothing is active', () => {
    const { p } = seed()
    let ws = addProject(createDefaultWorkspace(), p)
    expect(activeProjectId(ws)).toBeNull() // no active session -> null, not the first
    const s1 = createSession(p.id, 'shell', p.path, 'shell', 'pty_1')
    ws = setActiveSession(addSession(ws, s1), s1.id)
    expect(activeProjectId(ws)).toBe(p.id)
  })

  it('moves an item within an array, clamping the target', () => {
    expect(moveInArray(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveInArray(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
    expect(moveInArray(['a', 'b', 'c'], 0, 99)).toEqual(['b', 'c', 'a'])
    expect(moveInArray(['a', 'b', 'c'], 5, 0)).toEqual(['a', 'b', 'c']) // out of range: unchanged
  })

  it('reorders projects', () => {
    let ws = createDefaultWorkspace()
    const a = createProject('/a', 'a', PROJECT_COLORS[0]!)
    const b = createProject('/b', 'b', PROJECT_COLORS[1]!)
    ws = addProject(addProject(ws, a), b)
    ws = reorderProject(ws, a.id, 1)
    expect(ws.projects.map((p) => p.id)).toEqual([b.id, a.id])
  })

  it('reorders sessions within their project', () => {
    const { p } = seed()
    let ws = addProject(createDefaultWorkspace(), p)
    const s1 = createSession(p.id, 'shell', p.path, 'shell', 'pty_1')
    const s2 = createSession(p.id, 'shell', p.path, 'shell 2', 'pty_2')
    ws = addSession(addSession(ws, s1), s2)
    ws = reorderSession(ws, p.id, s1.id, 1)
    expect(ws.projects[0]!.sessionIds).toEqual([s2.id, s1.id])
  })

  it('lists project sessions in rail order', () => {
    const { p } = seed()
    let ws = addProject(createDefaultWorkspace(), p)
    const s1 = createSession(p.id, 'shell', p.path, 'shell', 'pty_1')
    const s2 = createSession(p.id, 'shell', p.path, 'shell 2', 'pty_2')
    ws = addSession(addSession(ws, s1), s2)
    expect(projectSessions(ws, p.id).map((s) => s.id)).toEqual([s1.id, s2.id])
  })
})

describe('orderProjectsByActivity', () => {
  // Five projects in a fixed manual order, each set to a different tier.
  function seedTiers() {
    let ws = createDefaultWorkspace()
    const a = createProject('/a', 'A', PROJECT_COLORS[0]!)
    const b = createProject('/b', 'B', PROJECT_COLORS[1]!)
    const c = createProject('/c', 'C', PROJECT_COLORS[2]!)
    const d = createProject('/d', 'D', PROJECT_COLORS[3]!)
    const e = createProject('/e', 'E', PROJECT_COLORS[4]!)
    for (const p of [a, b, c, d, e]) ws = addProject(ws, p)
    // A idle, B working, C no sessions, D needs-input, E exited.
    const sa = createSession(a.id, 'shell', a.path, 'shell', 'pty_a')
    const sb = createSession(b.id, 'claude', b.path, 'claude', 'pty_b')
    const sd = createSession(d.id, 'claude', d.path, 'claude', 'pty_d')
    const se = createSession(e.id, 'shell', e.path, 'shell', 'pty_e')
    ws = addSession(addSession(addSession(addSession(ws, sa), sb), sd), se)
    ws = setSessionStatus(ws, sa.id, 'idle')
    ws = setSessionStatus(ws, sb.id, 'working')
    ws = setSessionStatus(ws, sd.id, 'needs-input')
    ws = setSessionStatus(ws, se.id, 'exited')
    return { ws, a, b, c, d, e }
  }

  it('puts projects with working or needs-input sessions first, preserving manual order within tiers', () => {
    const { ws, a, b, c, d, e } = seedTiers()
    // Tier 0: B (working), D (needs-input) in manual order; then A (idle), E (exited), C (none).
    expect(orderProjectsByActivity(ws).map((p) => p.id)).toEqual([b.id, d.id, a.id, e.id, c.id])
  })

  it('returns the manual order untouched when all projects share a tier', () => {
    let ws = createDefaultWorkspace()
    const a = createProject('/a', 'A', PROJECT_COLORS[0]!)
    const b = createProject('/b', 'B', PROJECT_COLORS[1]!)
    const c = createProject('/c', 'C', PROJECT_COLORS[2]!)
    for (const p of [a, b, c]) ws = addProject(ws, p)
    // All three are tier 3 (no sessions): same contents, same order.
    expect(orderProjectsByActivity(ws).map((p) => p.id)).toEqual([a.id, b.id, c.id])
  })
})

describe('orderedSessionIdsFor', () => {
  it('flattens session ids in the given project order', () => {
    let ws = createDefaultWorkspace()
    const a = createProject('/a', 'A', PROJECT_COLORS[0]!)
    const b = createProject('/b', 'B', PROJECT_COLORS[1]!)
    ws = addProject(addProject(ws, a), b)
    const sa = createSession(a.id, 'shell', a.path, 'shell', 'pty_a')
    const sb = createSession(b.id, 'shell', b.path, 'shell', 'pty_b')
    ws = addSession(addSession(ws, sa), sb)
    const a2 = ws.projects.find((p) => p.id === a.id)!
    const b2 = ws.projects.find((p) => p.id === b.id)!
    // Display order puts B first: B's sessions lead.
    expect(orderedSessionIdsFor([b2, a2])).toEqual([sb.id, sa.id])
  })

  it('with auto-sort on, Cmd-1 resolves to the working project even when it is last in manual order', () => {
    let ws = createDefaultWorkspace()
    const idle = createProject('/idle', 'idle', PROJECT_COLORS[0]!)
    const working = createProject('/working', 'working', PROJECT_COLORS[1]!)
    ws = addProject(addProject(ws, idle), working) // working is last in manual order
    const si = createSession(idle.id, 'shell', idle.path, 'shell', 'pty_i')
    const sw = createSession(working.id, 'claude', working.path, 'claude', 'pty_w')
    ws = addSession(addSession(ws, si), sw)
    ws = setSessionStatus(ws, si.id, 'idle')
    ws = setSessionStatus(ws, sw.id, 'working')
    const displayed = orderProjectsByActivity(ws)
    // Cmd-1 is the first session in displayed order: the working one.
    expect(sessionByIndexIn(displayed, 1)).toBe(sw.id)
  })
})

describe('sessionByOffsetIn / sessionByIndexIn', () => {
  it('navigates in displayed order, not manual order', () => {
    let ws = createDefaultWorkspace()
    const idle = createProject('/idle', 'idle', PROJECT_COLORS[0]!)
    const working = createProject('/working', 'working', PROJECT_COLORS[1]!)
    ws = addProject(addProject(ws, idle), working)
    const si = createSession(idle.id, 'shell', idle.path, 'shell', 'pty_i')
    const sw = createSession(working.id, 'claude', working.path, 'claude', 'pty_w')
    ws = addSession(addSession(ws, si), sw)
    ws = setSessionStatus(ws, si.id, 'idle')
    ws = setSessionStatus(ws, sw.id, 'working')
    ws = setActiveSession(ws, sw.id)
    // The working project floats above the idle one despite manual order.
    const displayed = orderProjectsByActivity(ws)
    // Cmd-] from the working session (displayed first) wraps to the idle one.
    expect(sessionByOffsetIn(ws, displayed, 1)).toBe(si.id)
    // Cmd-1 resolves to the working session, not the manual-order first.
    expect(sessionByIndexIn(displayed, 1)).toBe(sw.id)
  })
})

describe('runningSessionCount', () => {
  it('counts working and needs-input sessions for a project, ignoring idle and exited', () => {
    const { p } = seed()
    let ws = addProject(createDefaultWorkspace(), p)
    const s1 = createSession(p.id, 'claude', p.path, 'claude', 'pty_1')
    const s2 = createSession(p.id, 'claude', p.path, 'claude 2', 'pty_2')
    const s3 = createSession(p.id, 'shell', p.path, 'shell', 'pty_3')
    ws = addSession(addSession(addSession(ws, s1), s2), s3)
    ws = setSessionStatus(ws, s1.id, 'working')
    ws = setSessionStatus(ws, s2.id, 'needs-input')
    ws = setSessionStatus(ws, s3.id, 'idle')
    expect(runningSessionCount(ws, p.id)).toBe(2)
  })
})
