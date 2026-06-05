# Bunyan, v1 Specification

- **Product:** Bunyan, a premium macOS terminal for managing projects and Claude Code sessions
- **Date:** 2026-06-05
- **Author:** Wasim Jalali
- **Status:** Approved for planning
- **Platform (v1):** macOS (Apple Silicon + Intel)
- **License (intended):** MIT, open source

---

## 1. Summary

Bunyan is a desktop terminal built around one idea: when you run several projects at once, often with a Claude Code session in each, you should see all of them, and their state, in one calm place. The differentiator is not the terminal engine (that is a solved problem we reuse). It is the right-hand rail that holds every project and session, and a session monitor that tells you which Claude is working, which one needs you, and which is idle, without you hunting through windows.

The name Bunyan (بُنيان) means a solid, firmly built structure. The product is a sturdy home that holds your work together.

---

## 2. Goals and non-goals

### Goals
1. A genuinely clean, premium UI that a non-technical person finds calm and a power user finds fast.
2. A right rail that lists projects, each expanding to its sessions, with live status at a glance.
3. First-class awareness of Claude Code session state, surfaced as status, notifications, and a dock badge.
4. Daily-driver terminal quality: fast rendering, correct reflow, search, copy/paste, links.
5. Restore the full workspace on reopen.

### Non-goals (v1)
- Windows and Linux support.
- SSH or remote sessions.
- Multiple app windows.
- A theme marketplace, plugin system, or settings sync.
- Reimplementing a terminal engine. We stand on xterm.js.

---

## 3. Target users

- **Primary:** the builder running 2 to 4 projects at once, several with Claude Code, who loses track of which session needs attention. (This is the founding use case.)
- **Secondary:** developers who want a cleaner, calmer terminal than the default, with project organisation built in.
- **Tertiary:** non-technical users (founders, designers) who need to run a few commands or a local dev server and want it to feel approachable.

---

## 4. Product principles

1. **The rail is the product.** Everything else serves it. If a feature does not make the rail clearer or faster, it waits.
2. **Calm over dense.** Whitespace, few colours, one accent. No blinking, no clutter.
3. **Reuse the hard parts.** xterm.js for the engine, node-pty for the pipe, Electron for the shell. Spend effort only on what is ours.
4. **Honest status.** Status detection is heuristic. We make the reliable signals primary and degrade gracefully, never pretending to know more than we do.
5. **Voice.** All user-facing copy follows the house rules in section 14.

---

## 5. Brand and identity

### Name
Bunyan (بُنيان), "a solid, firmly built structure," echoing the Quranic image of *bunyanun marsoos* (As-Saff 61:4), a firmly bonded structure.

### Logo
A pointed arch (classic Islamic architecture) drawn as two nested gold strokes with a gold light at its centre, set on a deep-navy rounded-square app tile. Wordmark: "Bunyan" in Georgia, semibold. On dark surfaces the wordmark is cream with the central letter accented gold; on light surfaces it is navy. Final icon art and the macOS `.icns` set (16 to 1024 px) are produced during the polish phase. Source SVGs live in `build/icon/`.

### Palette (brand)
| Token | Hex | Role |
|-------|-----|------|
| Navy | `#1E3A5F` | Primary brand, surface highlights |
| Deep navy | `#0C1929` | App canvas (dark theme) |
| Navy surface | `#16304D` | Raised surfaces, active rows |
| Navy line | `#20344F` | Borders, dividers |
| Cream | `#FAF7F2` | Light-theme canvas |
| Cream surface | `#FEFDFB` | Light-theme cards, primary dark-theme text |
| Gold | `#D4A853` | The single accent: cursor, active state, focus |
| Gold deep | `#C4932E` | Hover/pressed accent |
| Gold soft | `#E0C687` | Subtle accent, bright-yellow ANSI |
| Charcoal | `#2D3748` | Light-theme text |
| Muted | `#6E8AAE` | Secondary text on dark |

**Sage is removed entirely.** It is not used anywhere in brand UI.

### Status colours (functional, derived from brand)
| State | Treatment |
|-------|-----------|
| Working | Gold `#D4A853` filled dot with a soft glow ring |
| Needs you | Gold hollow ring (`#D4A853` 2px border, transparent fill) |
| Idle | Muted `#33486A` filled dot |
| Exited | Muted dot, dimmed row |
| Error (toast/inline only) | `#ED6A5E` (functional red, not a brand colour) |

### Typography
- **UI headings and the wordmark:** Georgia, semibold (anchoring elements only: window title, panel headers, empty-state titles).
- **UI body, labels, buttons:** Inter.
- **Terminal:** a bundled monospace with good ligatures and broad glyph coverage. Default JetBrains Mono, with system SF Mono as the fallback. User-configurable.

### Terminal ANSI theme (dark)
Brand-tuned but legible. Green, red, magenta and cyan are functional terminal channels that programs control directly; they are not brand colours. The green is deliberately chosen to read as a neutral terminal green, distinct from the dropped sage token.

| Slot | Hex | Bright | Hex |
|------|-----|--------|-----|
| black | `#1B2A41` | bright black | `#3A4F6E` |
| red | `#ED6A5E` | bright red | `#F2897E` |
| green | `#79B488` | bright green | `#95C8A2` |
| yellow | `#D4A853` | bright yellow | `#E0C687` |
| blue | `#6E8AAE` | bright blue | `#93AECB` |
| magenta | `#B58AC2` | bright magenta | `#C9A6D4` |
| cyan | `#6FB6C9` | bright cyan | `#92CEDD` |
| white | `#CDD9E8` | bright white | `#FEFDFB` |

- background `#0C1929`, foreground `#CDD9E8`, cursor `#D4A853`, cursorAccent `#0C1929`, selectionBackground `rgba(212,168,83,0.25)`.

### Terminal ANSI theme (light)
Same hues, darkened for contrast on cream. background `#FAF7F2`, foreground `#2D3748`, cursor `#C4932E`, selectionBackground `rgba(196,147,46,0.22)`. Full table produced during the theming phase.

---

## 6. Tech stack and rationale

| Layer | Choice | Why |
|-------|--------|-----|
| App shell | Electron | The terminal stack (xterm.js + node-pty) is native to Node/Electron; identical Chromium rendering on every machine; the proven VS Code path. |
| Terminal engine + renderer | xterm.js + addons | Mature embeddable engine; handles escape sequences, grid, reflow, GPU rendering. |
| PTY | node-pty | Standard Node binding to the OS pseudo-terminal. |
| UI | React + TypeScript | Fastest route to a polished, maintainable UI; matches the author's stack. |
| Styling | Tailwind CSS v4 | Token-driven, matches the author's existing workflow. |
| State | Zustand | Small, ergonomic, already used in Karko. |
| Persistence | electron-store | Simple JSON store in the app's user-data dir. |
| Build/dev | electron-vite | Fast HMR for the renderer, clean main/preload/renderer separation. |
| Packaging | electron-builder | Produces signed, notarised dmg/zip; universal binary. |

**xterm.js addons:** `@xterm/addon-fit` (size to container), `@xterm/addon-webgl` (GPU renderer, with canvas fallback), `@xterm/addon-search` (Cmd-F), `@xterm/addon-web-links` (clickable URLs), `@xterm/addon-unicode11` (correct width for emoji/CJK).

---

## 7. Architecture

### 7.1 Process model
Two processes with a single, locked-down boundary.

**Main process** owns everything native:
- Spawns and owns one PTY per pane (node-pty).
- Runs the session monitor (status detection).
- Sends notifications and sets the dock badge.
- Owns the persistence store and window lifecycle.
- Handles the folder-open dialog.

**Renderer process** is the React UI only:
- The rail, the terminal panes (xterm.js instances), the command palette, settings.
- Holds no Node access. It talks to the main process exclusively through the preload bridge.

**Preload** exposes a single typed API object, `window.bunyan`, via `contextBridge`. No raw `ipcRenderer`, no `require`, in the renderer.

### 7.2 Security posture
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` for the renderer.
- `titleBarStyle: 'hiddenInset'` so we keep native traffic lights with a custom bar.
- A strict Content-Security-Policy on the renderer; no remote code load.
- Every IPC handler validates its payload (id exists, numbers in range, strings bounded) and returns generic errors. PTY data is treated as opaque bytes, never evaluated.
- node-pty and all process spawning live only in the main process.

### 7.3 IPC contract
All channels are typed in `src/shared/ipc.ts`. Request/response uses `ipcRenderer.invoke`; streaming uses `webContents.send`.

| Channel | Direction | Payload | Returns |
|---------|-----------|---------|---------|
| `session:create` | r to m | `{ sessionId, paneId, kind, cwd, shell?, cols, rows }` | `{ paneId }` |
| `session:write` | r to m | `{ paneId, data }` | void |
| `session:resize` | r to m | `{ paneId, cols, rows }` | void |
| `session:kill` | r to m | `{ paneId }` | void |
| `session:data` | m to r | `{ paneId, data }` | n/a (stream) |
| `session:status` | m to r | `{ sessionId, status, reason }` | n/a (stream) |
| `session:exit` | m to r | `{ paneId, code }` | n/a (stream) |
| `project:openDialog` | r to m | none | `{ path, name } \| null` |
| `project:gitBranch` | r to m | `{ path }` | `{ branch } \| null` |
| `store:load` | r to m | none | persisted workspace |
| `store:save` | r to m | `{ workspace }` | void |
| `app:focusRequest` | m to r | `{ sessionId }` | n/a (from notification click) |
| `app:setBadge` | internal (main) | count | void |

The renderer keeps the source of truth for layout and projects; the main process is authoritative for PTYs and status. They reconcile by id.

---

## 8. Data model

Defined in `src/shared/types.ts`.

```ts
type SessionKind = 'shell' | 'claude' | 'custom'
type SessionStatus = 'idle' | 'working' | 'needs-input' | 'exited'
type SplitDir = 'row' | 'col'

interface Pane {
  id: string
  ptyId: string        // 1:1 with a PTY in the main process
}

// A session's view is a binary tree of panes (splits). Leaf = a Pane.
type PaneNode =
  | { type: 'leaf'; pane: Pane }
  | { type: 'split'; dir: SplitDir; a: PaneNode; b: PaneNode; ratio: number }

interface Session {
  id: string
  projectId: string
  title: string            // e.g. "claude", "dev server", "shell"
  kind: SessionKind
  cwd: string
  layout: PaneNode         // defaults to a single leaf
  status: SessionStatus    // aggregated from its panes
  autoRelaunch: boolean     // claude sessions: re-run `claude` on restore
}

interface Project {
  id: string
  name: string             // from the folder, editable
  path: string
  color: string            // initial-chip colour, from a brand-safe set
  branch?: string          // git branch readout
  collapsed: boolean
  sessionIds: string[]     // order in the rail
}

interface Settings {
  theme: 'dark' | 'light' | 'system'
  fontFamily: string
  fontSize: number
  cursorStyle: 'block' | 'bar' | 'underline'
  bell: 'status-only' | 'sound' | 'off'
  notifications: boolean
  claudeAutoRelaunch: boolean
  defaultShell: string     // resolved from $SHELL by default
}

interface Workspace {
  projects: Project[]
  sessions: Session[]
  activeSessionId: string | null
  windowBounds?: { x: number; y: number; width: number; height: number }
  settings: Settings
}
```

**Project colour set (brand-safe, no sage):** `#D4A853`, `#6E8AAE`, `#C4932E`, `#7995BB`, `#B58AC2`, `#3F699F`. Assigned round-robin on add, editable.

---

## 9. Core subsystems

### 9.1 PtyManager (main)
- `create({ cwd, shell, cols, rows, env })` spawns a node-pty process, returns a `ptyId`, and pipes `onData` to `session:data`.
- Tracks PTYs in a `Map<ptyId, IPty>`. Handles `write`, `resize`, `kill`, and `onExit`.
- Default shell from `$SHELL`; default env inherits the user environment plus `TERM=xterm-256color` and `COLORTERM=truecolor`.
- For a `claude` session, the pane spawns the shell and writes `claude\n` (so history and environment are normal), unless the user opted out.

### 9.2 Terminal rendering (renderer)
- One `Terminal` (xterm.js) instance per pane, mounted in a `Pane` component.
- WebGL renderer with a canvas fallback on context loss.
- FitAddon recomputes cols/rows on container resize and reports back via `session:resize`.
- Theme applied from the active ANSI table. Switching theme re-applies `term.options.theme` live.
- Search, web-links, unicode11 addons loaded per instance.

### 9.3 Session monitor and Claude awareness (main)
The monitor assigns a `SessionStatus` per session by combining signals from each pane's PTY stream. It is the one genuinely heuristic subsystem, so it is built behind a small interface and tuned against a fixture corpus.

```ts
interface ActivityDetector {
  // Called for each chunk of PTY output. May return a status hint.
  onData(chunk: string, state: DetectorState): StatusHint | null
  // Terminal bell (\x07). The strongest "needs you" signal.
  onBell(): StatusHint
  // OSC title change (some tools, including Claude, set it).
  onTitle(title: string): StatusHint | null
  onExit(code: number): StatusHint
}
```

**Signals, in order of reliability:**
1. **Bell (`\x07`)** -> needs-input. Rock solid; many CLIs ring the bell when they want attention.
2. **OSC window-title changes** -> hints (e.g. a title containing "waiting" or a project marker).
3. **Output activity timer** -> working while bytes are flowing; transitions to idle after a quiet window (default 700 ms) when the tail looks like a shell prompt.
4. **Claude prompt patterns** (a `ClaudeDetector` implementing the interface): recognises the working spinner / "esc to interrupt" line as working, and confirmation prompts (for example a "Do you want to proceed?" block with numbered choices) as needs-input. These patterns are the least reliable layer and are isolated so they can be improved without touching the state machine.

**Status state machine:**
- `spawn -> idle`
- `idle/working + activity -> working`
- `working + quiet(700ms) + prompt-like tail -> idle`
- `any + bell OR claude-confirm-pattern, while session not focused -> needs-input`
- `needs-input + session gains focus -> working or idle (by current activity)`
- `pane exit -> (aggregate) exited when all panes exited`

A session's status aggregates its panes: needs-input wins, then working, then idle, then exited.

**Tuning:** a corpus of recorded Claude Code output (captured to `src/main/monitor/fixtures/`) drives unit tests. Detectors are pure functions of (chunk, state) so they are fully testable offline.

### 9.4 Notifications and dock badge (main)
- When a session transitions to needs-input and either Bunyan is unfocused or that session is not the active one, fire a macOS `Notification`: title the project name, body "Claude needs your input". Clicking it sends `app:focusRequest` so the renderer focuses that session.
- The dock badge shows the count of sessions currently in needs-input. Cleared as they are addressed.
- Notifications and bell behaviour are governed by `Settings`.

### 9.5 Persistence and restore (main + renderer)
- The renderer debounces workspace changes and calls `store:save`. The main process writes via electron-store.
- Persisted: projects, sessions (title, kind, cwd, pane layout, autoRelaunch), active session, window bounds, settings. Plus the last scrollback per pane, capped (default 1000 lines per pane, hard cap on total size).
- On launch: rebuild projects and sessions, spawn fresh PTYs at each session's cwd. The saved scrollback is written into the new terminal as a dimmed "Previous session" block above a separator, then the live prompt follows. For `claude` sessions with `autoRelaunch` on (default), `claude` is run after the shell initialises.
- Honest limit: a dead process cannot be revived. Restore reconstructs structure and working directory, not live process state. This is stated in the UI the first time restore runs.

---

## 10. UI and UX

### 10.1 App shell
- Frameless with `hiddenInset` title bar. Native traffic lights top-left.
- Custom title bar: Bunyan icon, then a breadcrumb "ProjectName / session-title" in Georgia. The bar is draggable.
- Body: main terminal area (flex) on the left, the rail (fixed width, default 236 px, resizable 200 to 360) on the right.

### 10.2 The rail (right)
- Header: "PROJECTS" label and a "+" to add a project.
- Each **project row**: a coloured initial chip, the project name (truncating), a git branch chip when present, and either a session-count badge (collapsed) or its sessions (expanded). A small status dot reflects the project's most urgent session.
- Each **session row** (under an expanded project): a status dot, the session title, and a "needs you" tag in gold when applicable. Click to focus.
- Per-project actions (on hover or a kebab): "+ Claude", "+ Shell", rename, change colour, close project.
- The active session row is filled with navy surface and a left gold marker.
- Drag to reorder projects and sessions. Collapsed state persists.

### 10.3 Terminal area and splits
- Shows the focused session's pane tree.
- Split current pane horizontally or vertically (Cmd-D / Cmd-Shift-D). Drag the divider to set ratio. Close a pane with Cmd-W (closing the last pane closes the session after a confirm).
- The focused pane has a subtle gold top border. Clicking a pane focuses it.

### 10.4 Command palette (Cmd-K)
- Centered overlay, fuzzy search over: every project, every session, and a set of actions (New Claude in <project>, New Shell, Split, Toggle theme, Open project, Settings).
- Arrow keys to move, Enter to run, Esc to close. Results show the project/session status dot inline.

### 10.5 Settings
- A simple panel (not a separate window): theme, font family, font size, cursor style, bell behaviour, notifications toggle, claude auto-relaunch toggle, default shell.

### 10.6 Keyboard map (defaults, user-rebindable later)
| Action | Shortcut |
|--------|----------|
| Command palette | Cmd-K |
| New Claude session (active project) | Cmd-T |
| New shell (active project) | Cmd-Shift-T |
| Next / previous session | Cmd-] / Cmd-[ |
| Jump to session 1..9 | Cmd-1 .. Cmd-9 |
| Split vertical / horizontal | Cmd-D / Cmd-Shift-D |
| Close pane | Cmd-W |
| Find in terminal | Cmd-F |
| Toggle rail | Cmd-B |
| Open project | Cmd-O |
| Settings | Cmd-, |

### 10.7 Empty states and onboarding
- First run: a centered Bunyan mark, one line, "Open a folder to start," and an "Open project" button. No wizard.
- A project with no sessions shows "No sessions yet" with the two add buttons.

---

## 11. Detailed behaviours

- **Add a project:** folder picker or drag-and-drop a folder onto the rail. Name defaults to the folder name, editable. A colour is assigned. Git branch is read once and refreshed on focus.
- **New Claude session:** creates a `claude`-kind session, opens a pane at the project cwd, runs the shell, then `claude`. Title defaults to "claude", "claude 2", and so on.
- **Status transitions:** see 9.3. Focusing a needs-input session clears it.
- **Restore:** see 9.5.
- **Close project:** confirms if any session is working, kills its PTYs, removes it from the workspace.

---

## 12. Theming

Two complete themes, dark (default) and light, each defining the UI tokens (section 5) and a full xterm ANSI table (section 5). Theme is a Settings value; `system` follows the macOS appearance. Switching is live, no restart.

---

## 13. Build, packaging, and tooling

- **Dev:** electron-vite, TypeScript strict, ESLint + Prettier.
- **Repo layout:**
```
bunyan/
  package.json
  electron.vite.config.ts
  tsconfig.json
  tailwind.css
  build/                 # icons, entitlements.plist
  src/
    main/                # index, pty/, monitor/ (+ fixtures), store/, notifications, ipc
    preload/             # contextBridge api
    renderer/            # app/, rail/, terminal/, palette/, settings/, state/, theme/
    shared/              # types, ipc contracts
  docs/
```
- **Packaging:** electron-builder, universal (arm64 + x64), targets dmg and zip.
- **Signing/notarisation:** required for distribution to others (Apple Developer ID + notarytool). For personal local use an unsigned build runs via right-click Open. This is a release-phase task, not a build blocker.

---

## 14. Voice and copy

All user-facing strings follow these rules:
- No em dashes. Use commas, periods, parentheses, or a plain hyphen.
- Contractions where natural (you're, it's, we'll).
- Short sentences, one idea each. No filler ("Great!", "Sure!").
- No Oxford comma in UI copy ("X, Y and Z").
- Warm and direct, like a sharp colleague.

---

## 15. Testing strategy

- **Unit (Vitest):** status state machine; activity and Claude detectors against the fixture corpus; persistence serialise/restore; command-palette fuzzy match; pane-tree split/close logic.
- **Component (Vitest + Testing Library):** rail rendering and interactions, command palette, with a mocked `window.bunyan`.
- **E2E smoke (Playwright for Electron):** launch app, open a folder, spawn a shell session, run `echo hi`, assert output; spawn a claude-kind session and assert a status transition using a scripted fake that rings the bell.
- "Done" for any phase means tsc clean, lint clean, and the phase's tests green.

---

## 16. Build phases

Each phase is independently runnable and demoable.

1. **Skeleton.** electron-vite app, secure preload bridge, one working xterm.js pane over node-pty. Type in a real shell, see output, resize correctly.
2. **The rail and persistence.** Projects and sessions data model, add/open project, the right rail, switching focus, save/restore the workspace.
3. **Multi-session, splits, themes.** Multiple sessions per project, split panes, dark and light themes with the full ANSI tables.
4. **Claude awareness.** Session monitor, detectors, the status state machine, notifications, dock badge. Built against the fixture corpus.
5. **Palette, keyboard, search, settings.** Cmd-K palette, the keyboard map, in-terminal search, the settings panel.
6. **Polish and package.** Final icon set, empty states, motion, accessibility pass, electron-builder config, a signed/notarised build.

---

## 17. Risks and open questions

- **Claude state detection is heuristic.** The bell signal is reliable; prompt-pattern matching is best-effort and may need iteration as Claude Code's output evolves. Mitigation: the detector interface and fixture corpus keep changes contained and testable.
- **WebGL rendering edge cases.** Context loss on some GPUs. Mitigation: canvas fallback wired from the start.
- **Restore expectations.** Users may expect live process resurrection. Mitigation: clear one-time messaging and a dimmed "previous session" block.
- **Name overlap.** An npm logging library is also called `bunyan`. No conflict for a desktop app; note for the GitHub repo name and SEO.
- **Open later:** rebindable keys UI, multiple windows, Windows/Linux ports, SSH.

---

## 18. Definition of done (v1)

A signed macOS app that: opens folders as projects, runs multiple shell and Claude sessions per project, shows them in a clean right rail with accurate working / needs-you / idle status, fires notifications and a dock badge when a session needs you, supports splits, a Cmd-K palette, search, dark and light themes, and restores the full workspace on reopen. tsc and lint clean, unit and smoke tests green.
