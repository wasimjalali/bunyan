# Bunyan v1, implementation plan

> **Status: complete.** All six build phases shipped, plus the four section-17 gaps
> (rail drag-reorder, folder drag-drop, per-pane scrollback restore, Playwright E2E).
> `tsc` clean, ESLint clean, 93 unit tests and 3 Electron E2E tests green. Packaging
> config is in place; producing a signed/notarised build is the only remaining
> release-phase step.

Derived from `docs/specs/2026-06-05-bunyan-v1-spec.md` section 16. Each phase is independently
demoable and ends with: `npx tsc --noEmit` zero errors, ESLint clean, the phase's tests green.

Stack is locked (handoff section "Locked decisions"): Electron + xterm.js + node-pty + React +
TypeScript + Tailwind v4 + Zustand, dev with electron-vite, package with electron-builder.

## Repo layout (target)

```
bunyan/
  package.json
  electron.vite.config.ts
  tsconfig.json (+ tsconfig.node.json, tsconfig.web.json)
  vitest.config.ts
  .eslintrc / eslint.config.js, .prettierrc
  build/                 # icon SVGs, entitlements.plist (phase 6)
  src/
    main/                # index.ts, pty/, monitor/ (+ fixtures), store/, notifications.ts, ipc.ts, window.ts
    preload/             # index.ts (contextBridge api)
    renderer/            # index.html, main.tsx, app/, rail/, terminal/, palette/, settings/, state/, theme/
    shared/              # types.ts, ipc.ts
  docs/
```

---

## Phase 1, Skeleton

Goal: type in a real shell inside the app, see output, resize correctly. Secure boundary in place.

- [ ] Scaffold electron-vite project: package.json, electron.vite.config.ts, tsconfigs (strict), tailwind v4 via `@tailwindcss/vite`.
- [ ] `src/shared/types.ts` and `src/shared/ipc.ts`: the full data model and the typed IPC channel map from spec sections 8 and 7.3.
- [ ] Main: `window.ts` (BrowserWindow with contextIsolation true, nodeIntegration false, sandbox true, hiddenInset), strict CSP.
- [ ] Main: `pty/PtyManager.ts`: create/write/resize/kill, Map<ptyId, IPty>, pipes onData to `session:data`, onExit to `session:exit`. Default shell from $SHELL, env adds TERM + COLORTERM.
- [ ] Main: `ipc.ts` registers handlers, validates every payload (id exists, cols/rows in range, data bounded).
- [ ] Preload: expose `window.bunyan` typed API via contextBridge. No raw ipcRenderer.
- [ ] Renderer: minimal app that mounts one `Terminal` (xterm.js) in a `Pane`, WebGL with canvas fallback, FitAddon, reports resize.
- [ ] Tests (Vitest): PtyManager payload validation, ipc validators, pane-tree single-leaf helper.
- [ ] Verify: tsc clean, lint clean, tests green, app runs and echoes a shell.

## Phase 2, Rail and persistence

- [ ] Zustand store in renderer (`state/`): workspace = projects, sessions, activeSessionId, settings.
- [ ] `project:openDialog` + `project:gitBranch` main handlers.
- [ ] Rail UI (`rail/`): PROJECTS header + add, project rows (chip, name, branch chip, status dot, collapse), session rows (status dot, title), per-project add Claude / add Shell / rename / colour / close.
- [ ] Focus switching: clicking a session focuses it, active row styling (navy surface + gold left marker).
- [ ] electron-store wiring: `store:load` / `store:save`, debounced save in renderer. Round-robin project colours.
- [ ] Restore: rebuild projects/sessions, spawn fresh PTYs at cwd, dimmed "Previous session" scrollback block, claude autoRelaunch.
- [ ] Tests: persistence serialise/restore round trip, colour assignment, store reducers.

## Phase 3, Multi-session, splits, themes

- [ ] Pane tree: split (row/col), close, ratio, focus. Pure functions + tests (split/close/find).
- [ ] Terminal area renders the focused session's PaneNode recursively with draggable dividers.
- [ ] Cmd-D / Cmd-Shift-D split, Cmd-W close pane (confirm closing last pane). Focused pane gold top border.
- [ ] Theme system (`theme/`): dark + light UI tokens and full xterm ANSI tables (spec section 5). `system` follows macOS. Live switch re-applies term.options.theme.
- [ ] Tests: pane-tree operations, theme table completeness.

## Phase 4, Claude awareness

- [ ] `monitor/detectors`: `ActivityDetector` interface, bell/title/activity-timer detector, `ClaudeDetector` (spinner/"esc to interrupt" = working, confirm prompt = needs-input). Pure functions.
- [ ] Status state machine (spec 9.3) with aggregation: needs-input > working > idle > exited.
- [ ] Fixture corpus in `monitor/fixtures/`, unit tests drive detectors and state machine.
- [ ] Notifications + dock badge (main): needs-input while unfocused/inactive fires Notification; badge = count of needs-input; `app:focusRequest` on click. Governed by Settings.
- [ ] Tests: detectors vs fixtures, state machine transitions, aggregation.

## Phase 5, Palette, keyboard, search, settings

- [ ] Cmd-K palette: fuzzy match over projects, sessions, actions. Arrow/Enter/Esc. Status dots inline.
- [ ] Keyboard map (spec 10.6) wired centrally.
- [ ] In-terminal search via search addon (Cmd-F).
- [ ] Settings panel (in-app, not a window): theme, font family/size, cursor style, bell, notifications, claude auto-relaunch, default shell.
- [ ] Tests: fuzzy match ranking, keymap dispatch.

## Phase 6, Polish and package

- [ ] Bunyan mark SVG (pointed gold arch on navy tile), wordmark, app icon set scaffolding in build/.
- [ ] Empty states + first-run onboarding, motion, accessibility pass.
- [ ] electron-builder config: universal dmg + zip, entitlements. (Signing/notarisation is a release task, not a build blocker.)
- [ ] Verify full DoD (spec section 18).

## Testing strategy (all phases)

- Unit (Vitest): state machine, detectors vs fixtures, persistence round trip, palette fuzzy match, pane-tree logic.
- Component (Vitest + Testing Library): rail, palette with mocked `window.bunyan`.
- E2E smoke (Playwright for Electron): launch, open folder, shell session echo, claude-kind status transition via scripted bell.
