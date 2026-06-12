// Click policy for URLs detected in terminal output. https opens on a single
// click. Plain http is held back UNLESS it points at the local machine (dev
// servers live there); a second click on the same link within the arm window
// confirms it. Pure logic, fully unit-testable; the pane renders the hint.

export type LinkDecision = 'open' | 'arm'

/** How long a first click on an insecure link stays armed for the confirm click. */
export const ARM_WINDOW_MS = 2500

/** True for URLs safe to open on a single click: https, or http on localhost. */
export function opensOnSingleClick(uri: string): boolean {
  let url: URL
  try {
    url = new URL(uri)
  } catch {
    return false
  }
  if (url.protocol === 'https:') return true
  if (url.protocol !== 'http:') return false
  return isLocalHostname(url.hostname)
}

// Loopback names and addresses: localhost, *.localhost, 127.0.0.0/8, IPv6 ::1
// (URL.hostname keeps the brackets), and 0.0.0.0 (what dev servers print when
// bound to all interfaces).
export function isLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  if (h === '[::1]' || h === '::1') return true
  if (h === '0.0.0.0') return true
  const octets = /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h)
  return octets !== null && octets.slice(1).every((o) => Number(o) <= 255)
}

/** Per-terminal click state: one armed link at a time, expiring after the window. */
export class LinkGuard {
  private armedUri: string | null = null
  private armedAt = 0

  decide(uri: string, now: number): LinkDecision {
    if (opensOnSingleClick(uri)) return 'open'
    if (this.armedUri === uri && now - this.armedAt <= ARM_WINDOW_MS) {
      this.armedUri = null
      return 'open'
    }
    this.armedUri = uri
    this.armedAt = now
    return 'arm'
  }
}
