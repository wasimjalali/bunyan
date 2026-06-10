import { useId } from 'react'

interface BunyanMarkProps {
  size?: number
  /**
   * Which colour treatment to render. Pass the app's theme mode:
   * - 'dark'  → cream tile with navy moons + a gold slash (pops on the dark navy canvas)
   * - 'light' → navy tile with gold moons + a gold slash (pops on the light cream canvas)
   * Defaults to 'dark', the app's default mode.
   */
  theme?: 'dark' | 'light'
}

/**
 * The Bunyan mark: one rounded 3D tile holding a single glyph, crescent / crescent.
 * The two angle brackets of the old </> code glyph are replaced by crescent moons
 * that cradle the slash (each moon opening toward it), fusing the brand crescent
 * into the code slash. Matches build/icon/icon.svg.
 *
 * Two variants, chosen by `theme` so the mark always pops on its background. Each is
 * a stack: a tile (body + top sheen) inside a soft drop shadow, then the glyph, scaled
 * to 0.74 around the centre so it keeps even padding on every edge. Each crescent is an
 * outer disc minus an offset cut disc (a mask), which gives the moon its cusps.
 * Gradient/mask/filter ids are namespaced with useId because the mark appears more than
 * once per page.
 */
export function BunyanMark({ size = 24, theme = 'dark' }: BunyanMarkProps): React.JSX.Element {
  const id = useId()
  const isDark = theme === 'dark'

  // Glyph: gold slash in both; moons are navy on the cream tile, gold on the navy tile.
  const moonFill = isDark ? `url(#${id}-navyglyph)` : `url(#${id}-gold)`
  const slashFill = `url(#${id}-gold)`

  // Tile: cream in dark mode, navy in light mode.
  const tileFill = isDark ? `url(#${id}-cream)` : `url(#${id}-navy)`
  const tileStroke = isDark ? '#DCC79A' : '#0C1F37'
  const sheenFill = isDark ? `url(#${id}-cream-sheen)` : `url(#${id}-navy-sheen)`

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-label="Bunyan">
      <defs>
        <linearGradient id={`${id}-cream`} x1="0" y1="2" x2="0" y2="62" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FCF6E6" />
          <stop offset="0.5" stopColor="#F4E8CE" />
          <stop offset="1" stopColor="#E6D2A8" />
        </linearGradient>
        <linearGradient id={`${id}-cream-sheen`} x1="0" y1="2" x2="0" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.7" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>

        <linearGradient id={`${id}-navy`} x1="0" y1="2" x2="0" y2="62" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#244873" />
          <stop offset="0.5" stopColor="#16304D" />
          <stop offset="1" stopColor="#0C1929" />
        </linearGradient>
        <linearGradient id={`${id}-navy-sheen`} x1="0" y1="2" x2="0" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.18" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>

        <linearGradient id={`${id}-gold`} x1="10" y1="14" x2="52" y2="50" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFF4CE" />
          <stop offset="0.4" stopColor="#EBC061" />
          <stop offset="0.75" stopColor="#C7972F" />
          <stop offset="1" stopColor="#946417" />
        </linearGradient>
        <linearGradient id={`${id}-navyglyph`} x1="10" y1="16" x2="52" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2E548A" />
          <stop offset="0.6" stopColor="#1C3C68" />
          <stop offset="1" stopColor="#102843" />
        </linearGradient>

        <filter id={`${id}-tile-drop`} x="-25%" y="-25%" width="150%" height="160%">
          <feDropShadow dx="0" dy="2.2" stdDeviation="2" floodColor="#000000" floodOpacity="0.38" />
        </filter>

        {/* Left moon "(": outer disc minus a disc offset to the right. */}
        <mask id={`${id}-cl`} maskUnits="userSpaceOnUse">
          <rect x="0" y="0" width="64" height="64" fill="black" />
          <circle cx="19" cy="32" r="13.5" fill="white" />
          <circle cx="24.6" cy="32" r="12.4" fill="black" />
        </mask>
        {/* Right moon ")": outer disc minus a disc offset to the left. */}
        <mask id={`${id}-cr`} maskUnits="userSpaceOnUse">
          <rect x="0" y="0" width="64" height="64" fill="black" />
          <circle cx="45" cy="32" r="13.5" fill="white" />
          <circle cx="39.4" cy="32" r="12.4" fill="black" />
        </mask>
      </defs>

      {/* Rounded tile: body, then a top sheen, inside a soft drop shadow */}
      <rect x="3" y="3" width="58" height="58" rx="14.5" fill={tileFill} filter={`url(#${id}-tile-drop)`} stroke={tileStroke} strokeWidth="0.75" />
      <rect x="3" y="3" width="58" height="58" rx="14.5" fill={sheenFill} />

      {/* Glyph scaled to 0.74 around the tile centre for even padding on every edge */}
      <g transform="translate(32 32) scale(0.74) translate(-32 -32)">
        <circle cx="19" cy="32" r="13.5" fill={moonFill} mask={`url(#${id}-cl)`} />
        <circle cx="45" cy="32" r="13.5" fill={moonFill} mask={`url(#${id}-cr)`} />
        <path d="M27.6 45 L36.4 19" stroke={slashFill} strokeWidth="3.7" strokeLinecap="round" fill="none" />
      </g>
    </svg>
  )
}
