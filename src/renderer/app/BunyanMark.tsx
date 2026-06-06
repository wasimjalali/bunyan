import { useId } from 'react'

interface BunyanMarkProps {
  size?: number
}

/**
 * The Bunyan mark: a pointed arch (classic Islamic architecture) rendered as
 * polished 3D gold on a bevelled deep-navy tile, matching build/icon/icon.svg.
 * Each arch is a stack of strokes (extrusion, base, core, specular) over a
 * soft cast shadow, with a glowing lamp at the centre. Gradient ids are
 * namespaced with useId because the mark appears more than once per page.
 */
export function BunyanMark({ size = 24 }: BunyanMarkProps): React.JSX.Element {
  const id = useId()
  const outer = 'M16 50 V32 C16 21 23 13 32 11 C41 13 48 21 48 32 V50'
  const inner = 'M24 50 V33 C24 27 27 22 32 20 C37 22 40 27 40 33 V50'
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-label="Bunyan">
      <defs>
        <linearGradient id={`${id}-tile`} x1="0" y1="2" x2="0" y2="62" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1D3F66" />
          <stop offset="0.55" stopColor="#102A47" />
          <stop offset="1" stopColor="#0A1624" />
        </linearGradient>
        <linearGradient id={`${id}-sheen`} x1="0" y1="2" x2="0" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.10" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-base`} x1="0" y1="11" x2="0" y2="53" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#F0D38C" />
          <stop offset="0.5" stopColor="#D2A648" />
          <stop offset="1" stopColor="#9C741F" />
        </linearGradient>
        <linearGradient id={`${id}-core`} x1="0" y1="11" x2="0" y2="53" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFEDB8" />
          <stop offset="1" stopColor="#C4932E" />
        </linearGradient>
        <linearGradient id={`${id}-base-in`} x1="0" y1="11" x2="0" y2="53" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#D9B362" />
          <stop offset="1" stopColor="#85601A" />
        </linearGradient>
        <linearGradient id={`${id}-core-in`} x1="0" y1="11" x2="0" y2="53" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#F2D795" />
          <stop offset="1" stopColor="#A87E22" />
        </linearGradient>
        <radialGradient id={`${id}-sphere`} cx="0.38" cy="0.32" r="0.9">
          <stop offset="0" stopColor="#FFFEF7" />
          <stop offset="0.45" stopColor="#F6DD8C" />
          <stop offset="1" stopColor="#B5871D" />
        </radialGradient>
        <radialGradient id={`${id}-glow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#F4D77E" stopOpacity="0.55" />
          <stop offset="1" stopColor="#F4D77E" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-room`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#E8C97E" stopOpacity="0.16" />
          <stop offset="1" stopColor="#E8C97E" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}-shadow`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="0.9" />
        </filter>
      </defs>

      {/* Tile: gradient body, top sheen, hairline edge */}
      <rect x="2" y="2" width="60" height="60" rx="14" fill={`url(#${id}-tile)`} stroke="#20344F" strokeWidth="1" />
      <rect x="2" y="2" width="60" height="60" rx="14" fill={`url(#${id}-sheen)`} />

      {/* Ambient lamp light washing over the tile behind the arch */}
      <circle cx="32" cy="34.5" r="25" fill={`url(#${id}-room)`} />

      {/* Soft shadow the arches cast onto the tile */}
      <g
        transform="translate(0 1.25)"
        filter={`url(#${id}-shadow)`}
        stroke="#000000"
        strokeOpacity="0.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={outer} strokeWidth="3.1" />
        <path d={inner} strokeWidth="2.4" />
      </g>

      {/* Outer arch: extrusion lip, base metal, bright core, specular sweep */}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d={outer} transform="translate(0 0.55)" stroke="#6E4F12" strokeWidth="3" />
        <path d={outer} stroke={`url(#${id}-base)`} strokeWidth="3" />
        <path d={outer} stroke={`url(#${id}-core)`} strokeWidth="1.6" />
      </g>

      {/* Inner arch, a step darker so it reads as recessed */}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d={inner} transform="translate(0 0.45)" stroke="#5C4210" strokeWidth="2.25" />
        <path d={inner} stroke={`url(#${id}-base-in)`} strokeWidth="2.25" />
        <path d={inner} stroke={`url(#${id}-core-in)`} strokeWidth="1.1" />
      </g>

      {/* Central light: halo, sphere, specular glint */}
      <circle cx="32" cy="36" r="8" fill={`url(#${id}-glow)`} />
      <circle cx="32" cy="36" r="3.2" fill={`url(#${id}-sphere)`} />
      <ellipse cx="30.9" cy="34.7" rx="1.05" ry="0.7" fill="#FFFFFF" fillOpacity="0.85" />
    </svg>
  )
}
