import { describe, it, expect } from 'vitest'
import {
  makeLeaf,
  newPane,
  listPanes,
  findPane,
  countPanes,
  splitPane,
  closePane,
  setRatio,
  nextFocusAfterClose,
} from './pane-tree'
import type { Pane } from './types'

function pane(id: string): Pane {
  return { id, ptyId: `pty_${id}` }
}

describe('pane-tree', () => {
  it('a single leaf has one pane', () => {
    const tree = makeLeaf(pane('a'))
    expect(countPanes(tree)).toBe(1)
    expect(listPanes(tree).map((p) => p.id)).toEqual(['a'])
  })

  it('newPane creates a unique pane bound to a pty', () => {
    const p = newPane('pty_1')
    expect(p.ptyId).toBe('pty_1')
    expect(p.id).toMatch(/^pane_/)
  })

  it('splits a leaf, putting the incoming pane on the b-side', () => {
    const tree = splitPane(makeLeaf(pane('a')), 'a', 'row', pane('b'))
    expect(tree.type).toBe('split')
    expect(countPanes(tree)).toBe(2)
    expect(listPanes(tree).map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('leaves the tree unchanged when the split target is missing', () => {
    const tree = makeLeaf(pane('a'))
    expect(splitPane(tree, 'nope', 'row', pane('b'))).toBe(tree)
  })

  it('finds a pane by id, deep', () => {
    const tree = splitPane(splitPane(makeLeaf(pane('a')), 'a', 'col', pane('b')), 'b', 'row', pane('c'))
    expect(findPane(tree, 'c')?.id).toBe('c')
    expect(findPane(tree, 'missing')).toBeNull()
  })

  it('closing a split child promotes the surviving sibling', () => {
    const tree = splitPane(makeLeaf(pane('a')), 'a', 'row', pane('b'))
    const after = closePane(tree, 'b')
    expect(after).toEqual(makeLeaf(pane('a')))
  })

  it('closing the last pane collapses to null', () => {
    expect(closePane(makeLeaf(pane('a')), 'a')).toBeNull()
  })

  it('closing one of three rebalances correctly', () => {
    const tree = splitPane(splitPane(makeLeaf(pane('a')), 'a', 'col', pane('b')), 'b', 'row', pane('c'))
    const after = closePane(tree, 'b')
    expect(after && listPanes(after).map((p) => p.id)).toEqual(['a', 'c'])
  })

  it('setRatio updates the split whose a-side begins with the given pane', () => {
    const tree = splitPane(makeLeaf(pane('a')), 'a', 'row', pane('b'))
    const after = setRatio(tree, 'a', 0.7)
    expect(after.type === 'split' && after.ratio).toBe(0.7)
  })

  it('setRatio clamps to a usable range', () => {
    const tree = splitPane(makeLeaf(pane('a')), 'a', 'row', pane('b'))
    expect((setRatio(tree, 'a', 0.001) as { ratio: number }).ratio).toBe(0.1)
    expect((setRatio(tree, 'a', 5) as { ratio: number }).ratio).toBe(0.9)
  })

  it('nextFocusAfterClose returns a surviving pane, or null when none remain', () => {
    const tree = splitPane(makeLeaf(pane('a')), 'a', 'row', pane('b'))
    expect(nextFocusAfterClose(tree, 'b')).toBe('a')
    expect(nextFocusAfterClose(makeLeaf(pane('a')), 'a')).toBeNull()
  })
})
