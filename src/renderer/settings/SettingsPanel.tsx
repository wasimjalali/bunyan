import { useEffect } from 'react'
import { useStore } from '../state/store'
import type { BellMode, CursorStyle, ThemeChoice } from '@shared/types'

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
              className="w-48 rounded-md border border-line bg-canvas px-2 py-1 text-sm text-ink outline-none placeholder:text-ink-dim focus:border-gold"
            />
          </Row>
        </div>
      </div>
    </div>
  )
}

function clampSize(n: number): number {
  if (Number.isNaN(n)) return 13
  return Math.min(28, Math.max(9, Math.round(n)))
}

function Row(props: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-ink-dim">{props.label}</span>
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
