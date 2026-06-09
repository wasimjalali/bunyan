import { describe, it, expect } from 'vitest'
import {
  makeLeaf,
  newPane,
  listPanes,
  findPane,
  countPanes,
  splitPane,
  closePane,
  setRatioAtPath,
  nextFocusAfterClose,
} from './pane-tree'
import type { Pane, PaneNode } from './types'

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

  it('setRatioAtPath targets a nested a-side split independently of its parent', () => {
    // root split S1: a = (split S2: a=leaf p1, b=leaf p2), b = leaf p3
    const p1 = makeLeaf(newPane('t1'))
    const p2 = makeLeaf(newPane('t2'))
    const p3 = makeLeaf(newPane('t3'))
    const s2: PaneNode = { type: 'split', dir: 'col', a: p1, b: p2, ratio: 0.5 }
    const root: PaneNode = { type: 'split', dir: 'row', a: s2, b: p3, ratio: 0.5 }
    const next = setRatioAtPath(root, ['a'], 0.3)
    expect(next.type === 'split' && next.a.type === 'split' && next.a.ratio).toBe(0.3)
    expect(next.type === 'split' && next.ratio).toBe(0.5) // parent untouched
    const next2 = setRatioAtPath(root, [], 0.7)
    expect(next2.type === 'split' && next2.ratio).toBe(0.7)
  })

  it('setRatioAtPath clamps to [0.1, 0.9] and ignores invalid paths', () => {
    // path ['a'] into a leaf returns the tree unchanged; ratio 0.05 clamps to 0.1
    const leaf = makeLeaf(pane('a'))
    expect(setRatioAtPath(leaf, ['a'], 0.5)).toBe(leaf)
    const tree = splitPane(makeLeaf(pane('a')), 'a', 'row', pane('b'))
    // The a-side is a leaf, so descending into ['a'] leaves the tree unchanged.
    expect(setRatioAtPath(tree, ['a'], 0.7)).toBe(tree)
    expect((setRatioAtPath(tree, [], 0.05) as { ratio: number }).ratio).toBe(0.1)
    expect((setRatioAtPath(tree, [], 5) as { ratio: number }).ratio).toBe(0.9)
  })

  it('nextFocusAfterClose returns a surviving pane, or null when none remain', () => {
    const tree = splitPane(makeLeaf(pane('a')), 'a', 'row', pane('b'))
    expect(nextFocusAfterClose(tree, 'b')).toBe('a')
    expect(nextFocusAfterClose(makeLeaf(pane('a')), 'a')).toBeNull()
  })
})
