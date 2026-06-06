/**
 * Turns files dropped on a terminal into the text a macOS terminal would
 * paste: each path backslash-escaped for the shell, space-separated, with a
 * trailing space so the user (or Claude Code's prompt) can keep typing.
 */

// Characters that never need escaping in a shell word.
const SAFE_CHAR = /[A-Za-z0-9,._+:@%/-]/

function escapePath(path: string): string {
  let out = ''
  for (const ch of path) out += SAFE_CHAR.test(ch) ? ch : `\\${ch}`
  return out
}

export function pastedPathsText(paths: string[]): string {
  const escaped = paths.filter((p) => p !== '').map(escapePath)
  return escaped.length === 0 ? '' : `${escaped.join(' ')} `
}
