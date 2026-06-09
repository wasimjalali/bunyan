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
    <div className="absolute right-3 top-3 z-30 flex items-center gap-1 rounded-lg border border-line bg-surface p-1 shadow-xl">
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
        ↑
      </SearchButton>
      <SearchButton title="Next (Enter)" onClick={() => find(true)}>
        ↓
      </SearchButton>
      <SearchButton title="Close (Esc)" onClick={close}>
        ×
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
    <button
      title={props.title}
      onClick={props.onClick}
      className="flex h-6 w-6 items-center justify-center rounded text-ink-dim hover:bg-line hover:text-ink"
    >
      {props.children}
    </button>
  )
}
