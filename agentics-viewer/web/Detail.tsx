import type { JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import type { BoardModel, NodeView } from './model.ts'
import { kindWord, fileLabel, returnInWords, ago, vscodeLink, needsYou, claudePrompt, claudeCodeLink, projectPath, cardFacts, subtreeSpend } from './model.ts'
import { inlineMarkdown } from './markdown.ts'
import { Spend } from './Spend.tsx'
import type { Approval, Progress, ProgressState, Snapshot, SnapshotNode } from '../shared/snapshot.ts'
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
  if (['merged', 'integrated', 'landed', 'done', 'not_earned'].includes(node.status)) return 'good'
  return needsYou(node) ?? 'ongoing'
}

const COPIED_MS = 1500

function ProgressMark(props: { state: ProgressState }): JSX.Element {
  switch (props.state) {
    case 'done':
      return (
        <svg class="mark" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <circle cx="7" cy="7" r="6.5" fill="currentColor" />
          <path d="M4 7.2l2 2 4-4.4" fill="none" stroke="var(--panel)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      )
    case 'working':
      return (
        <svg class="mark" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" stroke-opacity="0.3" stroke-width="2" />
          <path class="spin" d="M7 1.5a5.5 5.5 0 0 1 5.5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      )
    default:
      return (
        <svg class="mark" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5" />
        </svg>
      )
  }
}

// The executor's pieces as it last wrote them. A file caught mid-rewrite says so instead of
// showing a shorter list; the write's completion brings the next snapshot.
function ProgressList(props: { progress: Progress }): JSX.Element {
  const { items, error } = props.progress
  if (items === null) return <p class="d-sub">Progress file unreadable: {error}</p>
  return (
    <ul class="progress">
      {items.map((it, i) => (
        <li key={i} class={`p-${it.state}`}>
          <ProgressMark state={it.state} />
          <span>{it.name}</span>
          {it.state === 'working' ? <span class="badge">working</span> : <span class="copy-fallback">{it.state}</span>}
        </li>
      ))}
    </ul>
  )
}

// Turns green with "Copied" only once the clipboard write succeeded; the select-text fallback
// copies nothing, so it leaves the button as it was.
function CopyButton(props: { text: string; label: string; copy: (text: string) => Promise<boolean> }): JSX.Element {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => clearTimeout(timer.current ?? undefined), [])

  function onClick(): void {
    void props.copy(props.text).then((ok) => {
      if (!ok) return
      setCopied(true)
      clearTimeout(timer.current ?? undefined)
      timer.current = setTimeout(() => setCopied(false), COPIED_MS)
    })
  }

  return (
    <>
      {copied && <span class="copied">Copied</span>}
      <button class={`copy${copied ? ' done' : ''}`} aria-label={props.label} onClick={onClick}>
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
  onClose: () => void
}): JSX.Element {
  const { view, model, snapshot, now, onSelect, onHighlight, onClose } = props
  const node = view.node
  const fallbackRef = useRef<HTMLInputElement | null>(null)

  function copyText(text: string): Promise<boolean> {
    const clipboard = navigator.clipboard
    if (clipboard && typeof clipboard.writeText === 'function') {
      return clipboard.writeText(text).then(
        () => true,
        () => {
          selectFallback(text)
          return false
        },
      )
    }
    selectFallback(text)
    return Promise.resolve(false)
  }

  function selectFallback(text: string): void {
    const input = fallbackRef.current
    if (input === null) return
    input.value = text
    input.select()
  }

  const idParts = [view.id, kindWord(node.kind), node.rigor].filter((part) => part.trim() !== '')

  const isParked = node.status === 'parked' && needsYou(node) === 'hold'
  const isEscalated = needsYou(node) === 'stop'
  const needsDesign = node.status === 'open'
  const prompt = claudePrompt(snapshot, node)
  const promptLink = prompt !== null ? claudeCodeLink(projectPath(snapshot), prompt) : null
  const facts = cardFacts(node)
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

  // agentics gives a plan entry its title as its intent; the title line above already shows it.
  const intent = node.intent.trim() === node.title.trim() ? '' : node.intent.trim()
  const context = node.context.trim()
  const showContext = intent !== '' || context !== ''

  const spend = subtreeSpend(model, snapshot.cost.per_leaf, view.id)

  const specFolder = view.folder !== null ? view.id : (node.parent ?? '.')
  const specLabel = specFolder === '.' ? 'DESIGN.md' : `${specFolder}/DESIGN.md`

  return (
    <div class="detail" aria-label="Selected node">
      <button type="button" class="d-close" aria-label="Close the detail panel" onClick={onClose}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <path d="M2 2l8 8M10 2l-8 8" />
        </svg>
      </button>
      <div class="d-id">
        {idParts.length > 0 ? `${idParts.join(', ')}, ` : ''}
        <span class={`d-status tone-${statusTone(node)}`}>{rolledUp ? view.wording : node.status}</span>
      </div>
      <div class="d-name">{view.name}</div>
      {node.title !== '' && <p class="d-title">{node.title}</p>}

      {(isParked || isEscalated || needsDesign) && (
        <div class={isEscalated ? 'state stop' : 'state'}>
          <div class="h">
            {isParked ? `Waiting on you: ${returnInWords(event?.return ?? '')}` : isEscalated ? 'Escalated' : 'Needs design'}
          </div>
          {isParked && event?.question && <p>{event.question}</p>}
          {isEscalated && event?.reason && <p>{event.reason}</p>}
          {isEscalated && event?.detail && <p>{event.detail}</p>}
        </div>
      )}

      {activeLine !== null && <p class="d-sub">{activeLine}</p>}
      {node.progress != null && <ProgressList progress={node.progress} />}
      {approvalParts.length > 0 && <p class="d-sub">{approvalParts.join(', ')}</p>}

      {prompt !== null && facts.length > 0 && (
        <dl class="card">
          {facts.map((fact, i) => (
            <div key={i}>
              <dt>{fact.label}</dt>
              <dd>{fact.text}</dd>
            </div>
          ))}
        </dl>
      )}

      {prompt !== null && (
        <div class="prompt-row" title={prompt}>
          <span>Prompt for Claude Code</span>
          <CopyButton key={prompt} text={prompt} label="Copy prompt for Claude Code" copy={copyText} />
          {promptLink !== null && (
            <a class="copy" href={promptLink} aria-label="Open in Claude Code">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true">
                <path d="M5 2.5H2a1 1 0 0 0-1 1V10a1 1 0 0 0 1 1h6.5a1 1 0 0 0 1-1V7" />
                <path d="M7 1h4v4M11 1L5.5 6.5" />
              </svg>
            </a>
          )}
        </div>
      )}

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
          <CopyButton key={node.files.spec.path} text={node.files.spec.path} label="Copy path" copy={copyText} />
        </div>
        {node.files.briefs.map((path) => (
          <div class="linkrow" key={path}>
            <a href={vscodeLink(path)}>{fileLabel(path, 'brief')}</a>
            <CopyButton text={path} label="Copy path" copy={copyText} />
          </div>
        ))}
        {node.files.reports.map((path) => (
          <div class="linkrow" key={path}>
            <a href={vscodeLink(path)}>{fileLabel(path, 'report')}</a>
            <CopyButton text={path} label="Copy path" copy={copyText} />
          </div>
        ))}
        {node.worktree !== null && (
          <div class="linkrow">
            <a href={vscodeLink(node.worktree)}>Worktree</a>
            <CopyButton key={node.worktree} text={node.worktree} label="Copy path" copy={copyText} />
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
          <div class="sec">{view.children.length > 0 ? 'Spend, all tasks below' : 'Spend'}</div>
          <Spend spend={spend} tip="above" />
        </>
      )}
    </div>
  )
}
