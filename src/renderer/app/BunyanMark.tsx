import { useId } from 'react'

interface BunyanMarkProps {
  size?: number
}

/**
 * The Bunyan mark: a thin 3D gold crescent on a cream tile, with a navy code
 * badge (the </> glyph in gold) nestled in the crescent's opening. Matches
 * build/icon/icon.svg. The crescent is built as a stack inside a soft drop
 * shadow: a dark extrusion disc, the gold body with a specular sweep, and a
 * bright rim light, all clipped to a crescent mask (outer disc minus an offset
 * disc). Gradient/mask/filter ids are namespaced with useId because the mark
 * appears more than once per page.
 */
export function BunyanMark({ size = 24 }: BunyanMarkProps): React.JSX.Element {
  const id = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-label="Bunyan">
      <defs>
        <linearGradient id={`${id}-cream`} x1="0" y1="2" x2="0" y2="62" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FCF6E6" />
          <stop offset="0.5" stopColor="#F4E8CE" />
          <stop offset="1" stopColor="#E6D2A8" />
        </linearGradient>
        <linearGradient id={`${id}-cream-sheen`} x1="0" y1="2" x2="0" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.75" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-cream-bottom`} x1="0" y1="32" x2="0" y2="62" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8A6A2C" stopOpacity="0" />
          <stop offset="1" stopColor="#7E5E22" stopOpacity="0.22" />
        </linearGradient>

        <linearGradient id={`${id}-gold`} x1="8" y1="10" x2="42" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFF4CE" />
          <stop offset="0.4" stopColor="#EBC061" />
          <stop offset="0.75" stopColor="#C7972F" />
          <stop offset="1" stopColor="#946417" />
        </linearGradient>
        <radialGradient id={`${id}-gold-spec`} cx="0.32" cy="0.24" r="0.55">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.18" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>

        <linearGradient id={`${id}-navy`} x1="0" y1="20" x2="0" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2E548A" />
          <stop offset="0.5" stopColor="#1C3C68" />
          <stop offset="1" stopColor="#102843" />
        </linearGradient>
        <linearGradient id={`${id}-navy-sheen`} x1="0" y1="20" x2="0" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.30" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-glyph`} x1="0" y1="22" x2="0" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFF1C4" />
          <stop offset="1" stopColor="#E0B255" />
        </linearGradient>

        <filter id={`${id}-tile-drop`} x="-25%" y="-25%" width="150%" height="160%">
          <feDropShadow dx="0" dy="2.4" stdDeviation="2.2" floodColor="#000000" floodOpacity="0.4" />
        </filter>
        <filter id={`${id}-cres-drop`} x="-50%" y="-50%" width="200%" height="220%">
          <feDropShadow dx="0" dy="2.6" stdDeviation="1.9" floodColor="#4A3408" floodOpacity="0.55" />
        </filter>
        <filter id={`${id}-badge-drop`} x="-50%" y="-50%" width="200%" height="220%">
          <feDropShadow dx="0" dy="2.2" stdDeviation="1.6" floodColor="#0A1626" floodOpacity="0.5" />
        </filter>

        <mask id={`${id}-cres`}>
          <rect width="64" height="64" fill="black" />
          <circle cx="27" cy="32" r="21" fill="white" />
          <circle cx="34.5" cy="29.5" r="19.8" fill="black" />
        </mask>
      </defs>

      {/* Cream tile: body, top sheen, soft bottom darkening */}
      <rect x="3" y="3" width="58" height="58" rx="15" fill={`url(#${id}-cream)`} filter={`url(#${id}-tile-drop)`} stroke="#DCC79A" strokeWidth="0.75" />
      <rect x="3" y="3" width="58" height="58" rx="15" fill={`url(#${id}-cream-sheen)`} />
      <rect x="3" y="3" width="58" height="58" rx="15" fill={`url(#${id}-cream-bottom)`} />

      {/* Artwork centred in the tile with even padding on all sides */}
      <g transform="translate(32 32) scale(0.86) translate(-30 -32)">
        {/* Thin gold crescent: dark extrusion, gold body + specular, rim light */}
        <g filter={`url(#${id}-cres-drop)`}>
          <circle cx="27" cy="33.3" r="21" fill="#7A5410" mask={`url(#${id}-cres)`} />
          <g mask={`url(#${id}-cres)`}>
            <circle cx="27" cy="32" r="21" fill={`url(#${id}-gold)`} />
            <circle cx="27" cy="32" r="21" fill={`url(#${id}-gold-spec)`} />
          </g>
          <circle cx="27" cy="32" r="20.4" fill="none" stroke="#FFF7DB" strokeWidth="0.9" strokeOpacity="0.85" mask={`url(#${id}-cres)`} />
        </g>

        {/* Navy code badge in the crescent opening: body, sheen, inner rim */}
        <g filter={`url(#${id}-badge-drop)`}>
          <rect x="31" y="21" width="23" height="23" rx="7" fill={`url(#${id}-navy)`} stroke="#0C1F37" strokeWidth="0.6" />
        </g>
        <rect x="31.6" y="21.6" width="21.8" height="13" rx="6" fill={`url(#${id}-navy-sheen)`} />
        <rect x="31.6" y="21.6" width="21.8" height="21.8" rx="6.4" fill="none" stroke="#5E83B8" strokeOpacity="0.45" strokeWidth="0.7" />

        {/* The </> glyph in gold */}
        <g stroke={`url(#${id}-glyph)`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M39 28 L35 32.5 L39 37" />
          <path d="M46 28 L50 32.5 L46 37" />
        </g>
        <path d="M44 26.5 L41 38.5" stroke={`url(#${id}-glyph)`} strokeWidth="2.1" strokeLinecap="round" />
      </g>
    </svg>
  )
}
