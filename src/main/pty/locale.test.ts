import { describe, it, expect } from 'vitest'
import { resolveLocaleEnv } from './locale'

// A locale dir that "contains" only the locales macOS always ships, so the test
// is deterministic and never touches the real /usr/share/locale. resolveLocaleEnv
// checks existsSync against this path; we point it at a dir that won't exist so we
// drive the existence check through the candidate name instead. To test the
// happy path we use the real dir for the well-known locales that always exist.
const REAL_LOCALE_DIR = '/usr/share/locale'

describe('resolveLocaleEnv', () => {
  it('leaves the env alone when LANG is already set', () => {
    const out = resolveLocaleEnv({ LANG: 'de_DE.UTF-8' }, 'en-US', REAL_LOCALE_DIR)
    expect(out).toEqual({})
  })

  it('leaves the env alone when LC_ALL is set (LC_ALL wins over everything)', () => {
    const out = resolveLocaleEnv({ LC_ALL: 'C' }, 'en-US', REAL_LOCALE_DIR)
    expect(out).toEqual({})
  })

  it('leaves the env alone when LC_CTYPE is set', () => {
    const out = resolveLocaleEnv({ LC_CTYPE: 'en_US.UTF-8' }, 'de-DE', REAL_LOCALE_DIR)
    expect(out).toEqual({})
  })

  it('treats an empty-string LANG as unset and injects a locale', () => {
    const out = resolveLocaleEnv({ LANG: '' }, 'en-US', REAL_LOCALE_DIR)
    expect(out.LANG).toBe('en_US.UTF-8')
  })

  it('derives xx_XX.UTF-8 from a hyphenated OS locale', () => {
    const out = resolveLocaleEnv({}, 'de-DE', REAL_LOCALE_DIR)
    expect(out.LANG).toBe('de_DE.UTF-8')
  })

  it('derives xx_XX.UTF-8 from an underscored OS locale', () => {
    const out = resolveLocaleEnv({}, 'fr_FR', REAL_LOCALE_DIR)
    expect(out.LANG).toBe('fr_FR.UTF-8')
  })

  it('always produces the xx_XX.UTF-8 shape', () => {
    const out = resolveLocaleEnv({}, 'pt-BR', REAL_LOCALE_DIR)
    expect(out.LANG).toMatch(/^[a-z]{2}_[A-Z]{2}\.UTF-8$/)
  })

  it('falls back to en_US.UTF-8 when the derived locale is not installed', () => {
    // zz_ZZ.UTF-8 will not exist under any sane locale dir.
    const out = resolveLocaleEnv({}, 'zz-ZZ', REAL_LOCALE_DIR)
    expect(out.LANG).toBe('en_US.UTF-8')
  })

  it('falls back when the OS locale has no region (language only)', () => {
    const out = resolveLocaleEnv({}, 'en', REAL_LOCALE_DIR)
    expect(out.LANG).toBe('en_US.UTF-8')
  })

  it('falls back when the candidate dir does not exist at all', () => {
    const out = resolveLocaleEnv({}, 'de-DE', '/no/such/locale/dir')
    expect(out.LANG).toBe('en_US.UTF-8')
  })

  it('falls back to en_US.UTF-8 when the OS locale is empty', () => {
    const out = resolveLocaleEnv({}, '', REAL_LOCALE_DIR)
    expect(out.LANG).toBe('en_US.UTF-8')
  })
})
