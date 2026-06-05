// Tiny shared drag state for rail reordering. We hold the payload in a module
// ref rather than the DataTransfer object, because DataTransfer.getData is not
// readable during dragover (only on drop), which makes drop-target logic awkward.

export type RailDrag =
  | { kind: 'project'; projectId: string }
  | { kind: 'session'; projectId: string; sessionId: string }
  | null

let current: RailDrag = null

export function setDrag(drag: RailDrag): void {
  current = drag
}

export function getDrag(): RailDrag {
  return current
}

export function clearDrag(): void {
  current = null
}
