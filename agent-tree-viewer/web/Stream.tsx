// The Activity tab: one transcript as a timeline, oldest at the top, what happens now at the bottom.

import { Fragment } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import type { AgentNode, AgentStatus, CallDetail, SessionSnapshot, Step } from '../shared/model.ts'
import { elapsed } from './layout.ts'
import { clockTime } from './time.ts'

// Hidden thinking shorter than this says nothing worth a line.
const QUIET_THOUGHT_MS = 5000

// A run of calls, with the hidden thinking between them as pauses.
type RunItem = { kind: 'call'; call: CallDetail } | { kind: 'pause'; at: number; took: number }

type Block =
  | { kind: 'prompt' | 'words' | 'handback'; at: number; text: string }
  | { kind: 'thought'; at: number; text: string; took: number }
  | { kind: 'calls'; at: number; items: RunItem[] }

const endOf = (step: Step) => (step.kind === 'call' ? (step.call.endedAt ?? step.at) : step.at)

// Calls in a row become one run. Hidden thinking, timed from the step before it, sits in the run
// as a pause when calls come on both sides of it, else on a line of its own; short spells drop out.
function blocksOf(steps: readonly Step[]): Block[] {
  const blocks: Block[] = []
  let lastEnd: number | undefined
  let hidden: { at: number; took: number } | undefined
  const settle = (next: Step | undefined) => {
    if (hidden === undefined) return
    const prev = blocks.at(-1)
    if (hidden.took >= QUIET_THOUGHT_MS) {
      if (next?.kind === 'call' && prev?.kind === 'calls') prev.items.push({ kind: 'pause', ...hidden })
      else blocks.push({ kind: 'thought', text: '', ...hidden })
    }
    hidden = undefined
  }
  for (const step of steps) {
    if (step.kind === 'thought' && step.text === '') {
      const since = Math.max(lastEnd ?? step.at, hidden?.at ?? -Infinity)
      hidden = { at: hidden?.at ?? step.at, took: (hidden?.took ?? 0) + step.at - since }
      lastEnd = step.at
      continue
    }
    settle(step)
    const prev = blocks.at(-1)
    if (step.kind === 'call') {
      if (prev?.kind === 'calls') prev.items.push({ kind: 'call', call: step.call })
      else blocks.push({ kind: 'calls', at: step.at, items: [{ kind: 'call', call: step.call }] })
    } else if (step.kind === 'thought') {
      blocks.push({ kind: 'thought', at: step.at, text: step.text, took: step.at - (lastEnd ?? step.at) })
    } else {
      blocks.push({ kind: step.kind, at: step.at, text: step.text })
    }
    lastEnd = endOf(step)
  }
  settle(undefined)
  return blocks
}

// Whether the bottom of the latest step, or of the latest call in a run, shows in `body`.
export function latestInView(body: HTMLElement): boolean {
  const steps = body.querySelectorAll('.stream > .step:not(.now):not(.end)')
  const last = steps[steps.length - 1]
  if (last === undefined) return true
  const row = (last.classList.contains('calls') ? last.querySelector('.call-run > :last-child') : null) ?? last
  const r = row.getBoundingClientRect()
  const view = body.getBoundingClientRect()
  return r.bottom <= view.bottom + 1 && r.bottom > view.top
}

function Clamp({ text, lines, class: cls }: { text: string; lines: number; class: string }) {
  const [open, setOpen] = useState(false)
  const long = text.length > lines * 90 || text.split('\n').length > lines
  return (
    <>
      <p class={`${cls}${long && !open ? ' clamped' : ''}`} style={{ '--lines': lines }}>
        {text}
      </p>
      {long && (
        <button class="link more" onClick={() => setOpen(!open)}>
          {open ? 'Show less' : 'Show all'}
        </button>
      )}
    </>
  )
}

type Where = { sessionId: string; nodeId: string }

// The call whole, fetched once it is open and the stream carries it cut short.
function useWholeCall(where: Where, call: CallDetail, open: boolean): CallDetail {
  const [whole, setWhole] = useState<CallDetail | undefined>(undefined)
  useEffect(() => {
    if (!open || call.clipped !== true) return
    let stop = false
    fetch(`/api/sessions/${encodeURIComponent(where.sessionId)}/nodes/${encodeURIComponent(where.nodeId)}/calls/${encodeURIComponent(call.id)}`)
      .then(res => (res.ok ? (res.json() as Promise<CallDetail>) : undefined))
      .then(got => !stop && got !== undefined && setWhole(got))
      .catch(() => {})
    return () => {
      stop = true
    }
  }, [open, call.clipped, call.endedAt, where.sessionId, where.nodeId, call.id])
  return whole !== undefined && whole.endedAt === call.endedAt ? whole : call
}

type CallRowProps = { where: Where; call: CallDetail; now: number; child: AgentNode | undefined; onPick: (id: string) => void }

function CallRow({ where, call: cut, now, child, onPick }: CallRowProps) {
  const [open, setOpen] = useState(false)
  const call = useWholeCall(where, cut, open)
  const state = call.endedAt === undefined ? 'open' : call.isError ? 'error' : 'done'
  const took = elapsed((call.endedAt ?? now) - call.startedAt)
  return (
    <li class={`call ${state}`}>
      <span class="mark" aria-hidden="true" />
      <button class="call-head" aria-expanded={open} onClick={() => setOpen(!open)} title={`Started ${clockTime(call.startedAt)}`}>
        <span class="call-tool">{call.tool}</span>
        <span class="call-arg">{call.arg}</span>
        <span class="call-took">{state === 'error' ? `failed, ${took}` : state === 'open' ? `running ${took}` : took}</span>
      </button>
      {child !== undefined && (
        <button class={`call-child ${child.status}`} onClick={() => onPick(child.id)}>
          <span class="status-dot" />
          Open {child.description}
        </button>
      )}
      {open && (
        <div class="call-body">
          {call.input.map(field => (
            <Fragment key={field.name}>
              <h4>{field.name.charAt(0).toUpperCase() + field.name.slice(1)}</h4>
              <pre>{field.text}</pre>
            </Fragment>
          ))}
          <h4>{state === 'error' ? 'Error' : 'Output'}</h4>
          {call.output !== undefined ? <pre>{call.output}</pre> : <p class="quiet-inline">{state === 'open' ? 'Still running.' : 'Nothing came back.'}</p>}
        </div>
      )}
    </li>
  )
}

const END_WORD: Record<Exclude<AgentStatus, 'running'>, string> = { completed: 'Done', failed: 'Failed', killed: 'Stopped' }

// The bottom of the spine: what the agent does this moment, or how it ended.
function Now({ agent, last, now }: { agent: AgentNode; last: Step | undefined; now: number }) {
  if (agent.status !== 'running') {
    return (
      <li class={`step end ${agent.status}`}>
        <span class="mark" aria-hidden="true" />
        <p>
          {END_WORD[agent.status]} after {elapsed((agent.endedAt ?? now) - agent.startedAt)}
          {agent.endedAt !== undefined && <span class="step-time">at {clockTime(agent.endedAt)}</span>}
        </p>
      </li>
    )
  }
  if (last?.kind === 'call' && last.call.endedAt === undefined) return null
  const since = last === undefined ? agent.startedAt : endOf(last)
  return (
    <li class="step now" aria-live="polite">
      <span class="mark" aria-hidden="true">
        ✻
      </span>
      <p>
        Thinking
        <span class="step-time">{elapsed(now - since)}</span>
      </p>
    </li>
  )
}

// The bottom of the main loop's spine, from what the session's process reports.
function MainNow({ main, last, now }: { main: SessionSnapshot['main']; last: Step | undefined; now: number }) {
  if (main.waitingFor !== undefined) {
    return (
      <li class="step now waiting" aria-live="polite">
        <span class="mark" aria-hidden="true">
          ✻
        </span>
        <p>Waiting on you: {main.waitingFor}</p>
      </li>
    )
  }
  if (!main.live || (last?.kind === 'call' && last.call.endedAt === undefined)) return null
  return (
    <li class="step now" aria-live="polite">
      <span class="mark" aria-hidden="true">
        ✻
      </span>
      <p>
        Working
        {last !== undefined && <span class="step-time">{elapsed(now - endOf(last))}</span>}
      </p>
    </li>
  )
}

type Props = {
  sessionId: string
  // The card: an agent id, or 'main'.
  nodeId: string
  steps: readonly Step[]
  // Absent for the main loop.
  agent: AgentNode | undefined
  main: SessionSnapshot['main']
  // The agents this transcript spawned, so a spawning call can open its agent.
  spawned: readonly AgentNode[]
  now: number
  onPick: (id: string) => void
}

export function Stream({ sessionId, nodeId, steps, agent, main, spawned, now, onPick }: Props) {
  const where = { sessionId, nodeId }
  if (steps.length === 0 && agent === undefined) return <p class="quiet-inline">Nothing in the transcript yet.</p>
  const byCall = new Map(spawned.flatMap(c => (c.callId === undefined ? [] : [[c.callId, c] as const])))
  return (
    <ol class="stream">
      {blocksOf(steps).map(block => {
        const key = `${block.kind}-${block.at}`
        switch (block.kind) {
          case 'prompt':
            return (
              <li key={key} class="step prompt">
                <span class="mark" aria-hidden="true" />
                <h4 title={clockTime(block.at)}>{agent === undefined ? 'Prompt' : 'Asked to'}</h4>
                <Clamp class="prompt-text" text={block.text} lines={6} />
              </li>
            )
          case 'words':
            return (
              <li key={key} class="step words" title={clockTime(block.at)}>
                <span class="mark" aria-hidden="true" />
                <Clamp class="words-text" text={block.text} lines={16} />
              </li>
            )
          case 'handback':
            return (
              <li key={key} class="step handback">
                <span class="mark" aria-hidden="true" />
                <h4 title={clockTime(block.at)}>Handed back</h4>
                <Clamp class="words-text" text={block.text} lines={16} />
              </li>
            )
          case 'thought':
            return (
              <li key={key} class={`step thought${block.text === '' ? ' hidden' : ''}`} title={clockTime(block.at)}>
                <span class="mark" aria-hidden="true">
                  ✻
                </span>
                {block.text === '' ? <p class="thought-text">Thought for {elapsed(block.took)}</p> : <Clamp class="thought-text" text={block.text} lines={4} />}
              </li>
            )
          case 'calls':
            return (
              <li key={key} class="step calls">
                <ol class="call-run">
                  {block.items.map(item =>
                    item.kind === 'call' ? (
                      <CallRow key={item.call.id} where={where} call={item.call} now={now} child={byCall.get(item.call.id)} onPick={onPick} />
                    ) : (
                      <li key={`pause-${item.at}`} class="pause" title={clockTime(item.at)}>
                        Thought for {elapsed(item.took)}
                      </li>
                    ),
                  )}
                </ol>
              </li>
            )
        }
      })}
      {agent !== undefined ? <Now agent={agent} last={steps.at(-1)} now={now} /> : <MainNow main={main} last={steps.at(-1)} now={now} />}
    </ol>
  )
}
