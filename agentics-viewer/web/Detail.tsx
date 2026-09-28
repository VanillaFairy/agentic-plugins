import type { JSX } from 'preact'
import { useRef } from 'preact/hooks'
import type { NodeView } from './model.ts'
import { kindWord, fileLabel, returnInWords, ago, spendText, vscodeLink } from './model.ts'
import { inlineMarkdown } from './markdown.ts'
import type { Approval, Snapshot } from '../shared/snapshot.ts'
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

export function Detail(props: { view: NodeView; snapshot: Snapshot; now: number }): JSX.Element {
  const { view, snapshot, now } = props
  const node = view.node
  const fallbackRef = useRef<HTMLInputElement | null>(null)

  function copyPath(path: string): void {
    const clipboard = navigator.clipboard
    if (clipboard && typeof clipboard.writeText === 'function') {
      clipboard.writeText(path).catch(() => selectFallback(path))
    } else {
      selectFallback(path)
    }
  }

  function selectFallback(path: string): void {
    const input = fallbackRef.current
    if (input === null) return
    input.value = path
    input.select()
  }

  const firstLine = [view.id, kindWord(node.kind), node.rigor, node.status]
    .filter((part) => part.trim() !== '')
    .join(', ')

  const isParked = node.status === 'parked'
  const isEscalated = node.status === 'escalated'
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

  return (
    <div class="detail" aria-label="Selected node">
      <div class="d-id">{firstLine}</div>
      <div class="d-name">{view.name}</div>
      {node.title !== '' && <p class="d-title">{node.title}</p>}

      {(isParked || isEscalated) && (
        <div class={isEscalated ? 'state stop' : 'state'}>
          <div class="h">
            <i class={`lamp l-${view.lamp}`}></i>
            {isParked ? `Waiting on you: ${returnInWords(event?.return ?? '')}` : 'Escalated'}
          </div>
          {isParked && event?.question && <p>{event.question}</p>}
          {isEscalated && event?.reason && <p>{event.reason}</p>}
          {isEscalated && event?.detail && <p>{event.detail}</p>}
        </div>
      )}

      {activeLine !== null && <p class="d-sub">{activeLine}</p>}
      {approvalParts.length > 0 && <p class="d-sub">{approvalParts.join(', ')}</p>}

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
            <span>Spec in {node.files.spec.path}</span>
            {node.files.spec.line !== null && <span>line {node.files.spec.line}</span>}
          </a>
          <button class="copy" aria-label="Copy path" onClick={() => copyPath(node.files.spec.path)}>
            ⧉
          </button>
        </div>
        {node.files.briefs.map((path) => (
          <div class="linkrow" key={path}>
            <a href={vscodeLink(path)}>{fileLabel(path, 'brief')}</a>
            <button class="copy" aria-label="Copy path" onClick={() => copyPath(path)}>
              ⧉
            </button>
          </div>
        ))}
        {node.files.reports.map((path) => (
          <div class="linkrow" key={path}>
            <a href={vscodeLink(path)}>{fileLabel(path, 'report')}</a>
            <button class="copy" aria-label="Copy path" onClick={() => copyPath(path)}>
              ⧉
            </button>
          </div>
        ))}
        {node.worktree !== null && (
          <div class="linkrow">
            <a href={vscodeLink(node.worktree)}>Worktree</a>
            <button class="copy" aria-label="Copy path" onClick={() => copyPath(node.worktree!)}>
              ⧉
            </button>
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
