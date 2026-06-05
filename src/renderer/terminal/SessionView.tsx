import type { ITheme } from '@xterm/xterm'
import type { CursorStyle, PaneNode, Session } from '@shared/types'
import { TerminalPane } from './TerminalPane'

interface SessionViewProps {
  session: Session
  focusedPaneId: string | null
  restoreNotes: Record<string, string>
  theme: ITheme
  fontFamily: string
  fontSize: number
  cursorStyle: CursorStyle
  onFocusPane: (paneId: string) => void
}

/**
 * Renders a session's pane tree. Leaves are terminals; splits are flex
 * containers sized by the split ratio. The focused pane gets a gold top border.
 */
export function SessionView(props: SessionViewProps): React.JSX.Element {
  return <div className="h-full w-full">{renderNode(props.session.layout, props)}</div>
}

function renderNode(node: PaneNode, props: SessionViewProps): React.JSX.Element {
  if (node.type === 'leaf') {
    const focused = props.focusedPaneId === null || props.focusedPaneId === node.pane.id
    return (
      <div
        className={[
          'h-full w-full border-t-2',
          focused ? 'border-gold/70' : 'border-transparent',
        ].join(' ')}
      >
        <TerminalPane
          pane={node.pane}
          sessionId={props.session.id}
          kind={props.session.kind}
          cwd={props.session.cwd}
          restoreNote={props.restoreNotes[node.pane.ptyId]}
          theme={props.theme}
          fontFamily={props.fontFamily}
          fontSize={props.fontSize}
          cursorStyle={props.cursorStyle}
          onFocus={() => props.onFocusPane(node.pane.id)}
        />
      </div>
    )
  }

  const isRow = node.dir === 'row'
  const aPct = `${node.ratio * 100}%`
  const bPct = `${(1 - node.ratio) * 100}%`
  return (
    <div className={['flex h-full w-full', isRow ? 'flex-row' : 'flex-col'].join(' ')}>
      <div style={{ flexBasis: aPct }} className="min-h-0 min-w-0">
        {renderNode(node.a, props)}
      </div>
      <div className={isRow ? 'w-px bg-navy-line' : 'h-px bg-navy-line'} />
      <div style={{ flexBasis: bPct }} className="min-h-0 min-w-0">
        {renderNode(node.b, props)}
      </div>
    </div>
  )
}
