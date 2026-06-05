import Store from 'electron-store'
import type { Workspace, WindowBounds } from '@shared/types'

interface Persisted {
  workspace?: Workspace
  windowBounds?: WindowBounds
}

/**
 * Persists the workspace as JSON in the app's user-data dir via electron-store.
 * The renderer owns workspace shape (projects, sessions, settings); the main
 * process owns window bounds (only main can read the real x/y). On load we merge
 * the authoritative bounds back into the workspace so the renderer sees them.
 */
export class WorkspaceStore {
  private readonly store = new Store<Persisted>({ name: 'workspace' })

  load(): Workspace | null {
    const ws = this.store.get('workspace')
    if (!isWorkspaceLike(ws)) return null
    const bounds = this.store.get('windowBounds')
    return bounds ? { ...ws, windowBounds: bounds } : ws
  }

  save(workspace: Workspace): void {
    if (!isWorkspaceLike(workspace)) throw new Error('Refusing to save a malformed workspace')
    this.store.set('workspace', workspace)
  }

  loadBounds(): WindowBounds | null {
    return this.store.get('windowBounds') ?? null
  }

  saveBounds(bounds: WindowBounds): void {
    this.store.set('windowBounds', bounds)
  }
}

function isWorkspaceLike(value: unknown): value is Workspace {
  if (typeof value !== 'object' || value === null) return false
  const ws = value as Partial<Workspace>
  return (
    Array.isArray(ws.projects) &&
    Array.isArray(ws.sessions) &&
    typeof ws.settings === 'object' &&
    ws.settings !== null
  )
}
