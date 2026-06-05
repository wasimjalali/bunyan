# Bunyan

A premium macOS terminal for running and tracking multiple projects and Claude Code sessions from one calm place.

Bunyan (بُنيان) means a solid, firmly built structure.

## What it is

- A right-hand rail that lists every project and its sessions.
- Live status per session: working, needs you, idle.
- macOS notifications and a dock badge when a Claude session needs you.
- Split panes, a Cmd-K command palette, dark and light themes, and full workspace restore.

## Stack

Electron, xterm.js, node-pty, React, TypeScript, Tailwind v4, Zustand. Dev with electron-vite, package with electron-builder.

## Development

```bash
npm install        # also rebuilds node-pty for Electron (postinstall)
npm run dev        # launch the app with HMR
npm run typecheck  # tsc, both projects, zero errors
npm run lint       # ESLint, zero warnings
npm test           # Vitest unit suite
npm run build      # bundle main, preload and renderer
```

If node-pty ever loads against the wrong ABI (after an Electron bump), run `npm run rebuild`.

## Packaging

```bash
npm run icons      # generate build/icon/icon.icns from the source SVG (needs librsvg)
npm run pack       # build, then electron-builder universal dmg + zip
```

Signing and notarisation (Apple Developer ID + notarytool) are required to share the app with
others; for personal local use an unsigned build runs via right-click Open.

## Layout

```
src/
  main/      # Electron main: PtyManager, session monitor (+ fixtures), store, notifications, IPC
  preload/   # the single typed window.bunyan bridge
  renderer/  # React UI: app, rail, terminal, palette, search, settings, state, theme
  shared/    # data model, IPC contract, pure logic (pane-tree, workspace, fuzzy)
```

The full v1 spec is in [`docs/specs/2026-06-05-bunyan-v1-spec.md`](docs/specs/2026-06-05-bunyan-v1-spec.md)
and the build plan in [`docs/plans/`](docs/plans/).

## License

MIT.
