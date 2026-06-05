// Pure payload validators for every renderer -> main channel. Every IPC handler
// runs its input through these before touching native resources. Failures throw
// a generic Error; handlers translate that into a rejected invoke. See spec 7.2.

import { LIMITS } from '@shared/ipc'
import type {
  SessionCreateRequest,
  SessionWriteRequest,
  SessionResizeRequest,
  SessionKillRequest,
  GitBranchRequest,
} from '@shared/ipc'
import type { SessionKind } from '@shared/types'

class ValidationError extends Error {}

function fail(message: string): never {
  throw new ValidationError(message)
}

function str(v: unknown, name: string, maxLen = 4096): string {
  if (typeof v !== 'string') fail(`${name} must be a string`)
  if ((v as string).length > maxLen) fail(`${name} is too long`)
  return v as string
}

function id(v: unknown, name: string): string {
  const s = str(v, name, 128)
  if (s.length === 0) fail(`${name} must not be empty`)
  return s
}

function dim(v: unknown, name: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) fail(`${name} must be an integer`)
  const n = v as number
  if (n < min || n > max) fail(`${name} out of range`)
  return n
}

const KINDS: readonly SessionKind[] = ['shell', 'claude', 'custom']

export function validateCreate(raw: unknown): SessionCreateRequest {
  const o = asObject(raw)
  const kind = str(o.kind, 'kind', 16) as SessionKind
  if (!KINDS.includes(kind)) fail('kind is not a valid session kind')
  return {
    sessionId: id(o.sessionId, 'sessionId'),
    paneId: id(o.paneId, 'paneId'),
    kind,
    cwd: str(o.cwd, 'cwd'),
    shell: o.shell === undefined ? undefined : str(o.shell, 'shell'),
    cols: dim(o.cols, 'cols', LIMITS.minCols, LIMITS.maxCols),
    rows: dim(o.rows, 'rows', LIMITS.minRows, LIMITS.maxRows),
  }
}

export function validateWrite(raw: unknown): SessionWriteRequest {
  const o = asObject(raw)
  return {
    paneId: id(o.paneId, 'paneId'),
    data: str(o.data, 'data', LIMITS.maxWriteBytes),
  }
}

export function validateResize(raw: unknown): SessionResizeRequest {
  const o = asObject(raw)
  return {
    paneId: id(o.paneId, 'paneId'),
    cols: dim(o.cols, 'cols', LIMITS.minCols, LIMITS.maxCols),
    rows: dim(o.rows, 'rows', LIMITS.minRows, LIMITS.maxRows),
  }
}

export function validateKill(raw: unknown): SessionKillRequest {
  const o = asObject(raw)
  return { paneId: id(o.paneId, 'paneId') }
}

export function validateGitBranch(raw: unknown): GitBranchRequest {
  const o = asObject(raw)
  return { path: str(o.path, 'path') }
}

function asObject(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null) fail('payload must be an object')
  return raw as Record<string, unknown>
}

export { ValidationError }
