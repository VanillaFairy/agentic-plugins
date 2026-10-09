import { useEffect, useState } from 'preact/hooks'
import type { AgentNode, CallDetail, NodeDetail, SessionSnapshot } from '../shared/model.ts'
import { ROOT, STATUS_WORD, elapsed } from './layout.ts'
import { clockTime } from './time.ts'
import { UsageList } from './Usage.tsx'

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

function LongText({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const long = text.length > 600 || text.split('\n').length > 10
  return (
    <div class="long">
      <pre class={`long-text${long && !open ? ' clamped' : ''}`}>{text}</pre>
      {long && (
        <button class="link" onClick={() => setOpen(!open)}>
          {open ? 'Show less' : 'Show all'}
        </button>
      )}
    </div>
  )
}

function Call({ call, now }: { call: CallDetail; now: number }) {
  const [open, setOpen] = useState(false)
  const state = call.endedAt === undefined ? 'open' : call.isError ? 'error' : 'done'
  const took = call.endedAt === undefined ? elapsed(now - call.startedAt) : elapsed(call.endedAt - call.startedAt)
  return (
    <li class={`call ${state}`}>
      <button class="call-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span class="call-tool">{call.tool}</span>
        <span class="call-when">
          {clockTime(call.startedAt)}
          <span class="call-took">{state === 'error' ? `failed after ${took}` : state === 'open' ? `running ${took}` : took}</span>
        </span>
        {call.arg !== '' && <span class="call-arg">{call.arg}</span>}
      </button>
      {open && (
        <div class="call-body">
          {call.input !== '' && (
            <>
              <h4>Input</h4>
              <pre>{call.input}</pre>
            </>
          )}
          <h4>{state === 'error' ? 'Error' : 'Output'}</h4>
          {call.output !== undefined ? <pre>{call.output}</pre> : <p class="quiet-inline">{state === 'open' ? 'Still running.' : 'Nothing came back.'}</p>}
        </div>
      )}
    </li>
  )
}

function AgentLink({ agent, onPick }: { agent: AgentNode; onPick: (id: string) => void }) {
  return (
    <button class={`agent-link ${agent.status}`} onClick={() => onPick(agent.id)}>
      <span class="status-dot" />
      <span class="agent-link-name">{agent.description}</span>
    </button>
  )
}

export function Detail({ snap, id, now, onPick }: Props) {
  const { detail, problem } = useDetail(snap.id, id)
  const agent = id === ROOT ? undefined : snap.agents[id]
  if (id !== ROOT && agent === undefined) return null
  const parent = agent?.parentId === undefined ? undefined : snap.agents[agent.parentId]
  const children = Object.values(snap.agents)
    .filter(a => (id === ROOT ? a.parentId === undefined : a.parentId === id))
    .sort((a, b) => a.startedAt - b.startedAt)
  const toolCount = agent?.toolCount ?? snap.main.toolCount

  return (
    <aside class="detail" aria-label="Details">
      <div class="detail-top">
        {agent === undefined ? (
          <p class="status-line main">The session’s main loop</p>
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

      <dl class="facts">
        {agent !== undefined && (
          <>
            <dt>Started</dt>
            <dd>{clockTime(agent.startedAt)}</dd>
            {agent.endedAt !== undefined && (
              <>
                <dt>Ended</dt>
                <dd>{clockTime(agent.endedAt)}</dd>
              </>
            )}
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
          </>
        )}
        <dt>Tool calls</dt>
        <dd>{toolCount}</dd>
        {agent !== undefined && (
          <>
            <dt>Agent id</dt>
            <dd class="id">{agent.id}</dd>
          </>
        )}
      </dl>

      {children.length > 0 && (
        <section>
          <h3>Spawned {children.length === 1 ? 'one agent' : `${children.length} agents`}</h3>
          <ul class="agent-links">
            {children.map(c => (
              <li key={c.id}>
                <AgentLink agent={c} onPick={onPick} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {problem !== undefined && <p class="problem">Could not load the details: {problem}</p>}
      {detail === undefined && problem === undefined && <p class="quiet-inline">Reading the transcript…</p>}
      {detail !== undefined && (
        <>
          {detail.prompt !== undefined && (
            <section>
              <h3>{agent === undefined ? 'First prompt' : 'Asked to'}</h3>
              <LongText text={detail.prompt} />
            </section>
          )}
          {detail.report !== undefined && (
            <section>
              <h3>{agent === undefined ? 'Latest reply' : agent.status === 'running' ? 'Latest words' : 'Report'}</h3>
              <LongText text={detail.report} />
            </section>
          )}
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
          <section>
            <h3>Commands, newest first</h3>
            {detail.calls.length === 0 ? (
              <p class="quiet-inline">No tool calls yet.</p>
            ) : (
              <ol class="calls">
                {detail.calls.map(c => (
                  <Call key={c.id} call={c} now={now} />
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </aside>
  )
}
