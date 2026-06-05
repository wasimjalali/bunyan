import type { SessionStatus } from '@shared/types'

interface StatusDotProps {
  status: SessionStatus | null
}

// Functional status treatments derived from the brand gold (spec section 5):
// working = filled gold with a soft glow, needs-input = hollow gold ring,
// idle = muted fill, exited = dimmed muted.
export function StatusDot({ status }: StatusDotProps): React.JSX.Element {
  switch (status) {
    case 'working':
      return (
        <span
          aria-label="working"
          className="inline-block h-2 w-2 rounded-full bg-gold shadow-[0_0_6px_rgba(212,168,83,0.85)]"
        />
      )
    case 'needs-input':
      return (
        <span
          aria-label="needs your input"
          className="inline-block h-2.5 w-2.5 rounded-full border-2 border-gold bg-transparent"
        />
      )
    case 'exited':
      return (
        <span aria-label="exited" className="inline-block h-2 w-2 rounded-full bg-idle opacity-50" />
      )
    case 'idle':
    default:
      return <span aria-label="idle" className="inline-block h-2 w-2 rounded-full bg-idle" />
  }
}
