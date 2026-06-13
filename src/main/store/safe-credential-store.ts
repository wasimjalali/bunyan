import Store from 'electron-store'
import { safeStorage } from 'electron'
import type { ProjectSection } from '@shared/types'
import { CredentialStore, type SecretCipher, type TokenBox } from './CredentialStore'

interface Persisted {
  /** base64 ciphertext per section. Plaintext tokens never touch this file. */
  tokens?: Partial<Record<ProjectSection, string>>
}

/**
 * The production CredentialStore: tokens encrypted with Electron safeStorage
 * (macOS Keychain-backed) and persisted as ciphertext in a `credentials.json`
 * separate from the renderer-owned workspace store, so a token can never leak
 * into the plaintext workspace save.
 */
export function createCredentialStore(): CredentialStore {
  const store = new Store<Persisted>({ name: 'credentials' })
  const cipher: SecretCipher = {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (plain) => safeStorage.encryptString(plain).toString('base64'),
    decrypt: (b64) => safeStorage.decryptString(Buffer.from(b64, 'base64')),
  }
  const box: TokenBox = {
    read: () => store.get('tokens', {}),
    write: (data) => store.set('tokens', data),
  }
  return new CredentialStore(cipher, box)
}
