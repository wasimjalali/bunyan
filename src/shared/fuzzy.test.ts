import { describe, it, expect } from 'vitest'
import { fuzzyScore, fuzzyFilter } from './fuzzy'

describe('fuzzyScore', () => {
  it('matches a subsequence', () => {
    expect(fuzzyScore('cld', 'claude')).not.toBeNull()
  })
  it('returns null when characters are out of order or missing', () => {
    expect(fuzzyScore('xyz', 'claude')).toBeNull()
    expect(fuzzyScore('edualc', 'claude')).toBeNull()
  })
  it('scores a consecutive prefix above a scattered match', () => {
    const prefix = fuzzyScore('cla', 'claude')!
    const scattered = fuzzyScore('cae', 'claude')!
    expect(prefix).toBeGreaterThan(scattered)
  })
  it('rewards word-boundary matches', () => {
    const boundary = fuzzyScore('ns', 'new shell')!
    const mid = fuzzyScore('ew', 'new shell')!
    expect(boundary).toBeGreaterThan(mid)
  })
  it('an empty query matches everything with a neutral score', () => {
    expect(fuzzyScore('', 'anything')).toBe(0)
  })
})

describe('fuzzyFilter', () => {
  const items = ['New Claude session', 'New shell', 'Toggle theme', 'Open project', 'Settings']

  it('returns all items for an empty query, in order', () => {
    expect(fuzzyFilter('', items, (s) => s)).toEqual(items)
  })
  it('ranks the best match first', () => {
    const out = fuzzyFilter('claude', items, (s) => s)
    expect(out[0]).toBe('New Claude session')
  })
  it('drops non-matches', () => {
    const out = fuzzyFilter('zzz', items, (s) => s)
    expect(out).toEqual([])
  })
  it('finds settings by prefix', () => {
    expect(fuzzyFilter('set', items, (s) => s)[0]).toBe('Settings')
  })
})
