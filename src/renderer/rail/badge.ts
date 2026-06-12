// The one gold badge style the rail uses ("needs you" on sessions, "N live" on
// projects). Shared so a design change to rail badges is a one-place edit.
export const railBadgeClass =
  'rounded bg-gold/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gold'

// The project initial chip: glossy enamel with a deep espresso letter that
// stays readable on every project shade, gold-ringed when the project owns the
// active session. Shared by the rail row and the hover card so they can't drift.
export function projectChipClass(active: boolean): string {
  return [
    'chip-gloss flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-semibold text-espresso',
    active ? 'chip-gloss-active' : '',
  ].join(' ')
}
