import { useEffect, useLayoutEffect, useState } from 'react'
import type { ITheme } from '@xterm/xterm'
import type { ThemeChoice } from '@shared/types'
import { xtermDark, xtermLight } from './xterm-theme'

export interface ResolvedTheme {
  mode: 'dark' | 'light'
  xterm: ITheme
}

/**
 * Resolves the active theme from the user's choice and the OS appearance,
 * applies it to the document (data-theme drives the CSS token swap), and returns
 * the matching xterm ANSI table. Switching is live, no restart (spec section 12).
 */
export function useResolvedTheme(choice: ThemeChoice): ResolvedTheme {
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  )

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent): void => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const mode: 'dark' | 'light' = choice === 'system' ? (systemDark ? 'dark' : 'light') : choice

  // Apply before paint so light-mode users never see a dark flash on first load.
  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', mode)
  }, [mode])

  return { mode, xterm: mode === 'dark' ? xtermDark : xtermLight }
}
