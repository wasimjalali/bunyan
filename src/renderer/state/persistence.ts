import { useStore } from './store'
import type { Workspace } from '@shared/types'
import { captureAllScrollback, captureScrollbackIfDirty } from '../terminal/scrollback'

const SAVE_DEBOUNCE_MS = 400
const SCROLLBACK_FLUSH_MS = 8000

function save(ws: Workspace): void {
  window.bunyan.store.save(ws).catch((err) => {
    // Surface a real persistence failure rather than dropping it silently.
    console.error('Failed to save workspace', err)
  })
}

/**
 * Persists the workspace whenever it changes (debounced), and flushes captured
 * scrollback on a slow timer so a long-running session's output survives a
 * restart even when nothing else changed. The flush only does work when a pane
 * has produced output since the last capture. Only runs after hydration, so the
 * freshly-loaded state is never echoed straight back. Returns an unsubscribe.
 */
export function startPersistence(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastSaved: Workspace | null = null

  const unsubscribe = useStore.subscribe((state) => {
    if (!state.hydrated) return
    if (state.workspace === lastSaved) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      lastSaved = state.workspace
      save({ ...state.workspace, scrollback: captureAllScrollback() })
    }, SAVE_DEBOUNCE_MS)
  })

  // Periodic scrollback flush, independent of workspace edits. No-op when no
  // pane has produced output since the last capture.
  const flush = setInterval(() => {
    const state = useStore.getState()
    if (!state.hydrated) return
    const scrollback = captureScrollbackIfDirty()
    if (scrollback === null) return
    save({ ...state.workspace, scrollback })
  }, SCROLLBACK_FLUSH_MS)

  return () => {
    if (timer) clearTimeout(timer)
    clearInterval(flush)
    unsubscribe()
  }
}
