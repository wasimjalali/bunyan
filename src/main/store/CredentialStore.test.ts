import { describe, it, expect } from 'vitest'
import { CredentialStore, type SecretCipher, type TokenBox } from './CredentialStore'

// A reversible stand-in for safeStorage: "encrypts" by tagging + base64 so a
// test can prove the value at rest is never the plaintext, and decrypt reverses
// it. isAvailable is configurable to exercise the fail-loud path.
function fakeCipher(available = true): SecretCipher {
  return {
    isAvailable: () => available,
    encrypt: (plain) => `enc:${Buffer.from(plain, 'utf8').toString('base64')}`,
    decrypt: (b64) => {
      if (!b64.startsWith('enc:')) throw new Error('not ciphertext')
      return Buffer.from(b64.slice(4), 'base64').toString('utf8')
    },
  }
}

// In-memory persistence so the store logic is testable without electron-store.
function memoryBox(): TokenBox & { data: Record<string, string> } {
  const data: Record<string, string> = {}
  return {
    data,
    read: () => ({ ...data }),
    write: (next) => {
      for (const k of Object.keys(data)) delete data[k]
      Object.assign(data, next)
    },
  }
}

describe('CredentialStore', () => {
  it('round-trips a token for a section', () => {
    const store = new CredentialStore(fakeCipher(), memoryBox())
    store.setToken('personal', 'tok-personal')
    expect(store.getToken('personal')).toBe('tok-personal')
  })

  it('returns null for a section with no token', () => {
    const store = new CredentialStore(fakeCipher(), memoryBox())
    expect(store.getToken('professional')).toBeNull()
  })

  it('keeps the two sections independent', () => {
    const store = new CredentialStore(fakeCipher(), memoryBox())
    store.setToken('personal', 'tok-personal')
    expect(store.getToken('professional')).toBeNull()
    store.setToken('professional', 'tok-work')
    expect(store.getToken('personal')).toBe('tok-personal')
    expect(store.getToken('professional')).toBe('tok-work')
  })

  it('clearing one section leaves the other intact', () => {
    const store = new CredentialStore(fakeCipher(), memoryBox())
    store.setToken('personal', 'tok-personal')
    store.setToken('professional', 'tok-work')
    store.clearToken('professional')
    expect(store.getToken('professional')).toBeNull()
    expect(store.getToken('personal')).toBe('tok-personal')
  })

  it('persists ciphertext, never the plaintext token', () => {
    const box = memoryBox()
    const store = new CredentialStore(fakeCipher(), box)
    store.setToken('personal', 'super-secret-token')
    const atRest = box.read().personal
    expect(atRest).toBeDefined()
    expect(atRest).not.toContain('super-secret-token')
    expect(atRest).toMatch(/^enc:/)
  })

  it('reports per-section status: none when unset, saved when a readable token exists', () => {
    const store = new CredentialStore(fakeCipher(), memoryBox())
    expect(store.status()).toEqual({ professional: 'none', personal: 'none' })
    store.setToken('personal', 'tok-personal')
    expect(store.status()).toEqual({ professional: 'none', personal: 'saved' })
  })

  it('fails loud and writes nothing when encryption is unavailable', () => {
    const box = memoryBox()
    const store = new CredentialStore(fakeCipher(false), box)
    expect(() => store.setToken('personal', 'tok')).toThrow()
    expect(box.read().personal).toBeUndefined()
  })

  it('marks a section unreadable (not saved, not a silent default) when its ciphertext cannot be decrypted', () => {
    const box = memoryBox()
    // Simulate a rotated OS key: the box holds bytes the cipher rejects.
    box.write({ personal: 'garbage-not-ciphertext' })
    const store = new CredentialStore(fakeCipher(), box)
    // getToken degrades to null so the spawn path can't crash...
    expect(store.getToken('personal')).toBeNull()
    // ...but status tells the truth, so the UI won't show a reassuring "saved".
    expect(store.status().personal).toBe('unreadable')
  })

  it('degrades instead of throwing when the token store itself cannot be read', () => {
    const throwingBox: TokenBox = {
      read: () => {
        throw new Error('corrupt credentials.json')
      },
      write: () => {},
    }
    const store = new CredentialStore(fakeCipher(), throwingBox)
    // A corrupt store must not crash the session-spawn path...
    expect(() => store.getToken('professional')).not.toThrow()
    expect(store.getToken('professional')).toBeNull()
    // ...and status surfaces the problem rather than pretending nothing is set.
    expect(store.status()).toEqual({ professional: 'unreadable', personal: 'unreadable' })
  })
})
