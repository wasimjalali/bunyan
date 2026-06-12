import os from 'node:os'

/** Replace a leading "~" with the user's home directory. Non-tilde paths pass through. */
export function expandTilde(p: string): string {
  if (p === '~') return os.homedir()
  if (p.startsWith('~/')) return os.homedir() + p.slice(1)
  return p
}
