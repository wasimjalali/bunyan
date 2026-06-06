// A TerminalPane can unmount for two very different reasons:
//
//  1. The user closed the pane/session/project, so its PTY was killed.
//  2. The split tree changed shape (a leaf became a split, or a split collapsed
//     back to a leaf). React reparents the surviving terminal, which forces a
//     remount even though the PTY is still alive.
//
// In case 2 the xterm instance is disposed and rebuilt empty, so without help
// the pane would go blank while its shell keeps running. We can't move a live
// xterm across React parents safely, so instead we stash the pane's on-screen
// text on unmount and replay it when the same PTY remounts. The store marks the
// PTYs it kills so we know which unmounts are real closes (no replay, no leak).

const closedPtys = new Set<string>()
const stash = new Map<string, string>()

/** Mark a PTY as deliberately killed, so its next unmount is treated as a close. */
export function markPtyClosed(ptyId: string): void {
  closedPtys.add(ptyId)
  stash.delete(ptyId)
}

export function wasPtyClosed(ptyId: string): boolean {
  return closedPtys.has(ptyId)
}

export function forgetClosedPty(ptyId: string): void {
  closedPtys.delete(ptyId)
}

/** Remember a pane's on-screen text to replay if the same PTY remounts. */
export function stashPaneText(ptyId: string, text: string): void {
  if (text) stash.set(ptyId, text)
  else stash.delete(ptyId)
}

/** Take (and clear) any stashed text for a PTY. */
export function takePaneText(ptyId: string): string | undefined {
  const text = stash.get(ptyId)
  stash.delete(ptyId)
  return text
}
