import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { getPaneHandles, focusPaneTerminal } from '../terminal/registry'

const DECORATIONS = {
  matchBackground: '#C4932E',
  matchOverviewRuler: '#D4A853',
  activeMatchBackground: '#D4A853',
  activeMatchColorOverviewRuler: '#E0C687',
}

/** In-terminal search (Cmd-F) over the focused pane, using the xterm search addon. */
export function SearchBar(): React.JSX.Element | null {
  const open = useStore((s) => s.ui.searchOpen)
  const setSearch = useStore((s) => s.setSearch)
  const focusedPaneId = useStore((s) => s.focusedPaneId)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  // The last pane we painted match decorations on. Decorations live on the
  // terminal, not in React, so when focus moves (or search closes) we have to
  // clear the pane we left behind by hand. Read via ref so the effect doesn't
  // re-run on every keystroke.
  const prevPaneRef = useRef<string | null>(null)
  const queryRef = useRef(query)
  queryRef.current = query

  useEffect(() => {
    const prev = prevPaneRef.current
    if (open) {
      inputRef.current?.focus()
      if (focusedPaneId !== prev) {
        // Focus moved while search is open: strip highlights off the old pane,
        // then re-run the search on the new one so the highlights follow focus.
        if (prev) getPaneHandles(prev)?.search.clearDecorations()
        if (focusedPaneId && queryRef.current !== '') {
          getPaneHandles(focusedPaneId)?.search.findNext(queryRef.current, {
            decorations: DECORATIONS,
            incremental: false,
          })
        }
      }
    } else {
      // Closing: clear the current pane (the one that has live highlights) and
      // the previous one, in case focus moved without a re-search in between.
      if (focusedPaneId) getPaneHandles(focusedPaneId)?.search.clearDecorations()
      if (prev && prev !== focusedPaneId) getPaneHandles(prev)?.search.clearDecorations()
    }
    prevPaneRef.current = focusedPaneId
  }, [open, focusedPaneId])

  if (!open) return null

  const search = focusedPaneId ? getPaneHandles(focusedPaneId)?.search : undefined

  const find = (forward: boolean): void => {
    if (!search || query === '') return
    const opts = { decorations: DECORATIONS }
    if (forward) search.findNext(query, opts)
    else search.findPrevious(query, opts)
  }

  const close = (): void => {
    search?.clearDecorations()
    setSearch(false)
    if (focusedPaneId) focusPaneTerminal(focusedPaneId)
  }

  return (
    <div className="menu menu-in absolute right-3 top-3 z-30 flex items-center gap-1 p-1">
      <input
        ref={inputRef}
        autoFocus
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            find(!e.shiftKey)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            close()
          }
        }}
        placeholder="Find"
        className="w-44 bg-transparent px-2 py-1 text-sm text-ink outline-none placeholder:text-ink-dim"
      />
      <SearchButton title="Previous (Shift Enter)" onClick={() => find(false)}>
        <ChevronGlyph dir="up" />
      </SearchButton>
      <SearchButton title="Next (Enter)" onClick={() => find(true)}>
        <ChevronGlyph dir="down" />
      </SearchButton>
      <SearchButton title="Close (Esc)" onClick={close}>
        <CloseGlyph />
      </SearchButton>
    </div>
  )
}

function SearchButton(props: {
  title: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button title={props.title} aria-label={props.title} onClick={props.onClick} className="icon-btn h-6 w-6">
      {props.children}
    </button>
  )
}

function ChevronGlyph({ dir }: { dir: 'up' | 'down' }): React.JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d={dir === 'up' ? 'M4 10 L8 6 L12 10' : 'M4 6 L8 10 L12 6'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CloseGlyph(): React.JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4 L12 12 M12 4 L4 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
