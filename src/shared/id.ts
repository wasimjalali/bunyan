// Short, collision-resistant ids for projects, sessions and panes.
// Uses the platform crypto (available in both main and renderer).

export function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}
