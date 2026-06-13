// Pure payload validators for every renderer -> main channel. Every IPC handler
// runs its input through these before touching native resources. Failures throw
// a generic Error; handlers translate that into a rejected invoke. See spec 7.2.

import { LIMITS, isAbsoluteOrTildePath } from '@shared/ipc'
import type {
  SessionCreateRequest,
  SessionWriteRequest,
  SessionResizeRequest,
  SessionKillRequest,
  SessionAckRequest,
  GitBranchRequest,
  OpenInEditorRequest,
  NotifyPrefs,
  CredSetRequest,
  CredSectionRequest,
} from '@shared/ipc'
import { EDITOR_CHOICES, PROJECT_SECTIONS } from '@shared/types'
import type { BellMode, EditorChoice, ProjectSection, SessionKind } from '@shared/types'

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
    projectName: o.projectName === undefined ? undefined : str(o.projectName, 'projectName', 256),
    runOnStart: o.runOnStart === undefined ? undefined : safeCommand(o.runOnStart),
    claudeConfigDir:
      o.claudeConfigDir === undefined ? undefined : configDirPath(o.claudeConfigDir),
    section: o.section === undefined ? undefined : projectSection(o.section),
  }
}

// One of the two known rail sections. Anything else is rejected so a malformed
// section can't be used to look up (or skip) the wrong account's token.
function projectSection(v: unknown): ProjectSection {
  const s = str(v, 'section', 32)
  if (!(PROJECT_SECTIONS as readonly string[]).includes(s)) {
    fail('section is not a valid project section')
  }
  return s as ProjectSection
}

export function validateCredSet(raw: unknown): CredSetRequest {
  const o = asObject(raw)
  return { section: projectSection(o.section), token: secretToken(o.token) }
}

export function validateCredSection(raw: unknown): CredSectionRequest {
  const o = asObject(raw)
  return { section: projectSection(o.section) }
}

// A Claude OAuth token (from `claude setup-token`): a single-line secret. We
// trim surrounding whitespace (a pasted token often carries a trailing newline)
// but reject interior control chars so it can't smuggle a second env assignment
// across the PTY boundary, and bound the length so a paste accident can't bloat
// the encrypted store.
function secretToken(v: unknown): string {
  const s = str(v, 'token', 8192).trim()
  if (s === '') fail('token must not be empty')
  if (hasControlChars(s)) fail('token must be a single plain line')
  return s
}

// Control chars (incl. newline/NUL/DEL) can split one value into a second env
// assignment or truncate a path/command at the native boundary; reject them in
// every value that crosses into a spawned shell's environment or argv.
function hasControlChars(s: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[\x00-\x1f\x7f]/.test(s)
}

// A CLAUDE_CONFIG_DIR path, not a command: it must be absolute (or ~/-relative)
// with no control chars, so a compromised renderer can't smuggle arbitrary env
// into spawned shells.
function configDirPath(v: unknown): string {
  const s = str(v, 'claudeConfigDir', 1024)
  if (hasControlChars(s)) fail('claudeConfigDir must be a plain path')
  if (!isAbsoluteOrTildePath(s)) fail('claudeConfigDir must be an absolute or ~/ path')
  return s
}

// A start-up command must be a short single line (no control chars, no newline
// injection). The renderer only ever sends "claude"; this keeps it honest.
function safeCommand(v: unknown): string {
  const s = str(v, 'runOnStart', 64)
  if (hasControlChars(s)) fail('runOnStart must be a single plain line')
  return s
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

export function validateAck(raw: unknown): SessionAckRequest {
  const o = asObject(raw)
  return {
    paneId: id(o.paneId, 'paneId'),
    // A finite positive integer of chars drained. The upper bound is generous
    // (16M) but finite so a malformed ack can't poison the watermark accounting.
    chars: dim(o.chars, 'chars', 1, 16_000_000),
  }
}

export function validateGitBranch(raw: unknown): GitBranchRequest {
  const o = asObject(raw)
  return { path: str(o.path, 'path') }
}

export function validateOpenInEditor(raw: unknown): OpenInEditorRequest {
  const o = asObject(raw)
  const path = str(o.path, 'path')
  if (path.length === 0) fail('path must not be empty')
  // NUL bytes can truncate a path when it crosses into native APIs; reject them.
  if (path.includes('\0')) fail('path must not contain NUL')
  // Only absolute paths are openable. The renderer joins relatives against the
  // pane cwd and the main handler expands a leading "~" before calling this.
  if (!path.startsWith('/')) fail('path must be absolute')
  const editor = str(o.editor, 'editor', 16) as EditorChoice
  if (!EDITOR_CHOICES.includes(editor)) fail('editor is not a valid choice')
  return {
    path,
    line: o.line === undefined ? undefined : dim(o.line, 'line', 1, 1_000_000),
    col: o.col === undefined ? undefined : dim(o.col, 'col', 1, 1_000_000),
    editor,
  }
}

const BELL_MODES: readonly BellMode[] = ['status-only', 'sound', 'off']
export function validateNotifyPrefs(raw: unknown): NotifyPrefs {
  const o = asObject(raw)
  if (typeof o.notifications !== 'boolean') fail('notifications must be a boolean')
  const bell = str(o.bell, 'bell', 16) as BellMode
  if (!BELL_MODES.includes(bell)) fail('bell is not a valid mode')
  // 0 disables; cap at 1 hour so a fat-fingered value can't park a timer forever.
  const silenceAlertSeconds = dim(o.silenceAlertSeconds, 'silenceAlertSeconds', 0, 3600)
  return { notifications: o.notifications, bell, silenceAlertSeconds }
}

function asObject(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null) fail('payload must be an object')
  return raw as Record<string, unknown>
}

export { ValidationError }
