import { describe, it, expect } from 'vitest'
import { findFileRefs } from './file-links'

describe('findFileRefs', () => {
  it('finds relative path with line and col', () => {
    expect(findFileRefs('error at src/app/App.tsx:142:7 in build')[0]).toMatchObject({
      path: 'src/app/App.tsx',
      line: 142,
      col: 7,
    })
  })

  it('finds absolute and home paths and bare paths without line numbers', () => {
    expect(findFileRefs('see /Users/x/a.ts:3 now')[0]).toMatchObject({
      path: '/Users/x/a.ts',
      line: 3,
    })
    const home = findFileRefs('~/proj/b.py here')[0]
    expect(home).toMatchObject({ path: '~/proj/b.py' })
    expect(home?.line).toBeUndefined()
    const bare = findFileRefs('build src/c.go fails')[0]
    expect(bare).toMatchObject({ path: 'src/c.go' })
    expect(bare?.line).toBeUndefined()
  })

  it('reports the char offsets of the full matched text', () => {
    const ref = findFileRefs('error at src/app/App.tsx:142:7 in build')[0]
    expect(ref).toMatchObject({ text: 'src/app/App.tsx:142:7', start: 9, end: 30 })
  })

  it('rejects URLs and version-like tokens', () => {
    expect(findFileRefs('see https://x.com/a.ts:1')).toHaveLength(0)
    expect(findFileRefs('node:18.2.0')).toHaveLength(0)
  })

  it('ignores a bare filename with no directory and no leading dot', () => {
    expect(findFileRefs('opened App.tsx for edit')).toHaveLength(0)
  })

  it('finds a ./ relative path', () => {
    expect(findFileRefs('check ./lib/util.js:10')[0]).toMatchObject({
      path: './lib/util.js',
      line: 10,
    })
  })
})
