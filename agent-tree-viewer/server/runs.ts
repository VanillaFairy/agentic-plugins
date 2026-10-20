// The agentics program runs a session started, read from the run store in its repository.
//
// agentics starts every agent as a headless `claude -p --session-id <id>` process, so each agent's
// transcript is a session file of its own, beside the session that started the run rather than
// under its `subagents/`. The run store links them: a run's `run.json` names the session that last
// started it (`session`), and its log names every dispatch's session, role, thread and model.
//
//   <repo>/.agentics/.state/runs/<run>/                      a program run
//   <repo>/.agentics/<effort>/.state/executions/<stamp>/     an execution's run
//
// each holding `run.json` and the log `state.jsonl`.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AgentNode, AgentStatus } from '../shared/model.ts'
import { JsonlTail } from './tail.ts'
import { emptyFacts, ingest, recent } from './transcript.ts'
import type { FileFacts } from './transcript.ts'

// agentics takes a run whose heartbeat is older than this as no longer beating.
const RUN_STALE_MS = 120_000
const RUN_NODE = 'run:'

export type RunMeta = { run: string; program: string; session: string; startedAt: number; heartbeatAt: number }

export type Dispatch = {
  role: string
  thread: string
  model: string
  effort: string
  // The folder the agent ran in; its transcript sits in that folder's project directory.
  cwd: string
  // Absent while the dispatch has not returned.
  status?: string
}

// What a run's log says, folded entry by entry.
export type RunLog = {
  // The latest dispatch of each session; a thread resumed in a later round reuses its session.
  sessions: Map<string, Dispatch>
  // The status the run ended with, when the latest start of it ended.
  ended?: string
}

export const emptyRunLog = (): RunLog => ({ sessions: new Map() })

const record = (v: unknown): Record<string, unknown> | undefined =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined
const text = (v: unknown) => (typeof v === 'string' ? v : '')

export function readRunMeta(raw: unknown): RunMeta | undefined {
  const r = record(raw)
  if (r === undefined || typeof r.run !== 'string' || typeof r.session !== 'string' || r.session === '') return undefined
  return {
    run: r.run,
    program: text(r.program),
    session: r.session,
    startedAt: Date.parse(text(r.started_at)),
    heartbeatAt: Date.parse(text(r.heartbeat_at)),
  }
}

export function ingestRun(log: RunLog, raw: unknown): void {
  const e = record(raw)
  if (e === undefined) return
  if (e.kind === 'run') delete log.ended
  else if (e.kind === 'ended') log.ended = text(record(e.result)?.status) || 'done'
  else if (e.kind === 'dispatched' && typeof e.session === 'string') {
    log.sessions.set(e.session, { role: text(e.role), thread: text(e.thread), model: text(e.model), effort: text(e.effort), cwd: text(e.cwd) })
  } else if (e.kind === 'returned' && typeof e.session === 'string') {
    const d = log.sessions.get(e.session)
    if (d !== undefined) d.status = text(e.status)
  }
}

export type RunSource = {
  meta: RunMeta
  log: RunLog
  // Each dispatched session's transcript, by session id; one not yet written is absent.
  transcripts: Map<string, { facts: FileFacts; mtime: number }>
}

export const runNodeId = (run: string) => RUN_NODE + run

function dispatchStatus(d: Dispatch, runLive: boolean): AgentStatus {
  if (d.status === undefined) return runLive ? 'running' : 'killed'
  if (d.status === 'returned') return 'completed'
  // A host stop: agentics waits it out and dispatches the thread again.
  if (d.status === 'stopped') return 'killed'
  return 'failed'
}

// The run as a card under the session's main loop, and each of its sessions as a card under it.
export function runNodes(src: RunSource, now: number): AgentNode[] {
  const { meta, log } = src
  const live = log.ended === undefined && now - meta.heartbeatAt <= RUN_STALE_MS
  const id = runNodeId(meta.run)
  const kids: AgentNode[] = []
  for (const [session, d] of log.sessions) {
    const t = src.transcripts.get(session)
    const status = dispatchStatus(d, live)
    kids.push({
      id: session,
      parentId: id,
      type: d.role || 'agent',
      description: [d.thread || d.role, [d.model, d.effort].filter(Boolean).join(' ')].filter(Boolean).join(' · '),
      status,
      startedAt: t?.facts.firstAt ?? meta.startedAt,
      ...(status === 'running' ? {} : { endedAt: t?.facts.lastAt ?? t?.mtime ?? meta.startedAt }),
      toolCount: t?.facts.calls.length ?? 0,
      activity: recent(t?.facts.calls ?? []),
    })
  }
  const status: AgentStatus = live ? 'running' : log.ended === undefined ? 'killed' : log.ended === 'done' ? 'completed' : 'failed'
  const run: AgentNode = {
    id,
    type: 'agentics run',
    description: `${meta.program} ${meta.run}`,
    status,
    startedAt: meta.startedAt,
    ...(live ? {} : { endedAt: Math.max(meta.heartbeatAt, ...kids.map(k => k.endedAt ?? 0)) }),
    toolCount: kids.reduce((n, k) => n + k.toolCount, 0),
    activity: [],
  }
  return [run, ...kids]
}

// Claude Code keeps a folder's sessions in a project directory named after the folder's path.
export const projectDirName = (cwd: string) => cwd.replace(/[^A-Za-z0-9]/g, '-')

// The projects directory a session's transcript sits two levels under.
export const projectsDirOf = (mainTranscript: string) => dirname(dirname(mainTranscript))

// The main checkout of `repo`, where agentics keeps its store: a linked worktree's `.git` file
// points into the main checkout's `.git/worktrees/`.
export function mainCheckout(repo: string): string {
  try {
    const gitdir = /^gitdir:\s*(.+?)\s*$/m.exec(readFileSync(join(repo, '.git'), 'utf8'))?.[1]
    const at = gitdir?.replace(/\\/g, '/').lastIndexOf('/.git/worktrees/') ?? -1
    return gitdir !== undefined && at >= 0 ? gitdir.slice(0, at) : repo
  } catch {
    return repo
  }
}

const listDir = (dir: string): string[] => {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

type Followed = { tail: JsonlTail; facts: FileFacts }

type Home = { stamp: number; meta?: RunMeta; log?: { tail: JsonlTail; log: RunLog }; sessions: Map<string, Followed> }

// Follows the runs one session started, and every session they dispatched.
export class RunWatch {
  private homes = new Map<string, Home>()

  private readonly store: string
  private readonly projectsDir: string
  private readonly session: string

  constructor(repo: string, projectsDir: string, session: string) {
    this.store = join(mainCheckout(repo), '.agentics')
    this.projectsDir = projectsDir
    this.session = session
  }

  private homeDirs(): string[] {
    const runs = join(this.store, '.state', 'runs')
    const efforts = listDir(this.store).filter(name => !name.startsWith('.'))
    return [
      ...listDir(runs).filter(name => !name.startsWith('.')).map(name => join(runs, name)),
      ...efforts.flatMap(effort => {
        const dir = join(this.store, effort, '.state', 'executions')
        return listDir(dir).map(stamp => join(dir, stamp))
      }),
    ]
  }

  // A run.json is read again only when it changed: its heartbeat rewrites it every 10 seconds.
  private refresh(dir: string): Home {
    const stamp = statSync(join(dir, 'run.json'), { throwIfNoEntry: false })?.mtimeMs ?? 0
    const home: Home = this.homes.get(dir) ?? { stamp: -1, sessions: new Map() }
    if (home.stamp !== stamp) {
      home.stamp = stamp
      try {
        home.meta = readRunMeta(JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8')))
      } catch {
        // Mid-write, or no run.json yet; the next poll reads it again.
        home.stamp = -1
      }
    }
    this.homes.set(dir, home)
    return home
  }

  // Every run this session started, read up to now.
  read(): RunSource[] {
    const out: RunSource[] = []
    for (const dir of this.homeDirs()) {
      const home = this.refresh(dir)
      const meta = home.meta
      if (meta?.session !== this.session) continue
      home.log ??= { tail: new JsonlTail(join(dir, 'state.jsonl')), log: emptyRunLog() }
      const { entries, restarted } = home.log.tail.read()
      if (restarted) home.log.log = emptyRunLog()
      for (const entry of entries) ingestRun(home.log.log, entry)
      const transcripts = new Map<string, { facts: FileFacts; mtime: number }>()
      for (const [session, d] of home.log.log.sessions) {
        let f = home.sessions.get(session)
        if (f === undefined) {
          f = { tail: new JsonlTail(join(this.projectsDir, projectDirName(d.cwd), `${session}.jsonl`)), facts: emptyFacts() }
          home.sessions.set(session, f)
        }
        const read = f.tail.read()
        if (read.restarted) f.facts = emptyFacts()
        for (const entry of read.entries) ingest(f.facts, entry)
        if (f.tail.mtime > 0) transcripts.set(session, { facts: f.facts, mtime: f.tail.mtime })
      }
      out.push({ meta, log: home.log.log, transcripts })
    }
    return out
  }
}
