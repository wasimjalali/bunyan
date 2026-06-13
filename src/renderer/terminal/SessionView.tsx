import { useEffect, useRef } from 'react'
import type { ITheme } from '@xterm/xterm'
import type { CursorStyle, PaneNode, ProjectSection, Session } from '@shared/types'
import { listPanes } from '@shared/pane-tree'
import { TerminalPane } from './TerminalPane'

interface SessionViewProps {
  session: Session
  projectName: string
  /** Preferred shell from settings; empty means the main process uses $SHELL. */
  shell: string
  /** CLAUDE_CONFIG_DIR for this project's section; empty = the default account. */
  claudeConfigDir?: string
  /** The project's rail section, used to pick the section's Claude token in main. */
  section?: ProjectSection
  focusedPaneId: string | null
  restoreNotes: Record<string, string>
  theme: ITheme
  fontFamily: string
  fontSize: number
  cursorStyle: CursorStyle
  /** macOS: Option sends Meta instead of accents. */
  optionAsMeta: boolean
  /** This session is a broadcast target; its panes get a gold ring. */
  broadcasting: boolean
  onFocusPane: (paneId: string) => void
  onSetRatio: (path: Array<'a' | 'b'>, ratio: number) => void
}

/**
 * Renders a session's pane tree. Leaves are terminals; splits are flex
 * containers sized by the split ratio, with a draggable divider. The focused
 * pane gets a gold top border.
 */
export function SessionView(props: SessionViewProps): React.JSX.Element {
  return <div className="h-full w-full">{renderNode(props.session.layout, props, [])}</div>
}

// `path` is the sequence of a/b steps from the root to this node; split dividers
// use it to address themselves to setRatioAtPath so nested splits move
// independently of their parents.
function renderNode(
  node: PaneNode,
  props: SessionViewProps,
  path: Array<'a' | 'b'>,
): React.JSX.Element {
  if (node.type === 'leaf') {
    const focused = props.focusedPaneId === null || props.focusedPaneId === node.pane.id
    // Only the session's original (first) pane auto-launches Claude; splits are
    // plain shells alongside it.
    const isFirstPane = listPanes(props.session.layout)[0]?.id === node.pane.id
    const runOnStart =
      props.session.kind === 'claude' && props.session.autoRelaunch && isFirstPane
        ? 'claude'
        : undefined
    return (
      <div
        className={[
          'h-full w-full border-t-2',
          focused ? 'border-gold/70' : 'border-transparent',
          // A gold ring makes a broadcast target impossible to miss.
          props.broadcasting ? 'ring-1 ring-inset ring-gold/60' : '',
        ].join(' ')}
      >
        <TerminalPane
          pane={node.pane}
          sessionId={props.session.id}
          kind={props.session.kind}
          cwd={props.session.cwd}
          projectName={props.projectName}
          shell={props.shell}
          runOnStart={runOnStart}
          claudeConfigDir={props.claudeConfigDir}
          section={props.section}
          restoreNote={props.restoreNotes[node.pane.ptyId]}
          theme={props.theme}
          fontFamily={props.fontFamily}
          fontSize={props.fontSize}
          cursorStyle={props.cursorStyle}
          optionAsMeta={props.optionAsMeta}
          onFocus={() => props.onFocusPane(node.pane.id)}
        />
      </div>
    )
  }
  return <Split node={node} props={props} path={path} />
}

function Split({
  node,
  props,
  path,
}: {
  node: Extract<PaneNode, { type: 'split' }>
  props: SessionViewProps
  path: Array<'a' | 'b'>
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  // Holds the teardown for an in-flight drag, so unmounting mid-drag can't leak
  // window listeners or leave the resize cursor stuck.
  const stopDrag = useRef<(() => void) | null>(null)
  const isRow = node.dir === 'row'

  useEffect(() => () => stopDrag.current?.(), [])

  const startDrag = (e: React.MouseEvent): void => {
    e.preventDefault()
    const onMove = (ev: MouseEvent): void => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      props.onSetRatio(path, ratioFromPointer(ev, rect, isRow))
    }
    const stop = (): void => {
      document.body.style.cursor = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', stop)
      stopDrag.current = null
    }
    stopDrag.current = stop
    document.body.style.cursor = isRow ? 'col-resize' : 'row-resize'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', stop)
  }

  return (
    <div
      ref={containerRef}
      className={['flex h-full w-full', isRow ? 'flex-row' : 'flex-col'].join(' ')}
    >
      <div style={{ flexBasis: `${node.ratio * 100}%` }} className="min-h-0 min-w-0">
        {renderNode(node.a, props, [...path, 'a'])}
      </div>
      <div
        onMouseDown={startDrag}
        className={[
          'shrink-0 bg-line transition-colors hover:bg-gold/40',
          isRow ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize',
        ].join(' ')}
      />
      <div style={{ flexBasis: `${(1 - node.ratio) * 100}%` }} className="min-h-0 min-w-0">
        {renderNode(node.b, props, [...path, 'b'])}
      </div>
    </div>
  )
}

function ratioFromPointer(ev: MouseEvent, rect: DOMRect, isRow: boolean): number {
  return isRow ? (ev.clientX - rect.left) / rect.width : (ev.clientY - rect.top) / rect.height
}
