import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { AgentNode, ModelUsage, NodeDetail, SessionSnapshot } from '../shared/model.ts'
import { ROOT, STATUS_WORD, elapsed } from './layout.ts'
import { Stream, latestInView } from './Stream.tsx'
import { clockTime } from './time.ts'
import { UsageList, dollars, modelName, totalCost } from './Usage.tsx'

const REFRESH_MS = 1500

type Props = {
  snap: SessionSnapshot
  id: string
  now: number
  onPick: (id: string | undefined) => void
}

// The full transcript facts of one card, read again while the pane is open so it stays live.
function useDetail(sessionId: string, id: string): { detail: NodeDetail | undefined; problem: string | undefined } {
  const [state, setState] = useState<{ detail: NodeDetail | undefined; problem: string | undefined }>({ detail: undefined, problem: undefined })
  useEffect(() => {
    let stop = false
    setState({ detail: undefined, problem: undefined })
    const load = () =>
      fetch(`/api/sessions/${encodeURIComponent(sessionId)}/nodes/${encodeURIComponent(id)}`)
        .then(async res => {
          if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `The server answered ${res.status}`)
          return res.json() as Promise<NodeDetail>
        })
        .then(detail => !stop && setState({ detail, problem: undefined }))
        .catch((err: unknown) => !stop && setState(s => ({ detail: s.detail, problem: String(err instanceof Error ? err.message : err) })))
    void load()
    const timer = setInterval(load, REFRESH_MS)
    return () => {
      stop = true
      clearInterval(timer)
    }
  }, [sessionId, id])
  return state
}

function AgentLink({ agent, onPick }: { agent: AgentNode; onPick: (id: string) => void }) {
  return (
    <button class={`agent-link ${agent.status}`} onClick={() => onPick(agent.id)}>
      <span class="status-dot" />
      <span class="agent-link-name">{agent.description}</span>
    </button>
  )
}

function Cost({ rows }: { rows: readonly ModelUsage[] }) {
  if (rows.length === 0) return <>none yet</>
  const { total, partial } = totalCost(rows)
  return (
    <>
      {dollars(total)}
      {partial && '+'}
      <span class="fact-aside">{rows.map(r => modelName(r.model)).join(', ')}</span>
    </>
  )
}

type SummaryProps = {
  snap: SessionSnapshot
  agent: AgentNode | undefined
  detail: NodeDetail | undefined
  spawned: readonly AgentNode[]
  now: number
  onPick: (id: string | undefined) => void
}

// The facts and cost, pinned above the activity: one compact grid, the breakdown on demand.
function Summary({ snap, agent, detail, spawned, now, onPick }: SummaryProps) {
  const [open, setOpen] = useState(false)
  const parent = agent?.parentId === undefined ? undefined : snap.agents[agent.parentId]
  return (
    <div class="summary">
      <dl class="fact-grid">
        {agent !== undefined && (
          <>
            <div class="fact">
              <dt>Started</dt>
              <dd>{clockTime(agent.startedAt)}</dd>
            </div>
            <div class="fact">
              <dt>{agent.endedAt === undefined ? 'Running for' : 'Ended'}</dt>
              <dd>{agent.endedAt === undefined ? elapsed(now - agent.startedAt) : clockTime(agent.endedAt)}</dd>
            </div>
            <div class="fact">
              <dt>Spawned by</dt>
              <dd>
                {parent === undefined ? (
                  <button class="link" onClick={() => onPick(ROOT)}>
                    the main loop
                  </button>
                ) : (
                  <AgentLink agent={parent} onPick={onPick} />
                )}
              </dd>
            </div>
          </>
        )}
        <div class="fact">
          <dt>Tool calls</dt>
          <dd>{agent?.toolCount ?? snap.main.toolCount}</dd>
        </div>
        {spawned.length > 0 && (
          <div class="fact">
            <dt>Spawned</dt>
            <dd>{spawned.length === 1 ? 'one agent' : `${spawned.length} agents`}</dd>
          </div>
        )}
        {detail !== undefined && (
          <div class="fact wide">
            <dt>{agent === undefined ? 'Cost, main loop' : 'Cost'}</dt>
            <dd>
              <Cost rows={detail.usage} />
            </dd>
          </div>
        )}
        {detail?.sessionUsage !== undefined && (
          <div class="fact wide">
            <dt>Cost, whole session</dt>
            <dd>
              <Cost rows={detail.sessionUsage} />
            </dd>
          </div>
        )}
      </dl>
      <button class="link more" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Hide the breakdown' : spawned.length > 0 ? 'Cost details, spawned agents' : 'Cost details'}
      </button>
      {open && (
        <div class="summary-more">
          {spawned.length > 0 && (
            <section>
              <h3>Spawned {spawned.length === 1 ? 'one agent' : `${spawned.length} agents`}</h3>
              <ul class="agent-links">
                {spawned.map(c => (
                  <li key={c.id}>
                    <AgentLink agent={c} onPick={onPick} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {detail !== undefined && (
            <section>
              <h3>{agent === undefined ? 'Models and cost, main loop' : 'Models and cost'}</h3>
              <UsageList rows={detail.usage} />
              {detail.sessionUsage !== undefined && (
                <>
                  <h4 class="usage-sub">Whole session, every agent included</h4>
                  <UsageList rows={detail.sessionUsage} />
                </>
              )}
              <p class="usage-note">Estimated at Anthropic’s list prices for the API.</p>
            </section>
          )}
          {agent !== undefined && <p class="usage-note">Agent id {agent.id}</p>}
        </div>
      )}
    </div>
  )
}

export function Detail({ snap, id, now, onPick }: Props) {
  const { detail, problem } = useDetail(snap.id, id)
  const bodyRef = useRef<HTMLDivElement>(null)
  // Whether the latest step was in view as of the last frame drawn or the last scroll: the stream
  // follows new steps only then, so reading further up is never pulled away.
  const followRef = useRef(true)
  // The detail last drawn: a click that opens a call grows the stream too, but only news follows.
  const drawnRef = useRef<NodeDetail | undefined>(undefined)
  const [atLatest, setAtLatest] = useState(true)
  useEffect(() => {
    followRef.current = true
  }, [id])
  useLayoutEffect(() => {
    const body = bodyRef.current
    if (body === null) return
    if (followRef.current && detail !== drawnRef.current) body.scrollTop = body.scrollHeight
    drawnRef.current = detail
    followRef.current = latestInView(body)
    setAtLatest(followRef.current)
  })

  const agent = id === ROOT ? undefined : snap.agents[id]
  if (id !== ROOT && agent === undefined) return null
  const spawned = Object.values(snap.agents)
    .filter(a => (id === ROOT ? a.parentId === undefined : a.parentId === id))
    .sort((a, b) => a.startedAt - b.startedAt)
  const onScroll = () => {
    const body = bodyRef.current
    if (body === null) return
    followRef.current = latestInView(body)
    setAtLatest(followRef.current)
  }
  const jump = () => {
    const body = bodyRef.current
    if (body !== null) body.scrollTop = body.scrollHeight
  }

  return (
    <aside class="detail" aria-label="Details">
      <header class="detail-head">
        <div class="detail-top">
          {agent === undefined ? (
            snap.main.live ? (
              <p class="status-line running">
                <span class="status-dot" />
                <span>{snap.main.waitingFor === undefined ? 'running' : 'waiting on you'}</span>
                <span class="status-time">the session’s main loop</span>
              </p>
            ) : (
              <p class="status-line main">The session’s main loop</p>
            )
          ) : (
            <p class={`status-line ${agent.status}`}>
              <span class="status-dot" />
              <span>{STATUS_WORD[agent.status]}</span>
              <span class="status-time">{elapsed((agent.endedAt ?? now) - agent.startedAt)}</span>
            </p>
          )}
          <button class="close" onClick={() => onPick(undefined)} aria-label="Close details" title="Close (Esc)">
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2 2 L10 10 M10 2 L2 10" />
            </svg>
          </button>
        </div>
        <h2>{agent?.description ?? snap.title}</h2>
        <p class="detail-sub">{agent?.type ?? snap.project.path}</p>
        <Summary snap={snap} agent={agent} detail={detail} spawned={spawned} now={now} onPick={onPick} />
      </header>

      <div class="detail-body" ref={bodyRef} onScroll={onScroll} aria-label="Activity">
        {problem !== undefined && <p class="problem">Could not load the details: {problem}</p>}
        {detail === undefined && problem === undefined && <p class="quiet-inline">Reading the transcript…</p>}
        {detail !== undefined && <Stream sessionId={snap.id} nodeId={id} steps={detail.steps} agent={agent} main={snap.main} spawned={spawned} now={now} onPick={onPick} />}
      </div>
      {!atLatest && detail !== undefined && (
        <button class="jump" onClick={jump} aria-label="Jump to the latest" title="Jump to the latest">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 3v10M3.5 8.5 8 13l4.5-4.5" />
          </svg>
        </button>
      )}
    </aside>
  )
}
