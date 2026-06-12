import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { makeId } from '@shared/id'
import { EDITOR_CHOICES } from '@shared/types'
import type { BellMode, CursorStyle, EditorChoice, Snippet, ThemeChoice } from '@shared/types'

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
      className="overlay-backdrop fixed inset-0 z-40 flex items-start justify-center bg-black/40 pt-[10vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) setSettingsOpen(false)
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <div className="overlay-panel w-[440px] max-w-[92vw] rounded-xl border border-line bg-surface shadow-2xl">
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-[family-name:var(--font-wordmark)] text-base font-semibold text-ink">
            Settings
          </h2>
          <button
            onClick={() => setSettingsOpen(false)}
            className="flex h-6 w-6 items-center justify-center rounded text-ink-dim hover:bg-line hover:text-ink"
          >
            ×
          </button>
        </header>

        <div className="flex flex-col gap-3 p-4">
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
              className="w-48 rounded-md border border-line bg-canvas px-2 py-1 text-sm text-ink outline-none focus:border-gold"
            />
          </Row>

          <Row label="Font size">
            <input
              type="number"
              min={9}
              max={28}
              value={settings.fontSize}
              onChange={(e) => update({ fontSize: clampSize(Number(e.target.value)) })}
              className="w-20 rounded-md border border-line bg-canvas px-2 py-1 text-sm text-ink outline-none focus:border-gold"
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

          <Row label="Notifications">
            <Toggle on={settings.notifications} onChange={(notifications) => update({ notifications })} />
          </Row>

          <Row
            label="Auto-sort projects"
            caption="Bring projects with running sessions to the top"
          >
            <Toggle
              on={settings.autoSortProjects}
              onChange={(autoSortProjects) => update({ autoSortProjects })}
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

          <Row label="Silence alert" caption="Notify when a working session goes quiet">
            <input
              type="number"
              min={0}
              max={3600}
              value={settings.silenceAlertSeconds}
              onChange={(e) => update({ silenceAlertSeconds: clampSilence(Number(e.target.value)) })}
              title="Seconds (0 disables)"
              className="w-20 rounded-md border border-line bg-canvas px-2 py-1 text-sm text-ink outline-none focus:border-gold"
            />
          </Row>

          <Row label="Relaunch Claude on restore">
            <Toggle
              on={settings.claudeAutoRelaunch}
              onChange={(claudeAutoRelaunch) => update({ claudeAutoRelaunch })}
            />
          </Row>

          <div className="flex flex-col gap-2 border-t border-line pt-3">
            <span className="text-sm text-ink-dim">Claude accounts</span>
            <p className="text-xs leading-relaxed text-ink-dim/70">
              Give a section its own config folder to keep a separate Claude login, e.g.
              ~/.claude-personal. Leave empty for your default account. New sessions pick
              this up; run /login once in that section to sign in.
            </p>
            <Row label="Professional">
              <input
                value={settings.claudeConfigDirs.professional}
                onChange={(e) =>
                  update({
                    claudeConfigDirs: { ...settings.claudeConfigDirs, professional: e.target.value },
                  })
                }
                placeholder="Default (~/.claude)"
                className="w-48 rounded-md border border-line bg-canvas px-2 py-1 text-sm text-ink outline-none placeholder:text-ink-dim focus:border-gold"
              />
            </Row>
            <Row label="Personal">
              <input
                value={settings.claudeConfigDirs.personal}
                onChange={(e) =>
                  update({
                    claudeConfigDirs: { ...settings.claudeConfigDirs, personal: e.target.value },
                  })
                }
                placeholder="Default (~/.claude)"
                className="w-48 rounded-md border border-line bg-canvas px-2 py-1 text-sm text-ink outline-none placeholder:text-ink-dim focus:border-gold"
              />
            </Row>
          </div>

          <Row label="Default shell">
            <input
              value={settings.defaultShell}
              onChange={(e) => update({ defaultShell: e.target.value })}
              placeholder="Default ($SHELL)"
              className="w-48 rounded-md border border-line bg-canvas px-2 py-1 text-sm text-ink outline-none placeholder:text-ink-dim focus:border-gold"
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

          <Row label="Option key sends Meta" caption="Enables Option plus arrow and readline word shortcuts">
            <Toggle on={settings.optionAsMeta} onChange={(optionAsMeta) => update({ optionAsMeta })} />
          </Row>

          <Snippets
            snippets={settings.snippets}
            onChange={(snippets) => update({ snippets })}
          />
        </div>
      </div>
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
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <span className="text-sm text-ink-dim">Snippets</span>
      {props.snippets.length > 0 && (
        <ul className="flex flex-col gap-1">
          {props.snippets.map((s) => (
            <li key={s.id} className="flex items-center gap-2 rounded-md bg-canvas px-2 py-1">
              <span className="text-sm text-ink">{s.name}</span>
              <span className="flex-1 truncate text-xs text-ink-dim">{s.text.slice(0, 40)}</span>
              <button
                onClick={() => remove(s.id)}
                aria-label={`Remove ${s.name}`}
                className="flex h-5 w-5 items-center justify-center rounded text-ink-dim hover:bg-line hover:text-ink"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Snippet name"
        className="rounded-md border border-line bg-canvas px-2 py-1 text-sm text-ink outline-none placeholder:text-ink-dim focus:border-gold"
      />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Prompt text"
        className="resize-none rounded-md border border-line bg-canvas px-2 py-1 text-sm text-ink outline-none placeholder:text-ink-dim focus:border-gold"
      />
      <button
        onClick={add}
        disabled={name.trim() === '' || text.trim() === ''}
        className="self-start rounded-md bg-gold px-3 py-1.5 text-sm font-medium text-deep-navy hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-40"
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

function Row(props: {
  label: string
  caption?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col">
        <span className="text-sm text-ink-dim">{props.label}</span>
        {props.caption && <span className="text-xs text-ink-dim/70">{props.caption}</span>}
      </div>
      {props.children}
    </div>
  )
}

function Select<T extends string>(props: {
  value: T
  options: Array<[T, string]>
  onChange: (value: T) => void
}): React.JSX.Element {
  return (
    <select
      value={props.value}
      onChange={(e) => props.onChange(e.target.value as T)}
      className="w-48 rounded-md border border-line bg-canvas px-2 py-1 text-sm text-ink outline-none focus:border-gold"
    >
      {props.options.map(([val, label]) => (
        <option key={val} value={val}>
          {label}
        </option>
      ))}
    </select>
  )
}

function Toggle(props: { on: boolean; onChange: (on: boolean) => void }): React.JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={props.on}
      onClick={() => props.onChange(!props.on)}
      className={[
        'relative h-5 w-9 rounded-full transition-colors',
        props.on ? 'bg-gold' : 'bg-line',
      ].join(' ')}
    >
      <span
        className={['absolute top-0.5 h-4 w-4 rounded-full transition-all', props.on ? 'left-[18px]' : 'left-0.5'].join(
          ' ',
        )}
        style={{ backgroundColor: '#FEFDFB' }}
      />
    </button>
  )
}
