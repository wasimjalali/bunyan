import fs from 'node:fs'

// Where macOS keeps its installed locale definitions. We check this to confirm a
// candidate locale actually exists before handing it to the shell, so we never
// set a LANG that setlocale() can't honour.
const LOCALE_DIR = '/usr/share/locale'

// en_US.UTF-8 ships on every macOS install, so it's the always-safe fallback.
const FALLBACK_LOCALE = 'en_US.UTF-8'

// The locale env vars a user (or a wrapping terminal) may have set. If ANY of
// these is present we leave the environment untouched: the user's choice wins.
const LOCALE_VARS = ['LC_ALL', 'LC_CTYPE', 'LANG'] as const

/**
 * Decide whether to inject a LANG into a freshly spawned shell's environment.
 *
 * WHY THIS EXISTS: an app launched from Finder is started by launchd, which
 * passes no LANG/LC_* at all. Terminal.app and iTerm2 are launched the same way,
 * but they synthesize a UTF-8 LANG from the macOS locale before spawning a shell.
 * We don't, so on machines whose /etc/zprofile doesn't backfill one, the shell
 * lands in the C/POSIX locale (US-ASCII charmap). In that locale every multibyte
 * char counts as N bytes instead of one display column, so the line editor,
 * pagers, prompts and tools like ls/git mis-measure width and corrupt the cell
 * grid xterm draws and copies from. The visible symptom: German (umlauts, eszett,
 * euro sign) copies out dirty. The fix is to do what real terminals do: give the
 * shell a UTF-8 locale when nothing else has.
 *
 * Returns the extra env entries to merge (just LANG), or an empty object when the
 * environment already carries a locale and must be left alone.
 *
 * @param env       the environment the PTY would otherwise spawn with
 * @param osLocale  the OS UI locale (Electron app.getLocale(), e.g. "en-US");
 *                  falls back to the JS runtime's locale when not supplied
 * @param localeDir override the locale-definition dir (tests only)
 */
export function resolveLocaleEnv(
  env: NodeJS.ProcessEnv,
  osLocale?: string,
  localeDir: string = LOCALE_DIR,
): { LANG?: string } {
  // Never override a locale the user (or their profile) already set.
  for (const v of LOCALE_VARS) {
    if (env[v] && env[v]!.trim() !== '') return {}
  }

  const candidate = toUtf8Locale(osLocale)
  const chosen = localeExists(candidate, localeDir) ? candidate : FALLBACK_LOCALE
  return { LANG: chosen }
}

// Turn an OS locale tag ("en-US", "de_DE", "en") into a POSIX UTF-8 locale name
// ("en_US.UTF-8"). A bare language with no region can't form a valid xx_XX name,
// so we let the caller fall back to en_US.UTF-8 by returning a name that won't
// exist on disk.
function toUtf8Locale(osLocale?: string): string {
  const tag = (osLocale ?? runtimeLocale()).trim()
  if (tag === '') return FALLBACK_LOCALE

  // Split off any script/variant; we only want language and region.
  const parts = tag.replace(/_/g, '-').split('-')
  const lang = parts[0]?.toLowerCase() ?? ''
  // Region is the first 2-letter ALL-CAPS-able segment after the language.
  const region = parts.slice(1).find((p) => /^[A-Za-z]{2}$/.test(p))?.toUpperCase()

  if (lang === '' || region === undefined) {
    // No usable region: return the language alone, which won't match an xx_XX
    // dir, so the caller falls back to en_US.UTF-8.
    return lang === '' ? FALLBACK_LOCALE : `${lang}.UTF-8`
  }
  return `${lang}_${region}.UTF-8`
}

function localeExists(candidate: string, localeDir: string): boolean {
  // Guard against a candidate with no region (e.g. "en.UTF-8"): those dirs don't
  // exist on macOS, so existsSync returns false and we fall back. Good.
  try {
    return fs.existsSync(`${localeDir}/${candidate}`)
  } catch {
    return false
  }
}

function runtimeLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale
  } catch {
    return FALLBACK_LOCALE
  }
}
