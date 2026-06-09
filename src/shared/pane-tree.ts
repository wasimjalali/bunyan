// Pure operations on a session's pane tree (a binary tree of splits).
// No React, no IPC: fully unit-testable. See spec section 8 (PaneNode) and 10.3.

import type { Pane, PaneNode, SplitDir } from './types'
import { makeId } from './id'

export function makeLeaf(pane: Pane): PaneNode {
  return { type: 'leaf', pane }
}

export function newPane(ptyId: string): Pane {
  return { id: makeId('pane'), ptyId }
}

/** All leaf panes, left-to-right / top-to-bottom. */
export function listPanes(node: PaneNode): Pane[] {
  if (node.type === 'leaf') return [node.pane]
  return [...listPanes(node.a), ...listPanes(node.b)]
}

export function findPane(node: PaneNode, paneId: string): Pane | null {
  if (node.type === 'leaf') return node.pane.id === paneId ? node.pane : null
  return findPane(node.a, paneId) ?? findPane(node.b, paneId)
}

export function countPanes(node: PaneNode): number {
  return listPanes(node).length
}

/**
 * Split the pane `targetId` in `dir`, putting `incoming` on the b-side.
 * Returns a new tree (structural sharing where possible). If the target is not
 * found the tree is returned unchanged.
 */
export function splitPane(
  node: PaneNode,
  targetId: string,
  dir: SplitDir,
  incoming: Pane,
  ratio = 0.5,
): PaneNode {
  if (node.type === 'leaf') {
    if (node.pane.id !== targetId) return node
    return {
      type: 'split',
      dir,
      a: node,
      b: makeLeaf(incoming),
      ratio,
    }
  }
  return {
    ...node,
    a: splitPane(node.a, targetId, dir, incoming, ratio),
    b: splitPane(node.b, targetId, dir, incoming, ratio),
  }
}

/**
 * Remove the leaf `paneId`. When a split loses a child, the surviving child
 * takes its place. Returns null if the whole tree collapses (last pane closed).
 */
export function closePane(node: PaneNode, paneId: string): PaneNode | null {
  if (node.type === 'leaf') {
    return node.pane.id === paneId ? null : node
  }
  const a = closePane(node.a, paneId)
  const b = closePane(node.b, paneId)
  if (a === null && b === null) return null
  if (a === null) return b
  if (b === null) return a
  return { ...node, a, b }
}

/**
 * Set the ratio of the split addressed by `path` (a sequence of 'a'/'b' steps
 * from the root). An empty path targets THIS split. Addressing by path (not by
 * a-side leaf id) is what lets a nested a-side split move independently of its
 * parent, which share the same first leaf. Descending into a leaf or running out
 * of tree returns the node unchanged.
 */
export function setRatioAtPath(node: PaneNode, path: Array<'a' | 'b'>, ratio: number): PaneNode {
  if (node.type === 'leaf') return node
  if (path.length === 0) return { ...node, ratio: clampRatio(ratio) }
  const [step, ...rest] = path
  // Recurse only into the addressed side. Return the node unchanged (same
  // reference) when the descent hit a leaf or ran out of tree, so an invalid
  // path is a no-op.
  if (step === 'a') {
    const a = setRatioAtPath(node.a, rest, ratio)
    return a === node.a ? node : { ...node, a }
  }
  const b = setRatioAtPath(node.b, rest, ratio)
  return b === node.b ? node : { ...node, b }
}

function clampRatio(r: number): number {
  if (r < 0.1) return 0.1
  if (r > 0.9) return 0.9
  return r
}

/** The pane to focus after `closedId` is removed: nearest remaining leaf, or null. */
export function nextFocusAfterClose(node: PaneNode, closedId: string): string | null {
  const remaining = listPanes(node).filter((p) => p.id !== closedId)
  return remaining.length > 0 ? remaining[0]!.id : null
}
