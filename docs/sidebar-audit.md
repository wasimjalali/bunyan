# Sidebar UI/UX audit

Date: 2026-06-12. Scope: the projects rail, project rows, link handling and
Claude account handling. Items marked **fixed** shipped with this change;
items marked **recommended** are documented for a later pass.

## Flaws found and what was done

### Fixed in this change

1. **Branch chip crowded the project name.** The inline chip was capped at
   80px, so `feature/checkout-redesign` rendered as `feature/c...` while
   stealing a third of the row from the name. Decision: the rail row shows
   no branch at all. The full branch lives in the hover card (re-read from
   git every time the card opens, so it tracks checkouts) and in the title
   bar for the active project, where there is room for it.

2. **Hovering a row hid the status dot.** The action buttons replaced the
   dot on hover, so the one signal the rail exists for (is this project
   working, waiting, idle) blinked out exactly when you looked at it. The
   dot now stays put and the buttons appear beside it.

3. **No way to see project detail without clicking.** A hover card now opens
   after 350ms showing the path, current branch, a session status summary
   ("1 needs input · 2 working") and full-text buttons for "New Claude
   session" and "New shell". The compact C / S buttons stay for speed; the
   card makes them discoverable.

4. **One flat project list.** Work and personal repos interleaved, and
   auto-sort let a personal side project float above client work. The rail
   now has Professional and Personal sections. Running projects float to
   the top of their own section only. Projects move between sections from
   the row menu or by dragging across; folders dropped on a section land in
   that section; each section header has its own add button.

5. **Every URL opened on a single click, including plain http.** A stray
   click on an http link in a log shipped you straight to an unencrypted
   site. Now: https opens on one click; http on localhost, 127.0.0.0/8,
   ::1, 0.0.0.0 and *.localhost opens on one click (dev servers); any other
   http link arms on the first click, shows a "Not secure, click again to
   open" hint in the pane, and opens on the second click within 2.5s.
   Lookalike hosts (localhost.evil.com, 127.0.0.1.evil.com) don't pass the
   localhost test.

6. **One Claude login for everything.** Settings now hold a Claude config
   dir per section (CLAUDE_CONFIG_DIR). Point Personal at e.g.
   ~/.claude-personal and sessions in that section run under their own
   Claude account; Professional keeps the default. Only this single,
   path-validated env var can cross from renderer to PTY spawn.

7. **Keyboard navigation matched the old order.** Cmd-1..9, Cmd-]/[ and the
   footer's "needs input" jumper all follow the new sectioned display order
   so shortcuts match what the eye sees.

### Recommended for a later pass

1. **Replace window.confirm with an in-app dialog.** Closing a project with
   a working session and closing the last pane both use the native blocking
   confirm, which looks foreign and freezes the renderer. An in-app dialog
   (or an undo toast: close immediately, offer "Reopen" for 7s) fits the
   product better.

2. **Project menu can clip.** The row's ⋯ menu is absolutely positioned
   inside the rail's scroll container; for a row near the bottom it can be
   cut off. Same fixed-position treatment as the new hover card would fix it.

3. **Branch only refreshes on hover or add.** A checkout made while Bunyan
   is open shows stale in the title bar until the project is hovered.
   A cheap fix: re-read the branch when a session of that project gains
   focus, or watch .git/HEAD with fs.watch.

4. **Drops below the last section do nothing.** The Finder drop targets are
   the two section groups; the empty area under them ignores drops. Fine in
   practice (the empty-section hint says where to drop), but a catch-all
   that routes to Professional would be more forgiving.

5. **Session rows could carry more signal.** A compact elapsed-time readout
   ("working 4m") next to a working session would answer "is it stuck?"
   without switching. The SessionMonitor already has the state transitions
   to derive this.

6. **No drag handle affordance.** Rows are draggable but nothing signals it
   until you try. A subtle grip on hover (or cursor: grab) would help.

## Quality-of-life recommendations for terminal coding

- **Per-project default session sets.** One click (or on project open)
  starts a saved layout: claude + dev server + shell. The pane-tree and
  snippets infrastructure covers most of this already.
- **Quick branch switcher.** The hover card knows the branch; a click could
  list local branches (git for-each-ref) and check one out, with the rail
  refreshing live.
- **Session renaming.** Titles are auto-generated ("claude 2"); a
  double-click rename on SessionRow (the ProjectRow rename pattern, reused)
  makes multi-agent juggling much clearer.
- **"Open in editor / Finder / GitHub" on the project menu.** The editor
  URI scheme plumbing already exists for file links; the project menu is
  the natural home for whole-project jumps.
- **Claude usage at a glance.** With separate config dirs per section, a
  small "which account am I on" readout in the hover card or status bar
  prevents the classic wrong-account session.
- **Notification deep links.** Clicking a "needs input" notification
  already focuses the session; a per-session snooze ("stop notifying for
  this run") would cut noise on long autonomous runs.
