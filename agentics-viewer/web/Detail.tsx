import type { JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import type { BoardModel, NodeView } from './model.ts'
import { kindWord, fileLabel, returnInWords, ago, spendText, vscodeLink, needsYou } from './model.ts'
import { inlineMarkdown } from './markdown.ts'
import type { Approval, Snapshot, SnapshotNode } from '../shared/snapshot.ts'
import './detail.css'

function approvalWord(a: Approval): string {
  switch (a) {
    case 'approved':
      return 'approved'
    case 'prepared':
      return 'prepared'
    case 'edited':
      return 'edited since approval'
    default:
      return 'not approved'
  }
}

function commitWord(n: number): string {
  return n === 1 ? '1 commit' : `${n} commits`
}

// The status word is the most important thing on the panel, so it carries its own colour: green
// once nothing more is needed, amber when this node waits on you, red when it escalated, plain
// ink for everything still moving.
function statusTone(node: SnapshotNode): 'good' | 'hold' | 'stop' | 'ongoing' {
  if (node.status === 'merged' || node.status === 'integrated' || node.status === 'landed') return 'good'
  return needsYou(node) ?? 'ongoing'
}

const COPIED_MS = 1500

// Turns green with "Copied" only once the clipboard write succeeded; the select-text fallback
// copies nothing, so it leaves the button as it was.
function CopyButton(props: { path: string; copy: (path: string) => Promise<boolean> }): JSX.Element {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => clearTimeout(timer.current ?? undefined), [])

  function onClick(): void {
    void props.copy(props.path).then((ok) => {
      if (!ok) return
      setCopied(true)
      clearTimeout(timer.current ?? undefined)
      timer.current = setTimeout(() => setCopied(false), COPIED_MS)
    })
  }

  return (
    <>
      {copied && <span class="copied">Copied</span>}
      <button class={`copy${copied ? ' done' : ''}`} aria-label="Copy path" onClick={onClick}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true">
          <rect x="3.5" y="3.5" width="8" height="8" rx="1" />
          <path d="M8.5 3.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
        </svg>
      </button>
    </>
  )
}

const RELATIONS_FOLDED = 5

// One direction of the blocking relation, as rows that select the node and, under the pointer,
// ring it on the board. Folds past RELATIONS_FOLDED so a node with many blockers stays readable.
function Relations(props: {
  title: string
  ids: string[]
  model: BoardModel
  onSelect: (id: string) => void
  onHighlight: (ids: string[]) => void
}): JSX.Element | null {
  const [open, setOpen] = useState(false)
  if (props.ids.length === 0) return null
  const shown = open ? props.ids : props.ids.slice(0, RELATIONS_FOLDED)
  const hidden = props.ids.length - shown.length
  return (
    <>
      <div class="sec">
        {props.title} {props.ids.length}
      </div>
      <div class="rels">
        {shown.map((id) => {
          const other = props.model.nodes.get(id)
          return (
            <button
              type="button"
              key={id}
              class="rel"
              onClick={() => {
                props.onHighlight([])
                props.onSelect(id)
              }}
              onMouseEnter={() => props.onHighlight([id])}
              onMouseLeave={() => props.onHighlight([])}
            >
              <span class="nm">{other?.name ?? id}</span>
              {other !== undefined && other.status !== '' ? (
                <span class={`st badge t-${other.lamp}`}>{other.status}</span>
              ) : (
                <span class="st">{other?.wording ?? ''}</span>
              )}
            </button>
          )
        })}
        {hidden > 0 && (
          <button type="button" class="rel-more" onClick={() => setOpen(true)}>
            and {hidden} more
          </button>
        )}
      </div>
    </>
  )
}

export function Detail(props: {
  view: NodeView
  model: BoardModel
  snapshot: Snapshot
  now: number
  onSelect: (id: string) => void
  onHighlight: (ids: string[]) => void
}): JSX.Element {
  const { view, model, snapshot, now, onSelect, onHighlight } = props
  const node = view.node
  const fallbackRef = useRef<HTMLInputElement | null>(null)

  function copyPath(path: string): Promise<boolean> {
    const clipboard = navigator.clipboard
    if (clipboard && typeof clipboard.writeText === 'function') {
      return clipboard.writeText(path).then(
        () => true,
        () => {
          selectFallback(path)
          return false
        },
      )
    }
    selectFallback(path)
    return Promise.resolve(false)
  }

  function selectFallback(path: string): void {
    const input = fallbackRef.current
    if (input === null) return
    input.value = path
    input.select()
  }

  const idParts = [view.id, kindWord(node.kind), node.rigor].filter((part) => part.trim() !== '')

  const isParked = node.status === 'parked' && needsYou(node) === 'hold'
  const isEscalated = needsYou(node) === 'stop'
  const rolledUp = (node.status === 'parked' || node.status === 'escalated') && needsYou(node) === null
  const event = node.event

  const showActiveLine = node.status === 'active' && node.commits !== null && node.commits.count > 0
  const activeLine = showActiveLine
    ? `${node.stage ?? 'working'}, ${commitWord(node.commits!.count)}, last ${ago(node.commits!.last_at, now)}: ${node.commits!.last_subject}`
    : null

  const approvalParts: string[] = []
  if (view.folder !== null) {
    approvalParts.push(approvalWord(view.folder.approval))
    if (view.folder.blocking > 0) approvalParts.push(`${view.folder.blocking} blocking questions`)
  }

  const intent = node.intent.trim()
  const context = node.context.trim()
  const showContext = intent !== '' || context !== ''

  const spend = spendText(snapshot.cost, view.id)

  const specFolder = view.folder !== null ? view.id : (node.parent ?? '.')
  const specLabel = specFolder === '.' ? 'DESIGN.md' : `${specFolder}/DESIGN.md`

  return (
    <div class="detail" aria-label="Selected node">
      <div class="d-id">
        {idParts.length > 0 ? `${idParts.join(', ')}, ` : ''}
        <span class={`d-status tone-${statusTone(node)}`}>{rolledUp ? view.wording : node.status}</span>
      </div>
      <div class="d-name">{view.name}</div>
      {node.title !== '' && <p class="d-title">{node.title}</p>}

      {(isParked || isEscalated) && (
        <div class={isEscalated ? 'state stop' : 'state'}>
          <div class="h">
            {isParked ? `Waiting on you: ${returnInWords(event?.return ?? '')}` : 'Escalated'}
          </div>
          {isParked && event?.question && <p>{event.question}</p>}
          {isEscalated && event?.reason && <p>{event.reason}</p>}
          {isEscalated && event?.detail && <p>{event.detail}</p>}
        </div>
      )}

      {activeLine !== null && <p class="d-sub">{activeLine}</p>}
      {approvalParts.length > 0 && <p class="d-sub">{approvalParts.join(', ')}</p>}

      <Relations key={`w:${view.id}`} title="Waits on" ids={view.blockedBy} model={model} onSelect={onSelect} onHighlight={onHighlight} />
      <Relations key={`h:${view.id}`} title="Holds up" ids={view.holdsUp} model={model} onSelect={onSelect} onHighlight={onHighlight} />

      {showContext && (
        <>
          <div class="sec">Context</div>
          {intent !== '' && <p class="prose" dangerouslySetInnerHTML={{ __html: inlineMarkdown(intent) }} />}
          {context !== '' && <p class="prose" dangerouslySetInnerHTML={{ __html: inlineMarkdown(context) }} />}
        </>
      )}

      {node.acceptance.length > 0 && (
        <>
          <div class="sec">Criteria</div>
          <ul class="crit">
            {node.acceptance.map((c, i) => {
              const human = c.text.startsWith('HUMAN:')
              const text = human ? c.text.slice('HUMAN:'.length).trim() : c.text
              return (
                <li key={i}>
                  <span class="box"></span>
                  <span>
                    {human && <span class="you">You decide</span>}
                    {text}
                    {c.check !== '' && <code>{c.check}</code>}
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <div class="sec">Files</div>
      <div class="links">
        <div class="linkrow">
          <a href={vscodeLink(node.files.spec.path, node.files.spec.line)}>
            <span>Spec in {specLabel}</span>
            {node.files.spec.line !== null && <span>line {node.files.spec.line}</span>}
          </a>
          <CopyButton key={node.files.spec.path} path={node.files.spec.path} copy={copyPath} />
        </div>
        {node.files.briefs.map((path) => (
          <div class="linkrow" key={path}>
            <a href={vscodeLink(path)}>{fileLabel(path, 'brief')}</a>
            <CopyButton path={path} copy={copyPath} />
          </div>
        ))}
        {node.files.reports.map((path) => (
          <div class="linkrow" key={path}>
            <a href={vscodeLink(path)}>{fileLabel(path, 'report')}</a>
            <CopyButton path={path} copy={copyPath} />
          </div>
        ))}
        {node.worktree !== null && (
          <div class="linkrow">
            <a href={vscodeLink(node.worktree)}>Worktree</a>
            <CopyButton key={node.worktree} path={node.worktree} copy={copyPath} />
          </div>
        )}
      </div>
      <input class="copy-fallback" readOnly ref={fallbackRef} aria-hidden="true" tabIndex={-1} />

      {node.locus.length > 0 && (
        <>
          <div class="sec">Writes</div>
          <div class="meta">
            {node.locus.map((path) => (
              <>
                <b key={path}>{path}</b>
                <span></span>
              </>
            ))}
          </div>
        </>
      )}

      {spend !== null && (
        <>
          <div class="sec">Spend</div>
          <div class="meta">
            Tokens<b>{spend}</b>
          </div>
        </>
      )}
    </div>
  )
}
