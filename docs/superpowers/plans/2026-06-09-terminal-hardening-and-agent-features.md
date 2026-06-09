# Bunyan Hardening + Agent-Workflow Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Session overrides (from the user's global rules):** NO git commits, NO worktrees. Work directly in the working tree on `main`. "Done" per task = `npm run typecheck` zero errors + `npm run lint` clean + `npm test` green. Never use em dashes in any user-facing string. No Oxford comma in UI copy.

**Goal:** Fix all verified bugs (one critical, one high, several medium) and ship seven agent-workflow features that make Bunyan a genuinely better terminal for babysitting multiple Claude Code / Codex sessions.

**Architecture:** Bunyan is Electron 33 (main/preload/renderer) + React 19 + zustand + xterm.js 5.5 + node-pty. All cross-process traffic flows through typed channels in `src/shared/ipc.ts`, validated in `src/main/ipc-validate.ts`, registered in `src/main/ipc.ts`, bridged in `src/preload/index.ts`. Pure logic lives in `src/shared/*` with vitest coverage. PTY output deliberately bypasses React state (xterm writes directly).

**Tech stack:** TypeScript strict, vitest (`npm test`), eslint flat config (`npm run lint`), `npm run typecheck` (two tsconfigs: node + web).

**Execution order:** Tasks are SEQUENTIAL (1 → 5). They share hot files (`shared/types.ts`, `shared/ipc.ts`, `TerminalPane.tsx`, `App.tsx`, `store.ts`, `SettingsPanel.tsx`); do not parallelize.

**Settings migration rule (applies to every task that adds a Settings field):** stored workspaces predate new fields. `hydrate()` in `src/renderer/state/store.ts` must merge `settings: { ...DEFAULT_SETTINGS, ...loaded.settings }` so missing keys get defaults. The first task to add a setting (Task 3) implements this merge; later tasks rely on it.

---

### Task 1: Backend correctness - flow control, login shell, PTY guards, monitor cleanup

**Why:** Verified critical bug: `pty.onData` → `sender.send` → `term.write` has zero backpressure (`PtyManager.ts:55`, `main/ipc.ts:94`); `yes` or `cat big-file` floods IPC and freezes/OOMs the renderer. node-pty v1 has `pause()`/`resume()`. Verified high bug: shell spawns as `spawn(shell, [], ...)` - not a login shell - so a packaged app launched from Finder gets launchd's minimal PATH and `claude`/Homebrew tools are not found. Verified medium bugs: duplicate `session:create` for an existing ptyId silently orphans the old PTY (`PtyManager.create` has no `has()` guard); SessionMonitor never deletes pane state when a process exits on its own (only on explicit `session:kill`), leaking `panes`/`sessionStatus`/`sessionLabel` entries.

**Files:**
- Create: `src/main/pty/flow-gate.ts`, `src/main/pty/flow-gate.test.ts`
- Modify: `src/main/pty/PtyManager.ts`, `src/main/ipc.ts`, `src/main/ipc-validate.ts`, `src/main/ipc-validate.test.ts`, `src/main/monitor/SessionMonitor.ts`, `src/main/monitor/SessionMonitor.test.ts`, `src/shared/ipc.ts`, `src/preload/index.ts`, `src/renderer/terminal/TerminalPane.tsx`

**1a. Flow control (renderer-ack watermark scheme, the VS Code pattern):**

- [ ] Write `src/main/pty/flow-gate.test.ts` first. FlowGate is a pure accounting class so the watermark logic is unit-testable without PTYs:

```ts
import { describe, expect, it } from 'vitest'
import { FlowGate } from './flow-gate'

describe('FlowGate', () => {
  it('stays open under the high watermark', () => {
    const g = new FlowGate(100, 25)
    expect(g.add(99)).toBe(null)
  })
  it('asks to pause when outstanding crosses the high watermark', () => {
    const g = new FlowGate(100, 25)
    expect(g.add(60)).toBe(null)
    expect(g.add(60)).toBe('pause')
    expect(g.add(10)).toBe(null) // already paused, no repeat signal
  })
  it('asks to resume only when acks drop outstanding below the low watermark', () => {
    const g = new FlowGate(100, 25)
    g.add(120)
    expect(g.ack(50)).toBe(null) // 70 still >= low
    expect(g.ack(50)).toBe('resume') // 20 < low
    expect(g.ack(50)).toBe(null) // clamped at 0, no repeat
  })
  it('reset clears outstanding and paused state', () => {
    const g = new FlowGate(100, 25)
    g.add(120)
    g.reset()
    expect(g.add(99)).toBe(null)
  })
})
```

- [ ] Implement `src/main/pty/flow-gate.ts`: class with `constructor(highWater: number, lowWater: number)`, `add(units: number): 'pause' | null`, `ack(units: number): 'resume' | null` (clamp outstanding at 0), `reset(): void`. Signals fire exactly once per crossing.
- [ ] `src/shared/ipc.ts`: add channel `sessionAck: 'session:ack'`, payload `export interface SessionAckRequest { paneId: string; chars: number }`, and `ack(req: SessionAckRequest): void` on `BunyanApi['session']`. Units are JS string `.length` (UTF-16 code units) - the SAME string crosses the bridge, so both sides agree.
- [ ] `src/preload/index.ts`: `ack: (req) => ipcRenderer.send(IPC.sessionAck, req)`.
- [ ] `src/main/ipc-validate.ts` + test: `validateAck(raw)` - object with `paneId` string 1..128 chars, `chars` finite integer 1..16_000_000. Follow the existing validator style exactly.
- [ ] `src/main/pty/PtyManager.ts`: per-pty `FlowGate` (high 1_000_000, low 250_000 chars; module constants with a one-line comment on why). In `onData`, after calling hooks, `if (gate.add(data.length) === 'pause') pty.pause()`. New method `ack(ptyId, chars)`: `if (gate.ack(chars) === 'resume') pty.resume()`. Drop gate state in `kill`, `killAll` and the `onExit` cleanup.
- [ ] `src/main/ipc.ts`: register `ipcMain.on(IPC.sessionAck, ...)` → validate → `ptyManager.ack(...)`, silently dropping invalid payloads like the other one-way channels.
- [ ] `src/renderer/terminal/TerminalPane.tsx`: in the `session:data` handler, replace `term.write(e.data)` with `term.write(e.data, () => window.bunyan.session.ack({ paneId: pane.ptyId, chars: e.data.length }))` and track a local `pendingChars` counter (increment on receive, decrement in the callback). In the effect cleanup, if `pendingChars > 0`, send one final ack for the remainder so a pane unmounting mid-flood (split restructure) cannot leave the PTY paused forever. NOTE: the ack key is the ptyId (it is what main tracks); the event field is named `paneId` across the existing protocol and equals the ptyId - keep that convention.
- [ ] Run `npm test` - flow-gate and validator tests pass.

**1b. Login shell:**

- [ ] In `PtyManager.create`, compute spawn args: on `process.platform !== 'win32'`, when `path.basename(shell)` is `zsh`, `bash`, `fish` or `sh`, use `['-l']`, else `[]`. Replace the misleading comment at lines 15-17 (it claims a login shell is spawned; after this change it is true).
- [ ] Manual check note for the reviewer: `npm run dev`, open a shell session, run `echo $PATH` - should include Homebrew paths even though dev mode already inherits them; the real proof is `zsh -l` sources `~/.zprofile`.

**1c. Duplicate-create guard:**

- [ ] In `PtyManager.create`, first line: if `this.ptys.has(opts.ptyId)`, call `this.kill(opts.ptyId)` before spawning, with a comment: a renderer reload can lose its created-set while main still holds live PTYs; replacing is the recoverable choice.

**1d. Monitor cleanup on self-exit:**

- [ ] Add a failing test to `SessionMonitor.test.ts`: register a session, feed data, simulate `onExit` for its pane, then assert the monitor's pane map no longer contains the pane and a later `recompute`/aggregate does not include it (inspect via existing test seams; if none exist, add a minimal `paneCount(): number` accessor used only by tests).
- [ ] Fix `SessionMonitor.onExit`: after applying the exit transition and emitting the status change, delete the pane entry. When a session has no remaining panes, delete its `sessionStatus`/`sessionLabel` entries too (same cleanup `remove()` should do - factor one private `dropPane(ptyId)` used by both).
- [ ] Run `npm test` - monitor tests green.

**1e. cwd existence check:**

- [ ] In the `session:create` handler in `src/main/ipc.ts` (NOT the pure validator), after validation: if `req.cwd` is non-empty and not an existing directory (`fs.statSync` try/catch), throw `new Error('Working directory no longer exists')`. The renderer already renders create-rejections as red error text in the pane (TerminalPane catch path) - fail loud, no silent homedir fallback.

**Task 1 acceptance:** `npm run typecheck` + `npm run lint` + `npm test` all clean. `yes` running in a pane keeps the UI responsive (main process memory stays flat); Ctrl-C stops it and output resumes instantly (pause/resume works both ways).

---

### Task 2: Renderer interaction bug fixes - search, keymap, resize guard, nested split ratio

**Why:** Verified bugs. (1) `SearchBar.tsx` clears decorations only in the `open === false` branch of its effect; switching the focused pane while search is open leaves gold match highlights painted on the old pane, and Enter then searches the NEW pane with the old query - inconsistent split-brain state. (2) The global keymap in `App.tsx` (`useKeymap`) has no editable-target guard: Cmd-T/Cmd-W/Cmd-1..9 fire while typing in the palette input, rename field or settings inputs, creating/closing sessions under the overlay. (3) `TerminalPane` forwards `term.cols/rows` to the PTY after `fit()` with no finite/positive guard. (4) Verified logic bug in `shared/pane-tree.ts:76`: `setRatio` identifies a split by the first leaf of its a-side, but a split nested on the a-side of another split shares that same first leaf, so the OUTER split always matches first and the inner divider becomes immovable.

**Files:**
- Modify: `src/renderer/search/SearchBar.tsx`, `src/renderer/app/App.tsx`, `src/renderer/terminal/TerminalPane.tsx`, `src/shared/pane-tree.ts`, `src/shared/pane-tree.test.ts`, `src/renderer/terminal/SessionView.tsx`, `src/renderer/state/store.ts`

**2a. SearchBar pane-switch reset:**

- [ ] Keep a `prevPaneRef` of the last decorated pane id. In the effect that reacts to `open`/`focusedPaneId`: when the focused pane changes while open, call `clearDecorations()` on the previous pane's search handle (via `getPaneHandles(prevPaneRef.current)`), then if `query` is non-empty re-run `findNext(query, { incremental: false })` against the new pane so highlights follow focus. On close, clear decorations on the current pane (existing behavior) AND the previous one. Update `prevPaneRef` at the end of the effect.

**2b. Keymap editable-target guard:**

- [ ] At the top of the `useKeymap` keydown handler in `App.tsx`, add: if the event target (or `document.activeElement`) is an `<input>`, `<textarea>` or `[contenteditable]`, return early UNLESS the combo is Cmd-K (palette must toggle from inside its own input). Implement as a small predicate `isEditableTarget(el: EventTarget | null): boolean` local to App.tsx. xterm's hidden textarea must NOT be treated as editable (terminal keystrokes go through xterm, not this handler, but Cmd shortcuts over a focused terminal MUST keep working): xterm's textarea has class `xterm-helper-textarea` - exclude it in the predicate.

**2c. Resize guard:**

- [ ] In `TerminalPane.tsx`, wherever `session.resize` is called (mount + ResizeObserver): only send when `Number.isFinite(term.cols) && Number.isFinite(term.rows) && term.cols > 0 && term.rows > 0`. In the ResizeObserver callback, skip `fit()` entirely when the host has zero width or height.

**2d. Path-addressed split ratio:**

- [ ] Write failing tests in `pane-tree.test.ts`:

```ts
import { setRatioAtPath } from './pane-tree'

it('setRatioAtPath targets a nested a-side split independently of its parent', () => {
  // root split S1: a = (split S2: a=leaf p1, b=leaf p2), b = leaf p3
  const p1 = makeLeaf(newPane('t1')); const p2 = makeLeaf(newPane('t2')); const p3 = makeLeaf(newPane('t3'))
  const s2: PaneNode = { type: 'split', dir: 'col', a: p1, b: p2, ratio: 0.5 }
  const root: PaneNode = { type: 'split', dir: 'row', a: s2, b: p3, ratio: 0.5 }
  const next = setRatioAtPath(root, ['a'], 0.3)
  expect(next.type === 'split' && next.a.type === 'split' && next.a.ratio).toBe(0.3)
  expect(next.type === 'split' && next.ratio).toBe(0.5) // parent untouched
  const next2 = setRatioAtPath(root, [], 0.7)
  expect(next2.type === 'split' && next2.ratio).toBe(0.7)
})
it('setRatioAtPath clamps to [0.1, 0.9] and ignores invalid paths', () => { /* path ['a'] into a leaf returns tree unchanged; ratio 0.05 -> 0.1 */ })
```

- [ ] Implement `setRatioAtPath(node: PaneNode, path: Array<'a' | 'b'>, ratio: number): PaneNode` in `pane-tree.ts` (recursive descent by path; empty path = this split; leaf or dead-end = return unchanged; reuse `clampRatio`). DELETE the old `setRatio` and its first-leaf matching.
- [ ] Update the one caller chain: `SessionView.tsx` already recurses the tree - thread a `path: Array<'a' | 'b'>` prop through the recursive render ( `[]` at root, `[...path, 'a']` / `[...path, 'b']` for children) and pass it to the divider's drag handler; `store.ts` action `setSplitRatio(sessionId, path, ratio)` calls `setRatioAtPath`. Update `pane-tree.test.ts` references to the removed `setRatio`.
- [ ] Run `npm test` - pane-tree tests green. Manual: split right pane twice, drag the INNER divider - it moves the inner split only.

**Task 2 acceptance:** typecheck + lint + tests clean. Search highlights follow pane focus; Cmd-T while renaming a project does nothing; inner dividers drag correctly.

---

### Task 3: Agent-aware signals - OSC 9/777 notifications, silence alerts, unread indicators

**Why:** Research-verified top pick. Bunyan's needs-input detection is regex-heuristic; OSC 9 (`ESC ] 9 ; msg BEL`) and OSC 777 (`ESC ] 777 ; notify ; title ; body BEL`) let agents/hooks author their own notifications with zero false positives (iTerm2, Ghostty, Kitty, WezTerm all support this; Claude Code hooks can emit it with a one-line printf). A silently-stalled agent is the other defining failure mode: a configurable "working but silent for N seconds" alert catches it. Unread dots tell you at a glance which background session produced output since you last looked.

**Files:**
- Modify: `src/main/monitor/detectors.ts`, `src/main/monitor/detectors.test.ts`, `src/main/monitor/types.ts`, `src/main/monitor/SessionMonitor.ts`, `src/main/monitor/SessionMonitor.test.ts`, `src/shared/ipc.ts` (NotifyPrefs), `src/shared/types.ts` (Settings), `src/renderer/state/store.ts`, `src/renderer/app/App.tsx`, `src/renderer/rail/SessionRow.tsx`, `src/renderer/settings/SettingsPanel.tsx`

**3a. OSC 9 / 777 detection (main process, where chunks already flow):**

- [ ] Failing tests in `detectors.test.ts`:

```ts
it('extracts an OSC 9 notification message', () => {
  const s = analyzeChunk('\x1b]9;Claude needs your approval\x07')
  expect(s.oscNotification).toEqual({ title: null, body: 'Claude needs your approval' })
})
it('extracts OSC 777 notify with title and body, ST terminator', () => {
  const s = analyzeChunk('\x1b]777;notify;Build done;3 tests failed\x1b\\')
  expect(s.oscNotification).toEqual({ title: 'Build done', body: '3 tests failed' })
})
it('ignores other OSC 777 subcommands and caps message length', () => { /* '\x1b]777;other;x\x07' -> undefined; body truncated to 200 chars */ })
```

- [ ] Implement in `analyzeChunk`: regex for `\x1b\]9;([^\x07\x1b]{0,200})(?:\x07|\x1b\\)` and `\x1b\]777;notify;([^;\x07\x1b]{0,100});([^\x07\x1b]{0,200})(?:\x07|\x1b\\)`; add `oscNotification?: { title: string | null; body: string }` to `ChunkSignals` in `monitor/types.ts`.
- [ ] `SessionMonitor.onData`: when `oscNotification` present and the session is not focused, apply the same state event as `claude-confirm` (raise `needs-input`) and fire `MacNotifier.notify` with title `oscNotification.title ?? sessionLabel` and the body verbatim. Respect the existing notifications-enabled pref. Add a SessionMonitor test.

**3b. Silence alert for working sessions:**

- [ ] `Settings` gains `silenceAlertSeconds: number` (0 = off; DEFAULT 0). `NotifyPrefs` (shared/ipc.ts) gains `silenceAlertSeconds: number`; App.tsx already pushes NotifyPrefs on settings change - include the new field.
- [ ] `SessionMonitor`: per-pane silence timer armed whenever pane status is `working` and `silenceAlertSeconds > 0`; reset on every data chunk; on fire, if the pane is still `working`, notify once (`"<label>" has been quiet for <N>s`) and set a per-pane `silenceNotified` flag cleared on the next data chunk. Use the injectable clock/timer seam the monitor already uses for its quiet timer (it has one for tests; reuse the same pattern). Vitest fake-timer test: working pane, no data for N seconds → exactly one notification; data arrives → flag resets.
- [ ] `SettingsPanel.tsx`: new row "Silence alert" - a number input (seconds, 0 disables) with caption "Notify when a working session goes quiet". UI copy: no em dashes, no Oxford comma.
- [ ] Implement the settings-merge rule in `hydrate()` (`store.ts`): `settings: { ...DEFAULT_SETTINGS, ...loaded.settings }`.

**3c. Unread output indicators:**

- [ ] `store.ts`: transient (non-persisted) `unread: Record<string, true>` keyed by sessionId, actions `markUnread(sessionId)` / `clearUnread(sessionId)`. `setActiveSession`-equivalent action clears unread for the newly active session.
- [ ] `App.tsx`: one global `window.bunyan.session.onData` subscription (alongside the existing onStatus/onExit ones). Build a memoized `ptyId → sessionId` map from `workspace.sessions` (via `listPanes` on each layout). On data for a session that is not active: `if (!unread[sessionId]) markUnread(sessionId)` - the guard keeps store writes O(1) per burst, not per chunk.
- [ ] `SessionRow.tsx`: when `unread[session.id]` and the row is not active, render a small dot (`•`) in the row's accent color after the title, replaced by the existing "needs you" badge when that is shown (needs-input outranks unread).

**Task 3 acceptance:** typecheck + lint + tests clean. `printf '\e]9;hello from agent\a'` in an UNFOCUSED session raises a macOS notification titled with the project label and flips its dot to needs-input; with silence alert 5s, a `sleep 30` inside a working Claude session triggers exactly one "quiet" notification; background `echo hi` shows an unread dot that clears on focus.

---

### Task 4: Rail intelligence - auto-sort projects by activity + live-session identification (DIRECT USER REQUEST)

**Why:** The user asked for exactly this: "Projects which have a session that's running should be brought to the top automatically." Some projects have live running sessions, some have only dead/no sessions; the rail should make that distinction obvious and order itself by it.

**Files:**
- Modify: `src/shared/workspace.ts`, `src/shared/workspace.test.ts`, `src/shared/types.ts` (Settings), `src/renderer/rail/Rail.tsx`, `src/renderer/rail/ProjectRow.tsx`, `src/renderer/settings/SettingsPanel.tsx`

**Design:** activity tiers, stable within tier (manual drag order preserved as the secondary key):
- Tier 0: any session `needs-input` or `working` (agent running right now)
- Tier 1: any session `idle` (live shell at a prompt)
- Tier 2: has sessions, all `exited`
- Tier 3: no sessions

- [ ] Failing tests in `workspace.test.ts`:

```ts
describe('orderProjectsByActivity', () => {
  it('puts projects with working or needs-input sessions first, preserving manual order within tiers', () => {
    // manual order: A(idle), B(working), C(no sessions), D(needs-input), E(exited)
    // expected: B, D (tier 0, manual order), A (tier 1), E (tier 2), C (tier 3)
  })
  it('returns the manual order untouched when all projects share a tier', () => { /* stability */ })
})
```

- [ ] Implement `orderProjectsByActivity(ws: Workspace): Project[]` in `workspace.ts` using `projectStatus` (already exists; note `projectStatus` returns the MOST URGENT session status, and `null` for no sessions - map needs-input/working → 0, idle → 1, exited → 2, null → 3). Stable sort: decorate with original index, sort by `[tier, index]`.
- [ ] `Settings` gains `autoSortProjects: boolean`, DEFAULT `true`. SettingsPanel row: "Auto-sort projects" with caption "Bring projects with running sessions to the top".
- [ ] `Rail.tsx`: when the setting is on, render `orderProjectsByActivity(ws)` instead of `ws.projects`. Manual drag-reorder still mutates the underlying `ws.projects` order (it remains the within-tier tiebreaker; that is the documented behavior).
- [ ] Keyboard order must match what the eye sees: `orderedSessionIds(ws)` currently flat-maps `ws.projects` - change it to take the displayed project order: `orderedSessionIds(ws, displayProjects?: Project[])` or simpler, add `orderedSessionIdsFor(projects: Project[]): string[]` and have App.tsx pass the same ordered list it renders, so Cmd-1..9 and Cmd-[/Cmd-] follow the rail. Add a test pinning this.
- [ ] `ProjectRow.tsx` live identification: next to the name, when the project has running sessions (tier 0), show a count chip `N live` in the project accent color with the existing StatusDot glow; the existing collapsed-state dot behavior stays. Keep it subtle (text-[10px], same styling family as the "needs you" badge).

**Task 4 acceptance:** typecheck + lint + tests clean. Start a Claude session in the bottom project: it jumps to the top of the rail within a second of going `working`; quitting it drops the project back down; toggle off in settings restores pure manual order.

---

### Task 5: Terminal power features - file:line links, paste guard, option-as-meta, snippets, broadcast input

**Why:** Top value-for-effort picks from the terminal research for the multi-agent niche. Claude Code output is dense with `path/to/file.ts:42` references (one click should open the editor); raw multiline paste into a non-bracketed-paste shell executes line-by-line (guard it); Option-as-meta is table stakes on macOS (readline word-jump in every CLI); saved prompts/snippets remove retyping; broadcast sends one instruction to several agents at once - the defining multi-agent feature.

**Files:**
- Create: `src/renderer/terminal/file-links.ts`, `src/renderer/terminal/file-links.test.ts`, `src/renderer/terminal/PasteGuard.tsx`
- Modify: `src/renderer/terminal/TerminalPane.tsx`, `src/renderer/terminal/SessionView.tsx`, `src/shared/types.ts` (Settings), `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/ipc.ts`, `src/main/ipc-validate.ts`, `src/main/ipc-validate.test.ts`, `src/renderer/palette/CommandPalette.tsx`, `src/renderer/settings/SettingsPanel.tsx`, `src/renderer/state/store.ts`, `src/renderer/app/App.tsx`

**5a. Clickable file:line → editor:**

- [ ] Failing tests in `file-links.test.ts` for the pure scanner `findFileRefs(line: string): Array<{ text: string; path: string; line?: number; col?: number; start: number; end: number }>`:

```ts
it('finds relative path with line and col', () => {
  expect(findFileRefs('error at src/app/App.tsx:142:7 in build')[0]).toMatchObject({ path: 'src/app/App.tsx', line: 142, col: 7 })
})
it('finds absolute and ~ paths and bare paths without line numbers', () => { /* /Users/x/a.ts:3, ~/proj/b.py, src/c.go (no :line -> line undefined, still a ref when it has an extension and a slash) */ })
it('rejects URLs and version-ish tokens', () => { /* https://x.com/a.ts:1 not matched (preceded by ://...), node:18.2.0 not matched */ })
```

- [ ] Implement `file-links.ts` with a conservative regex (requires a `/` or `~/` or leading `./` in the path OR a known source extension, max 512 chars, captures optional `:line(:col)`).
- [ ] `Settings` gains `editor: 'vscode' | 'cursor' | 'zed' | 'windsurf'`, DEFAULT `'vscode'`. SettingsPanel: select row "Open files in".
- [ ] New invoke channel `app:openInEditor` in `shared/ipc.ts` (`OpenInEditorRequest { path: string; line?: number; col?: number; editor: string }`), preload bridge method `app.openInEditor(req)`, validator (path: string 1..4096, no NUL; line/col optional positive ints; editor in the 4-value whitelist) + validator tests, handler in `main/ipc.ts`: build the URI `{scheme}://file{encodeURI(absPath)}` + (`:line` + optional `:col`) where scheme maps vscode→`vscode`, cursor→`cursor`, zed→`zed`, windsurf→`windsurf`, then `shell.openExternal(uri)`. Reject relative paths in main (defense in depth).
- [ ] `TerminalPane.tsx`: `term.registerLinkProvider` that, for the requested line, runs `findFileRefs` on the translated buffer line text and yields links; on activate, resolve relative paths against the session `cwd` (thread `cwd` down: `SessionView` knows the session - pass `cwd` as a prop to `TerminalPane`) and call `window.bunyan.app.openInEditor`. Dispose the provider registration in the effect cleanup. Cmd-click semantics are xterm's default link activation - keep defaults.

**5b. Multiline paste guard:**

- [ ] `Settings` gains `pasteWarning: boolean`, DEFAULT `true`. SettingsPanel toggle "Confirm multiline paste".
- [ ] `PasteGuard.tsx`: a small modal (same overlay styling family as CommandPalette) showing "Paste N lines into this terminal?", a 6-line preview (monospace, truncated), buttons Paste and Cancel. Keyboard: Enter pastes, Escape cancels. Plain component taking `{ text, onPaste, onCancel }`.
- [ ] `TerminalPane.tsx`: attach a `paste` listener (capture phase) on `term.textarea` after `term.open`. If `pasteWarning` is on AND the clipboard text contains `\n` or `\r` AND `term.modes.bracketedPasteMode === false` (bracketed paste makes multiline safe - Claude Code and modern zsh enable it, so this guard only fires where it is dangerous): `preventDefault()`, `stopImmediatePropagation()`, and show PasteGuard via local state; on confirm `term.paste(text)`. Remove the listener in cleanup.

**5c. Option-as-meta:**

- [ ] `Settings` gains `optionAsMeta: boolean`, DEFAULT `true`. Pass `macOptionIsMeta: settings.optionAsMeta` in the `Terminal` constructor options and update it in the existing live-options effect in `TerminalPane.tsx`. SettingsPanel toggle "Option key sends Meta" with caption "Enables Option+arrow and readline word shortcuts".

**5d. Snippets (saved prompts) in the command palette:**

- [ ] `Settings` gains `snippets: Array<{ id: string; name: string; text: string }>`, DEFAULT `[]`.
- [ ] `SettingsPanel.tsx`: "Snippets" section - list of existing snippets (name + first 40 chars of text, delete button) and an add form (name input, text textarea, Add button). Use `makeId('snip')`.
- [ ] `CommandPalette.tsx`: a "Snippets" group rendered after actions, fuzzy-filtered by name like everything else; selecting one closes the palette and pastes `text` into the focused pane's terminal via `getPaneHandles(focusedPaneId)?.term.paste(text)` (paste, not write: bracketed paste protects agents).

**5e. Broadcast input to project sessions:**

- [ ] `store.ts`: transient `ui.broadcastSessionIds: string[] | null` (null = off) + actions `startBroadcast()` / `stopBroadcast()`. `startBroadcast` collects all sessions of the ACTIVE project whose status is not `exited`; if fewer than 2, it is a no-op (broadcasting to yourself is noise).
- [ ] `App.tsx`: Cmd-Shift-B toggles broadcast; palette action "Broadcast input to project sessions" / "Stop broadcasting". While active, render a slim banner over the session area: "Broadcasting to N sessions. Click to stop" (button). UI copy rules apply.
- [ ] `TerminalPane.tsx`: in the existing `term.onData` keystroke handler, after the normal `session.write`, read `useStore.getState()` (no subscription - keystroke path must not rerender) and, if broadcast is active AND this pane's session is in the set, write the same data to the FIRST pane ptyId of each OTHER session in the set (first leaf via `listPanes(layout)[0]`; skip sessions whose first pty is this one). `TerminalPane` needs its `sessionId` - pass as a prop from `SessionView` alongside `cwd` (5a).
- [ ] Visual: panes belonging to broadcast sessions get an amber ring (`ring-1 ring-gold/60`) so it is impossible to broadcast by accident without seeing it. Broadcast state auto-clears when the active project changes or a member session closes (guard inside the store actions).

**Task 5 acceptance:** typecheck + lint + tests clean. Clicking `src/main/ipc.ts:42` in build output opens VS Code at that line; pasting 3 lines into plain `dash` (no bracketed paste) shows the guard while pasting into Claude Code does not; Option+Left jumps words in zsh; a saved snippet pastes from the palette; with two Claude sessions in a project, Cmd-Shift-B + typing reaches both.

---

### Final verification (controller, after all tasks)

- [ ] `npm run typecheck` - zero errors (both tsconfigs)
- [ ] `npm run lint` - zero warnings
- [ ] `npm test` - full suite green
- [ ] `npm run build` - production build succeeds
- [ ] Dispatch a final whole-diff code reviewer; fix anything real it finds
- [ ] Report to the user; the USER decides about shipping (the `ship` skill handles push + local app rebuild when they say go)
