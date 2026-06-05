---
name: ship
description: Ship Bunyan in one go - run simplify and code review on the working changes, push to GitHub, then rebuild and reinstall the local macOS app so the changes are live in the installed Bunyan.app. Use when the user says "ship it", "ship", "deploy", "push and update the app", "redeploy", or otherwise wants their code changes reflected in the app they run on this Mac.
---

# Ship Bunyan

This takes the current working changes all the way to the running app on this
Mac, without the user having to spell out the steps. Do the steps in order.
Stop and report if any step fails; do not paper over a failure to keep going.

## 1. Quality pass

1. Run the `simplify` skill on the working diff and apply its cleanups.
2. Run the `code-review` skill on the working diff. Fix anything it flags as a
   real bug. For style-only notes, mention them but don't block.
3. Run `npm run typecheck` and `npm test`. Both must be clean before continuing.

## 2. Commit and push

1. Stage the changes and write a conventional-commit message (`feat:`, `fix:`,
   `chore:`, `refactor:`) describing what changed.
2. Push to `origin main`. This is the user's personal repo and this skill is an
   explicit request to ship, so pushing is expected here.

## 3. Rebuild and reinstall the macOS app

1. Run `npm run app:local`. That script:
   - ensures node-pty's `spawn-helper` is executable (without the execute bit,
     `posix_spawnp` fails and every session errors with "Could not start the
     session"),
   - builds an arm64 bundle and skips the native recompile (node-pty ships an
     ABI-stable prebuild, so no Python/node-gyp toolchain is needed),
   - ad-hoc signs the bundle (valid on this Mac; no Apple Developer ID required),
   - reinstalls it to `/Applications/Bunyan.app` and clears the quarantine flag.
2. If `Bunyan.app` is currently open, tell the user to quit and reopen it to
   load the new build (a running app keeps the old code).

## What this is, and isn't

- This is personal, local, single-machine shipping. The app is ad-hoc signed,
  so it runs here but would warn on someone else's Mac.
- macOS apps can't silently auto-update without a Developer ID signature, so
  "redeploy" means: the user runs `/ship` (or asks to ship) and this rebuilds
  and reinstalls. There is no background self-update.
- Pushing to GitHub does not, by itself, update the installed app. The rebuild
  in step 3 is what makes changes visible in the app.
