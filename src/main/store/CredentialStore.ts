import { PROJECT_SECTIONS, type ProjectSection } from '@shared/types'
import type { ClaudeAccountStatus } from '@shared/ipc'

/**
 * Encrypts/decrypts a secret with the OS secure-storage backend. The production
 * implementation (see safe-credential-store.ts) wraps Electron safeStorage,
 * which is backed by the macOS Keychain; tests inject a reversible fake.
 */
export interface SecretCipher {
  /** False when no OS backend is available (e.g. a headless Linux box). */
  isAvailable(): boolean
  /** Encrypt plaintext, returning base64 ciphertext safe to persist as JSON. */
  encrypt(plain: string): string
  /** Reverse encrypt(); throws if the ciphertext can't be read (e.g. key rotated). */
  decrypt(b64: string): string
}

/** Where the per-section ciphertext lives at rest (electron-store in production). */
export interface TokenBox {
  read(): Partial<Record<ProjectSection, string>>
  write(data: Partial<Record<ProjectSection, string>>): void
}

/**
 * Holds one Claude OAuth token per rail section, encrypted at rest. The token is
 * what actually isolates two logins on macOS: CLAUDE_CONFIG_DIR separates
 * settings/history but NOT the login (that lives in a single shared Keychain
 * item), so each section instead injects its own CLAUDE_CODE_OAUTH_TOKEN, which
 * bypasses the Keychain entirely. The plaintext token never leaves the main
 * process: it arrives once over IPC when the user sets it, is encrypted here,
 * and is only ever decrypted to seed a freshly spawned PTY's environment.
 */
export class CredentialStore {
  constructor(
    private readonly cipher: SecretCipher,
    private readonly box: TokenBox,
  ) {}

  /** Encrypt and store a section's token. Fails loud rather than storing plaintext. */
  setToken(section: ProjectSection, token: string): void {
    if (!this.cipher.isAvailable()) {
      throw new Error(
        'OS secure storage is unavailable; refusing to store a Claude token unencrypted',
      )
    }
    const next = this.box.read()
    next[section] = this.cipher.encrypt(token)
    this.box.write(next)
  }

  clearToken(section: ProjectSection): void {
    const next = this.box.read()
    if (next[section] === undefined) return
    delete next[section]
    this.box.write(next)
  }

  /**
   * The decrypted token for a section, or null if none is set or it can't be
   * read. Never throws: a corrupt store or undecryptable ciphertext degrades to
   * null so the session-spawn path can't be crashed by it. The matching status()
   * reports 'unreadable' for that section, so the failure is surfaced loudly in
   * the UI rather than silently masquerading as a working login.
   */
  getToken(section: ProjectSection): string | null {
    const stored = this.readBox()
    const cipherText = stored?.[section]
    if (cipherText === undefined) return null
    try {
      return this.cipher.decrypt(cipherText)
    } catch {
      return null
    }
  }

  /**
   * Per-section credential state for the UI. Decrypting here is the app reading
   * its OWN safeStorage data (no user prompt), which lets us distinguish a stored
   * token that works ('saved') from one that can't be read ('unreadable', e.g.
   * the OS key changed) rather than showing a misleading "saved" for a token the
   * spawn path would silently drop.
   */
  status(): ClaudeAccountStatus {
    const stored = this.readBox()
    const out = {} as ClaudeAccountStatus
    for (const section of PROJECT_SECTIONS) {
      const cipherText = stored?.[section]
      // stored === null means the store itself can't be read (corrupt file): we
      // can't tell what's saved, so flag for re-entry rather than pretending none.
      if (stored === null) out[section] = 'unreadable'
      else if (cipherText === undefined) out[section] = 'none'
      else out[section] = this.canDecrypt(cipherText) ? 'saved' : 'unreadable'
    }
    return out
  }

  /** Read the token store, or null if it can't be read (e.g. a corrupt file). */
  private readBox(): Partial<Record<ProjectSection, string>> | null {
    try {
      return this.box.read()
    } catch {
      return null
    }
  }

  /** Whether ciphertext decrypts cleanly, without exposing the plaintext. */
  private canDecrypt(cipherText: string): boolean {
    try {
      this.cipher.decrypt(cipherText)
      return true
    } catch {
      return false
    }
  }
}
