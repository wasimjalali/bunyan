// Pure scanner for file:line[:col] references in a line of terminal output.
// Deliberately conservative: it must avoid false positives (URLs, version
// strings like node:18.2.0) far more than it must catch every possible path,
// because a wrong clickable link is worse than a missed one.

export interface FileRef {
  /** The full matched text, e.g. "src/app/App.tsx:142:7". */
  text: string
  /** Just the path part, e.g. "src/app/App.tsx". */
  path: string
  line?: number
  col?: number
  /** 0-based char offsets of `text` within the scanned line. */
  start: number
  end: number
}

// Known source-file extensions. A candidate must end in one of these.
const EXTS = [
  'tsx', 'ts', 'jsx', 'js', 'mjs', 'cjs', 'json', 'css', 'html', 'md',
  'py', 'go', 'rs', 'rb', 'java', 'kt', 'swift', 'cpp', 'hpp', 'mm',
  'c', 'h', 'm', 'sh', 'zsh', 'yml', 'yaml', 'toml', 'sql', 'vue', 'svelte',
]

// Path chars we accept: letters, digits, and the common path punctuation. No
// spaces (a path with spaces in terminal output is rare and ambiguous). The
// path body is greedy up to the extension, then an optional :line[:col] tail.
// Ordering EXTS longest-first keeps "tsx" from being shortened to "ts". The
// body quantifier is bounded to MAX_PATH so a pathological dot-free run (a
// minified blob, base64) costs linear backtracking instead of quadratic.
const EXT_ALT = [...EXTS].sort((a, b) => b.length - a.length).join('|')
const RE = new RegExp(
  String.raw`(?:~\/|\.\/|\/)?[\w.\-/]{0,512}[\w\-]\.(?:${EXT_ALT})(?::\d+(?::\d+)?)?`,
  'g',
)

export function findFileRefs(line: string): FileRef[] {
  const refs: FileRef[] = []
  for (const match of line.matchAll(RE)) {
    const text = match[0]
    const start = match.index ?? 0
    const end = start + text.length

    // Skip a match that sits inside a URL. The match's own leading slashes can
    // be the "//" of "://", leaving just the scheme colon in `before`, so treat
    // a trailing "<scheme>:" (optionally already followed by slashes) as a URL.
    const before = line.slice(0, start)
    if (/[a-z][\w.+-]*:\/*$/i.test(before)) continue

    // The path must look like a path: it must contain a slash, or start with
    // "~/" or "./", or be absolute. A bare "App.tsx" is not clickable.
    const tail = /:(\d+)(?::(\d+))?$/.exec(text)
    const path = tail ? text.slice(0, tail.index) : text
    const hasDirShape = path.includes('/') || path.startsWith('~/') || path.startsWith('./')
    if (!hasDirShape) continue

    refs.push({
      text,
      path,
      line: tail ? Number(tail[1]) : undefined,
      col: tail && tail[2] !== undefined ? Number(tail[2]) : undefined,
      start,
      end,
    })
  }
  return refs
}
