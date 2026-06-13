import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { makeId } from '@shared/id'
import { EDITOR_CHOICES, PROJECT_SECTIONS } from '@shared/types'
import type {
  BellMode,
  CursorStyle,
  EditorChoice,
  ProjectSection,
  Snippet,
  ThemeChoice,
} from '@shared/types'
import { isAbsoluteOrTildePath } from '@shared/ipc'
import type { ClaudeAccountState } from '@shared/ipc'

const EDITOR_LABELS: Record<EditorChoice, string> = {
  vscode: 'VS Code',
  cursor: 'Cursor',
  zed: 'Zed',
  windsurf: 'Windsurf',
}

/** In-app settings (not a separate window), per spec 10.5. Live, no restart. */
export function SettingsPanel(): React.JSX.Element | null {
  const open = useStore((s) => s.ui.settingsOpen)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const settings = useStore((s) => s.workspace.settings)
  const update = useStore((s) => s.updateSettings)

  // Escape closes from anywhere while the panel is open.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setSettingsOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setSettingsOpen])

  if (!open) return null

  return (
    <div
      className="overlay-backdrop fixed inset-0 z-40 flex items-start justify-center bg-deep-navy/55 pt-[10vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) setSettingsOpen(false)
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <div className="overlay-panel panel flex max-h-[80vh] w-[460px] max-w-[92vw] flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="font-[family-name:var(--font-wordmark)] text-[17px] font-semibold tracking-tight text-ink">
            Settings
          </h2>
          <button
            onClick={() => setSettingsOpen(false)}
            aria-label="Close settings"
            className="icon-btn h-7 w-7"
          >
            <CloseGlyph />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto px-5 py-5">
          <Group label="Appearance">
            <Row label="Theme">
              <Select<ThemeChoice>
                value={settings.theme}
                options={[
                  ['dark', 'Dark'],
                  ['light', 'Light'],
                  ['system', 'System'],
                ]}
                onChange={(theme) => update({ theme })}
              />
            </Row>
            <Row label="Font family">
              <input
                value={settings.fontFamily}
                onChange={(e) => update({ fontFamily: e.target.value })}
                className="input w-48"
              />
            </Row>
            <Row label="Font size">
              <input
                type="number"
                min={9}
                max={28}
                value={settings.fontSize}
                onChange={(e) => update({ fontSize: clampSize(Number(e.target.value)) })}
                className="input w-20 text-right tabular-nums"
              />
            </Row>
            <Row label="Cursor">
              <Select<CursorStyle>
                value={settings.cursorStyle}
                options={[
                  ['block', 'Block'],
                  ['bar', 'Bar'],
                  ['underline', 'Underline'],
                ]}
                onChange={(cursorStyle) => update({ cursorStyle })}
              />
            </Row>
            <Row label="Sidebar side" caption="Which side the projects rail docks to">
              <Select<'left' | 'right'>
                value={settings.railSide}
                options={[
                  ['right', 'Right'],
                  ['left', 'Left'],
                ]}
                onChange={(railSide) => update({ railSide })}
              />
            </Row>
          </Group>

          <Group label="Notifications">
            <Row label="Bell">
              <Select<BellMode>
                value={settings.bell}
                options={[
                  ['status-only', 'Status only'],
                  ['sound', 'Sound'],
                  ['off', 'Off'],
                ]}
                onChange={(bell) => update({ bell })}
              />
            </Row>
            <Row label="Desktop notifications">
              <Toggle on={settings.notifications} onChange={(notifications) => update({ notifications })} />
            </Row>
            <Row label="Silence alert" caption="Notify when a working session goes quiet">
              <input
                type="number"
                min={0}
                max={3600}
                value={settings.silenceAlertSeconds}
                onChange={(e) => update({ silenceAlertSeconds: clampSilence(Number(e.target.value)) })}
                title="Seconds (0 disables)"
                className="input w-20 text-right tabular-nums"
              />
            </Row>
          </Group>

          <Group label="Sessions">
            <Row label="Auto-sort projects" caption="Bring projects with running sessions to the top">
              <Toggle
                on={settings.autoSortProjects}
                onChange={(autoSortProjects) => update({ autoSortProjects })}
              />
            </Row>
            <Row label="Relaunch Claude on restore">
              <Toggle
                on={settings.claudeAutoRelaunch}
                onChange={(claudeAutoRelaunch) => update({ claudeAutoRelaunch })}
              />
            </Row>
            <Row label="Default shell">
              <input
                value={settings.defaultShell}
                onChange={(e) => update({ defaultShell: e.target.value })}
                placeholder="Default ($SHELL)"
                className="input w-48"
              />
            </Row>
            <Row label="Open files in">
              <Select<EditorChoice>
                value={settings.editor}
                options={EDITOR_CHOICES.map((id) => [id, EDITOR_LABELS[id]])}
                onChange={(editor) => update({ editor })}
              />
            </Row>
            <Row
              label="Confirm multiline paste"
              caption="Ask before pasting multiple lines into a shell without bracketed paste"
            >
              <Toggle on={settings.pasteWarning} onChange={(pasteWarning) => update({ pasteWarning })} />
            </Row>
            <Row
              label="Option key sends Meta"
              caption="Enables Option plus arrow and readline word shortcuts"
            >
              <Toggle on={settings.optionAsMeta} onChange={(optionAsMeta) => update({ optionAsMeta })} />
            </Row>
          </Group>

          <Group label="Claude accounts">
            <ClaudeAccounts />
          </Group>

          <Group label="Snippets">
            <Snippets snippets={settings.snippets} onChange={(snippets) => update({ snippets })} />
          </Group>
        </div>
      </div>
    </div>
  )
}

const SECTION_LABELS: Record<ProjectSection, string> = {
  professional: 'Professional',
  personal: 'Personal',
}

/**
 * Per-section Claude account setup. Two things isolate a section: an optional
 * config dir (CLAUDE_CONFIG_DIR, for settings/history) and an OAuth token
 * (CLAUDE_CODE_OAUTH_TOKEN, the actual login). On macOS the token is what truly
 * separates accounts, since the login otherwise lives in one shared Keychain
 * item. The token is held encrypted in the main process, so this UI only ever
 * sends it (write-only) and reads back a saved/not-saved flag.
 */
function ClaudeAccounts(): React.JSX.Element {
  const settings = useStore((s) => s.workspace.settings)
  const update = useStore((s) => s.updateSettings)
  const credStatus = useStore((s) => s.credStatus)
  const setToken = useStore((s) => s.setClaudeToken)
  const clearToken = useStore((s) => s.clearClaudeToken)

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs leading-relaxed text-ink-dim">
        Keep each section on its own Claude login. On macOS the login lives in one shared Keychain
        item, so signing in per section is not enough; run{' '}
        <code className="rounded bg-canvas px-1 py-0.5 text-[11px] text-ink">claude setup-token</code>{' '}
        while signed into that account and paste the token below. A section with no token shares
        your default account. Changes apply to new sessions; restart a running session to switch
        its account.
      </p>
      {PROJECT_SECTIONS.map((section) => (
        <ClaudeAccountRow
          key={section}
          label={SECTION_LABELS[section]}
          configDir={settings.claudeConfigDirs[section]}
          onConfigDir={(value) =>
            update({ claudeConfigDirs: { ...settings.claudeConfigDirs, [section]: value } })
          }
          state={credStatus[section]}
          onSaveToken={(token) => setToken(section, token)}
          onClearToken={() => clearToken(section)}
        />
      ))}
    </div>
  )
}

function ClaudeAccountRow(props: {
  label: string
  configDir: string
  onConfigDir: (value: string) => void
  state: ClaudeAccountState
  onSaveToken: (token: string) => Promise<void>
  onClearToken: () => Promise<void>
}): React.JSX.Element {
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const saved = props.state === 'saved'
  const unreadable = props.state === 'unreadable'

  // Fail loud on a malformed config dir: a non-empty path that isn't absolute or
  // ~/-relative is dropped by the spawn path, silently falling back to the
  // default account. Surface that instead of letting it merge accounts quietly.
  const dir = props.configDir.trim()
  const dirInvalid = dir !== '' && !isAbsoluteOrTildePath(dir)

  const save = async (): Promise<void> => {
    if (token.trim() === '' || busy) return
    setBusy(true)
    setError(null)
    try {
      await props.onSaveToken(token)
      setToken('')
    } catch {
      setError('Could not save the token. Your OS secure storage may be unavailable.')
    } finally {
      setBusy(false)
    }
  }

  const clear = async (): Promise<void> => {
    setError(null)
    try {
      await props.onClearToken()
    } catch {
      setError('Could not clear the token.')
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-canvas/50 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-ink">{props.label}</span>
        {saved || unreadable ? (
          <span
            className={['flex items-center gap-1.5 text-xs', unreadable ? 'text-error' : 'text-gold'].join(
              ' ',
            )}
          >
            <span aria-hidden>●</span>
            <span>{unreadable ? 'Token unreadable, re-enter' : 'Token saved'}</span>
            <button onClick={() => void clear()} className="icon-btn ml-1 px-1.5 py-0.5 text-ink-dim">
              Clear
            </button>
          </span>
        ) : (
          <span className="text-xs text-ink-dim">Using default account</span>
        )}
      </div>
      <input
        value={props.configDir}
        onChange={(e) => props.onConfigDir(e.target.value)}
        placeholder="Config dir, e.g. ~/.claude-personal (optional)"
        aria-invalid={dirInvalid}
        className="input w-full"
      />
      {dirInvalid && (
        <span className="text-xs text-error">
          Use an absolute or ~/ path. This value is ignored, so the section falls back to your
          default account.
        </span>
      )}
      <div className="flex items-center gap-2">
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save()
          }}
          placeholder={saved ? 'Paste a new token to replace' : 'Paste setup-token output'}
          className="input w-full"
        />
        <button
          onClick={() => void save()}
          disabled={token.trim() === '' || busy}
          className="btn-primary shrink-0 px-3.5 py-1.5 text-sm"
        >
          Save
        </button>
      </div>
      {error && <span className="text-xs text-error">{error}</span>}
    </div>
  )
}

function Snippets(props: {
  snippets: Snippet[]
  onChange: (snippets: Snippet[]) => void
}): React.JSX.Element {
  const [name, setName] = useState('')
  const [text, setText] = useState('')

  const add = (): void => {
    if (name.trim() === '' || text.trim() === '') return
    props.onChange([...props.snippets, { id: makeId('snip'), name: name.trim(), text }])
    setName('')
    setText('')
  }

  const remove = (id: string): void => {
    props.onChange(props.snippets.filter((s) => s.id !== id))
  }

  return (
    <div className="flex flex-col gap-2.5">
      {props.snippets.length > 0 && (
        <ul className="flex flex-col gap-1">
          {props.snippets.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-2 rounded-lg border border-line bg-canvas/50 px-2.5 py-1.5"
            >
              <span className="text-sm text-ink">{s.name}</span>
              <span className="flex-1 truncate text-xs text-ink-dim">{s.text.slice(0, 40)}</span>
              <button
                onClick={() => remove(s.id)}
                aria-label={`Remove ${s.name}`}
                className="icon-btn h-5 w-5 text-xs"
              >
                <CloseGlyph />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Snippet name"
        className="input w-full"
      />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Prompt text"
        className="input w-full resize-none"
      />
      <button
        onClick={add}
        disabled={name.trim() === '' || text.trim() === ''}
        className="btn-primary self-start px-3.5 py-1.5 text-sm"
      >
        Add snippet
      </button>
    </div>
  )
}

function clampSize(n: number): number {
  if (Number.isNaN(n)) return 13
  return Math.min(28, Math.max(9, Math.round(n)))
}

function clampSilence(n: number): number {
  if (Number.isNaN(n)) return 0
  return Math.min(3600, Math.max(0, Math.round(n)))
}

/** A labelled group of settings rows: an uppercase section label, then content. */
function Group(props: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="flex flex-col gap-3.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-widest text-ink-dim">
        {props.label}
      </h3>
      {props.children}
    </section>
  )
}

function Row(props: {
  label: string
  caption?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 flex-col">
        <span className="text-sm text-ink">{props.label}</span>
        {props.caption && <span className="text-xs leading-snug text-ink-dim">{props.caption}</span>}
      </div>
      {props.children}
    </div>
  )
}

/**
 * A brand-styled dropdown. We render our own listbox rather than a native
 * <select> so the closed control and the open menu both sit on the navy/gold
 * palette. The menu is fixed-positioned from the trigger rect so it escapes the
 * settings panel's own scroll clipping, and closes on scroll/resize so it can't
 * drift. Keyboard: Enter/Space/ArrowDown opens; arrows move; Enter selects;
 * Escape closes.
 */
function Select<T extends string>(props: {
  value: T
  options: Array<[T, string]>
  onChange: (value: T) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const selectedIndex = Math.max(
    0,
    props.options.findIndex(([v]) => v === props.value),
  )
  const currentLabel = props.options[selectedIndex]?.[1] ?? ''

  const openMenu = (): void => {
    const r = triggerRef.current?.getBoundingClientRect()
    if (!r) return
    setRect(r)
    setActive(selectedIndex)
    setOpen(true)
  }
  const close = (): void => setOpen(false)
  const choose = (value: T): void => {
    props.onChange(value)
    setOpen(false)
    triggerRef.current?.focus()
  }

  // A scroll or resize would strand the fixed menu; close rather than chase it.
  useEffect(() => {
    if (!open) return
    const dismiss = (): void => setOpen(false)
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', dismiss)
    return () => {
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('resize', dismiss)
    }
  }, [open])

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        openMenu()
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(props.options.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const opt = props.options[active]
      if (opt) choose(opt[0])
    } else if (e.key === 'Tab') {
      close()
    }
  }

  return (
    <div className="relative w-48">
      <button
        ref={triggerRef}
        type="button"
        className="select-trigger w-full"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
      >
        <span className="truncate">{currentLabel}</span>
        <svg
          className="select-chevron shrink-0"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M4 6.5 8 10.5 12 6.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && rect && (
        <>
          <div className="fixed inset-0 z-40" aria-hidden="true" onClick={close} />
          <ul
            role="listbox"
            className="menu menu-in fixed z-50 max-h-64 overflow-y-auto"
            style={{ top: rect.bottom + 4, left: rect.left, width: rect.width }}
          >
            {props.options.map(([val, label], i) => (
              <li key={val} role="option" aria-selected={val === props.value}>
                <button
                  type="button"
                  className="menu-item justify-between text-ink"
                  data-active={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(val)}
                >
                  <span className="truncate">{label}</span>
                  {val === props.value && (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path
                        d="M3.5 8.5 6.5 11.5 12.5 4.5"
                        stroke="var(--color-gold)"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function Toggle(props: { on: boolean; onChange: (on: boolean) => void }): React.JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={props.on}
      onClick={() => props.onChange(!props.on)}
      className={[
        'relative h-5 w-9 shrink-0 rounded-full transition-colors',
        props.on ? 'bg-gold' : 'bg-line',
      ].join(' ')}
    >
      <span
        className={[
          'absolute top-0.5 h-4 w-4 rounded-full bg-cream shadow-sm transition-all',
          props.on ? 'left-[18px]' : 'left-0.5',
        ].join(' ')}
      />
    </button>
  )
}

/** A crisp × glyph (no emoji, consistent stroke with the rest of the icon set). */
function CloseGlyph(): React.JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 4 L12 12 M12 4 L4 12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}
