import { useStore } from './store'
import type { Workspace } from '@shared/types'

const SAVE_DEBOUNCE_MS = 400

/**
 * Persists the workspace whenever it changes, debounced. Only runs after the
 * store has hydrated, so the freshly-loaded state is never echoed straight back.
 * Returns an unsubscribe function.
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
      window.bunyan.store.save(state.workspace).catch((err) => {
        // Surface a real persistence failure rather than dropping it silently.
        console.error('Failed to save workspace', err)
      })
    }, SAVE_DEBOUNCE_MS)
  })

  return () => {
    if (timer) clearTimeout(timer)
    unsubscribe()
  }
}
