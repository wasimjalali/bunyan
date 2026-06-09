import { useEffect, useMemo, useRef, useState } from 'react'
import type { SessionStatus, Workspace } from '@shared/types'
import { fuzzyFilter } from '@shared/fuzzy'
import { activeOrFirstProjectId, projectSessions } from '@shared/workspace'
import { useStore } from '../state/store'
import { getPaneHandles } from '../terminal/registry'
import { StatusDot } from '../rail/StatusDot'

interface Command {
  id: string
  title: string
  subtitle?: string
  hint?: string
  status?: SessionStatus | null
  /** A small tag shown on the right, e.g. "snippet". */
  tag?: string
  /** The owning project's chip colour, shown as a small glossy dot. */
  color?: string
  run: () => void
}

export function CommandPalette(): React.JSX.Element | null {
  const open = useStore((s) => s.ui.paletteOpen)
  const workspace = useStore((s) => s.workspace)
  const setPalette = useStore((s) => s.setPalette)
  const focusSession = useStore((s) => s.focusSession)
  const newSession = useStore((s) => s.newSession)
  const splitActivePane = useStore((s) => s.splitActivePane)
  const openProject = useStore((s) => s.openProject)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const updateSettings = useStore((s) => s.updateSettings)
  const startBroadcast = useStore((s) => s.startBroadcast)
  const stopBroadcast = useStore((s) => s.stopBroadcast)
  const broadcasting = useStore((s) => s.ui.broadcastSessionIds !== null)

  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const commands = useMemo(
    () =>
      buildCommands(workspace, {
        focusSession,
        newSession,
        splitActivePane,
        openProject: () => void openProject(),
        openSettings: () => setSettingsOpen(true),
        // Flip the theme that's actually showing. data-theme holds the resolved
        // mode (even when the choice is "system"), so this is never a no-op.
        toggleTheme: () =>
          updateSettings({
            theme: document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light',
          }),
        startBroadcast,
        stopBroadcast,
        broadcasting,
        pasteSnippet,
        close: () => setPalette(false),
      }),
    [
      workspace,
      focusSession,
      newSession,
      splitActivePane,
      openProject,
      setSettingsOpen,
      updateSettings,
      startBroadcast,
      stopBroadcast,
      broadcasting,
      setPalette,
    ],
  )

  const results = useMemo(
    () => fuzzyFilter(query, commands, (c) => `${c.title} ${c.subtitle ?? ''}`),
    [query, commands],
  )

  // Reset when opening; focus the input.
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelected(0)
      inputRef.current?.focus()
    }
  }, [open])

  useEffect(() => setSelected(0), [query])

  if (!open) return null

  const run = (cmd: Command | undefined): void => {
    if (!cmd) return
    setPalette(false)
    cmd.run()
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setPalette(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((i) => (results.length > 0 ? Math.min(results.length - 1, i + 1) : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      run(results[selected])
    }
  }

  return (
    <div
      className="overlay-backdrop fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[12vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) setPalette(false)
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div className="overlay-panel w-[560px] max-w-[90vw] overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search projects, sessions and actions"
          className="w-full border-b border-line bg-transparent px-4 py-3 text-sm text-ink outline-none placeholder:text-ink-dim"
        />
        <ul className="max-h-80 overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-ink-dim">No matches</li>
          ) : (
            results.map((cmd, i) => (
              <li key={cmd.id}>
                <button
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => run(cmd)}
                  className={[
                    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm',
                    i === selected ? 'bg-gold/15 text-ink' : 'text-ink-dim hover:bg-line/60',
                  ].join(' ')}
                >
                  {cmd.color && (
                    <span
                      className="chip-gloss h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: cmd.color }}
                    />
                  )}
                  {cmd.status !== undefined && <StatusDot status={cmd.status} />}
                  <span className="flex-1 truncate text-ink">{cmd.title}</span>
                  {cmd.subtitle && <span className="truncate text-xs text-ink-dim">{cmd.subtitle}</span>}
                  {cmd.tag && (
                    <span className="ml-1 rounded bg-gold/20 px-1.5 py-0.5 text-[10px] text-gold">
                      {cmd.tag}
                    </span>
                  )}
                  {cmd.hint && (
                    <span className="ml-1 rounded bg-line px-1.5 py-0.5 text-[10px] text-ink-dim">
                      {cmd.hint}
                    </span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}

interface CommandDeps {
  focusSession: (id: string) => void
  newSession: (projectId: string, kind: 'claude' | 'shell') => void
  splitActivePane: (dir: 'row' | 'col') => void
  openProject: () => void
  openSettings: () => void
  toggleTheme: () => void
  startBroadcast: () => void
  stopBroadcast: () => void
  broadcasting: boolean
  pasteSnippet: (text: string) => void
  close: () => void
}

// Paste a snippet into the focused pane's terminal. paste() (not write) so
// bracketed paste protects agents like Claude Code from running it as commands.
function pasteSnippet(text: string): void {
  const { focusedPaneId } = useStore.getState()
  if (!focusedPaneId) return
  const handles = getPaneHandles(focusedPaneId)
  if (!handles) return
  handles.term.paste(text)
  handles.term.focus()
}

function buildCommands(ws: Workspace, deps: CommandDeps): Command[] {
  const commands: Command[] = []
  const targetProject = activeOrFirstProjectId(ws)

  if (targetProject) {
    commands.push({
      id: 'act:new-claude',
      title: 'New Claude session',
      hint: '⌘T',
      run: () => deps.newSession(targetProject, 'claude'),
    })
    commands.push({
      id: 'act:new-shell',
      title: 'New shell',
      hint: '⌘⇧T',
      run: () => deps.newSession(targetProject, 'shell'),
    })
    commands.push({ id: 'act:split-v', title: 'Split vertical', hint: '⌘D', run: () => deps.splitActivePane('row') })
    commands.push({
      id: 'act:split-h',
      title: 'Split horizontal',
      hint: '⌘⇧D',
      run: () => deps.splitActivePane('col'),
    })
  }
  commands.push({ id: 'act:open', title: 'Open project', hint: '⌘O', run: deps.openProject })
  commands.push({ id: 'act:theme', title: 'Toggle theme', run: deps.toggleTheme })
  commands.push({ id: 'act:settings', title: 'Settings', hint: '⌘,', run: deps.openSettings })
  commands.push(
    deps.broadcasting
      ? { id: 'act:broadcast-stop', title: 'Stop broadcasting', run: deps.stopBroadcast }
      : {
          id: 'act:broadcast',
          title: 'Broadcast input to project sessions',
          hint: '⌘⇧B',
          run: deps.startBroadcast,
        },
  )

  // Snippets: fire a saved prompt into the focused pane.
  for (const snippet of ws.settings.snippets) {
    commands.push({
      id: `snip:${snippet.id}`,
      title: snippet.name,
      tag: 'snippet',
      run: () => deps.pasteSnippet(snippet.text),
    })
  }

  // Sessions, grouped under their project.
  for (const project of ws.projects) {
    for (const session of projectSessions(ws, project.id)) {
      commands.push({
        id: `ses:${session.id}`,
        title: session.title,
        subtitle: project.name,
        status: session.status,
        color: project.color,
        run: () => deps.focusSession(session.id),
      })
    }
  }
  return commands
}
