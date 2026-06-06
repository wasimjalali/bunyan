# Bunyan v1, build handoff

> **Status: built.** This handoff has been executed. All six phases and the
> section-17 gaps are implemented, reviewed (CodeRabbit clean) and merged. See
> `docs/plans/` for the plan and `README.md` for how to run it. Kept here as a
> record of the original brief.

Paste this as the first message in a fresh Claude Code session opened in `~/Desktop/Bunyan`.

---

You are starting the build of **Bunyan**, a premium macOS terminal for running and tracking multiple projects and Claude Code sessions from one calm place. The brainstorming and spec phase is finished. Everything you need is in this repo.

## Read first, in order
1. `docs/specs/2026-06-05-bunyan-v1-spec.md`, the complete approved v1 spec. Read all of it before doing anything.
2. `README.md`, the quick overview.
3. My global `~/.claude/CLAUDE.md` rules apply throughout.

## What you're building (one line)
A dark, premium Electron terminal whose right-hand rail lists every project and its sessions with live working / needs-you / idle status, Claude-aware macOS notifications and a dock badge, split panes, a Cmd-K command palette, dark and light themes, and full workspace restore.

## Locked decisions, do not re-open
- **Stack:** Electron + xterm.js + node-pty + React + TypeScript + Tailwind v4 + Zustand. Dev with electron-vite, package with electron-builder.
- **Platform:** macOS only for v1 (universal, Apple Silicon + Intel).
- **Layout:** a single right rail (projects, each expanding to its sessions). No top tabs.
- **Identity:** name Bunyan; pointed-arch gold mark on a deep-navy tile; Georgia wordmark. Final icon art is a phase 6 task.
- **Palette:** navy, deep navy, cream, gold, charcoal. Sage is removed everywhere. Status colours: gold filled = working, gold ring = needs you, muted = idle.
- **v1 features (all in):** restore on reopen, one-click Claude session, Cmd-K palette, split panes, plus the rail, themes, notifications, search, keyboard nav.

## How to proceed
1. Use the **writing-plans** skill to turn the spec's six build phases (section 16) into an ordered, checkable implementation plan. Save it under `docs/plans/`. Get my approval on the plan before building.
2. Build phase by phase; each phase is independently demoable.
3. Use **test-driven-development**: write the failing test first, then implement.

## Quality bar
- Build with Opus, think hard. I want really good code, not just functioning code.
- Surgical edits, simplicity first, fail loud. No speculative abstractions, no error-swallowing.
- TypeScript strict. `npx tsc --noEmit` must be zero errors before any phase is done. Lint clean.
- npm only. Confirm with me before adding any dependency beyond the locked stack.
- No em dashes in any user-facing string. Follow the voice rules in spec section 14.
- Per commit: run the commit-reviewer. Per phase: run simplify, then a CodeRabbit review.

## Git workflow
- Repo: `https://github.com/wasimjalali/bunyan` (private), origin already set. Work locally in `~/Desktop/Bunyan`.
- Develop on `main` locally, branch per phase (for example `feature/phase-1-skeleton`), push the branch, open a PR, review with CodeRabbit, merge when CI is green. Never push directly to `main`. Conventional commits. Never `--no-verify`, never force-push `main`.

## Optional: orchestrate with a workflow
The build is multi-file and multi-phase, a strong fit for a dynamic workflow to orchestrate a phase (parallel scaffolding, then verification). Offer it to me before spending the tokens; do not run it unprompted.

## Start
Read the spec, then propose the implementation plan for my approval. The first phase is the skeleton: Electron + React + one working xterm.js session over node-pty, with the secure preload bridge.
