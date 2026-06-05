import type { Terminal } from '@xterm/xterm'

// A small registry of live xterm instances by pane id. Lets imperative features
// (focus, in-terminal search) reach a specific terminal without prop drilling.
const terminals = new Map<string, Terminal>()

export function registerPaneTerminal(paneId: string, term: Terminal): void {
  terminals.set(paneId, term)
}

export function unregisterPaneTerminal(paneId: string): void {
  terminals.delete(paneId)
}

export function getPaneTerminal(paneId: string): Terminal | undefined {
  return terminals.get(paneId)
}

export function focusPaneTerminal(paneId: string): void {
  terminals.get(paneId)?.focus()
}
