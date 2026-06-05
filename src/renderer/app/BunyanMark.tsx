interface BunyanMarkProps {
  size?: number
}

/**
 * The Bunyan mark: a pointed arch (classic Islamic architecture) as two nested
 * gold strokes with a gold light at its centre, on a deep-navy rounded tile.
 * Final packaged icon art is produced in phase 6; this is the in-app mark.
 */
export function BunyanMark({ size = 24 }: BunyanMarkProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-label="Bunyan">
      <rect x="2" y="2" width="60" height="60" rx="14" fill="#0C1929" stroke="#20344F" strokeWidth="1.5" />
      {/* Outer pointed arch */}
      <path
        d="M16 50 V32 C16 21 23 13 32 11 C41 13 48 21 48 32 V50"
        stroke="#D4A853"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Inner pointed arch */}
      <path
        d="M24 50 V33 C24 27 27 22 32 20 C37 22 40 27 40 33 V50"
        stroke="#C4932E"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Central light */}
      <circle cx="32" cy="36" r="3.2" fill="#E0C687" />
    </svg>
  )
}
