// A small, dependency-free fuzzy matcher for the command palette. Returns a
// score (higher is better) when every query character appears in order, or null
// when it does not match. Consecutive matches and word-boundary hits score higher.

export function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (q.length === 0) return 0
  if (q.length > t.length) return null

  let score = 0
  let qi = 0
  let prevMatchIndex = -1
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue
    score += 1
    if (prevMatchIndex === ti - 1) score += 4 // consecutive run
    const prevChar = ti > 0 ? t[ti - 1] : ''
    if (ti === 0 || prevChar === ' ' || prevChar === '/' || prevChar === '-' || prevChar === '_') {
      score += 3 // start of a word
    }
    prevMatchIndex = ti
    qi++
  }
  if (qi < q.length) return null
  // Prefer shorter targets (a tighter match) as a gentle tie-breaker.
  return score - t.length * 0.01
}

export interface Ranked<T> {
  item: T
  score: number
}

/** Filter and rank items by a query against a text accessor. Stable for ties. */
export function fuzzyFilter<T>(query: string, items: T[], textOf: (item: T) => string): T[] {
  if (query.trim() === '') return items
  const ranked: Array<Ranked<T> & { index: number }> = []
  items.forEach((item, index) => {
    const score = fuzzyScore(query, textOf(item))
    if (score !== null) ranked.push({ item, score, index })
  })
  ranked.sort((a, b) => b.score - a.score || a.index - b.index)
  return ranked.map((r) => r.item)
}
