import type { Terminal } from '@xterm/xterm'
import type { SearchAddon } from '@xterm/addon-search'

export interface PaneHandles {
  term: Terminal
  search: SearchAddon
}

// A small registry of live xterm instances by pane id. Lets imperative features
// (focus, in-terminal search) reach a specific terminal without prop drilling.
const panes = new Map<string, PaneHandles>()

export function registerPaneTerminal(paneId: string, handles: PaneHandles): void {
  panes.set(paneId, handles)
}

export function unregisterPaneTerminal(paneId: string): void {
  panes.delete(paneId)
}

export function getPaneHandles(paneId: string): PaneHandles | undefined {
  return panes.get(paneId)
}

export function focusPaneTerminal(paneId: string): void {
  panes.get(paneId)?.term.focus()
}
