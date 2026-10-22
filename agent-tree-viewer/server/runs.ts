// The agentics program runs a session started, read from the run store in its repository.
//
// agentics starts every agent as a headless `claude -p --session-id <id>` process, so each agent's
// transcript is a session file of its own, beside the session that started the run rather than
// under its `subagents/`. The run store links them: a run's `run.json` names the session that last
// started it (`session`), and its logs name every dispatch's session, role, thread and model.
//
//   <repo>/.agentics/.state/runs/<run>/                      a program run
//   <repo>/.agentics/<effort>/.state/executions/<stamp>/     an execution's run
//
// each holding `run.json` and the log `state.jsonl`. A program run logs its dispatches and their
// returns there; an execution logs only the returns, and its dispatches go to the effort's
// `<repo>/.agentics/<effort>/.state/events.jsonl`, each naming its execution's stamp.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AgentNode, AgentStatus } from '../shared/model.ts'
import { JsonlTail } from './tail.ts'
import { emptyFacts, ingest, recent } from './transcript.ts'
import type { FileFacts } from './transcript.ts'

// agentics takes a run whose heartbeat is older than this as no longer beating.
const RUN_STALE_MS = 120_000
const RUN_NODE = 'run:'

export type RunMeta = { run: string; program: string; session: string; startedAt: number; heartbeatAt: number; pid?: number }

export type Dispatch = {
  role: string
  thread: string
  node: string
  model: string
  effort: string
  // The folder the agent ran in; its transcript sits in that folder's project directory.
  cwd: string
  seq: number
}

type Return = { status: string; seq: number }

// What a run's logs say, folded entry by entry. Dispatches and returns are kept apart and matched by
// `seq`, agentics' counter across all of an effort's logs: an execution's two logs are read one
// after the other, so a return can be read before its dispatch.
export type RunLog = {
  // The latest dispatch of each session; a thread resumed in a later round reuses its session.
  sessions: Map<string, Dispatch>
  returns: Map<string, Return>
  // The status the run ended with, when the latest start of it ended.
  ended?: string
  // Stands in for `seq` on a line without one: the order lines were read in.
  lines: number
}

export const emptyRunLog = (): RunLog => ({ sessions: new Map(), returns: new Map(), lines: 0 })

// How the latest dispatch of `session` returned; undefined while it has not.
export function returnOf(log: RunLog, session: string): string | undefined {
  const d = log.sessions.get(session)
  const r = log.returns.get(session)
  return d !== undefined && r !== undefined && r.seq > d.seq ? r.status : undefined
}

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
    ...(typeof r.pid === 'number' ? { pid: r.pid } : {}),
  }
}

const seqOf = (log: RunLog, e: Record<string, unknown>) => (typeof e.seq === 'number' ? e.seq : ++log.lines)

function ingestDispatch(log: RunLog, e: Record<string, unknown>): void {
  if (typeof e.session !== 'string') return
  log.sessions.set(e.session, { role: text(e.role), thread: text(e.thread), node: text(e.node), model: text(e.model), effort: text(e.effort), cwd: text(e.cwd), seq: seqOf(log, e) })
}

// One line of a run home's `state.jsonl`.
export function ingestRun(log: RunLog, raw: unknown): void {
  const e = record(raw)
  if (e === undefined) return
  if (e.kind === 'run') delete log.ended
  else if (e.kind === 'ended') log.ended = text(record(e.result)?.status) || 'done'
  else if (e.kind === 'dispatched') ingestDispatch(log, e)
  else if (e.kind === 'returned' && typeof e.session === 'string') log.returns.set(e.session, { status: text(e.status), seq: seqOf(log, e) })
}

// One line of an effort's `events.jsonl`, for the execution `stamp`: its dispatches, nothing else.
export function ingestEvent(log: RunLog, raw: unknown, stamp: string): void {
  const e = record(raw)
  if (e?.kind === 'dispatched' && e.execution === stamp) ingestDispatch(log, e)
}

export type RunSource = {
  meta: RunMeta
  log: RunLog
  // Each dispatched session's transcript, by session id; one not yet written is absent.
  transcripts: Map<string, { facts: FileFacts; mtime: number }>
}

export const runNodeId = (run: string) => RUN_NODE + run

function dispatchStatus(returned: string | undefined, runLive: boolean): AgentStatus {
  if (returned === undefined) return runLive ? 'running' : 'killed'
  if (returned === 'returned') return 'completed'
  // A host stop: agentics waits it out and dispatches the thread again.
  if (returned === 'stopped') return 'killed'
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
    const status = dispatchStatus(returnOf(log, session), live)
    kids.push({
      kind: 'dispatched',
      role: d.role,
      thread: d.thread,
      node: d.node,
      model: d.model,
      effort: d.effort,
      id: session,
      parentId: id,
      type: d.role || 'agent',
      // The node `.` is the effort's root folder, which names no work; the thread does.
      description: (d.node !== '.' && d.node) || d.thread || d.role || session,
      status,
      startedAt: t?.facts.firstAt ?? meta.startedAt,
      ...(status === 'running' ? {} : { endedAt: t?.facts.lastAt ?? t?.mtime ?? meta.startedAt }),
      toolCount: t?.facts.calls.length ?? 0,
      activity: recent(t?.facts.calls ?? []),
    })
  }
  const status: AgentStatus = live ? 'running' : log.ended === undefined ? 'killed' : log.ended === 'done' ? 'completed' : 'failed'
  const run: AgentNode = {
    kind: 'run',
    program: meta.program,
    run: meta.run,
    heartbeatAt: meta.heartbeatAt,
    ...(meta.pid !== undefined ? { pid: meta.pid } : {}),
    id,
    type: 'agentics run',
    description: `${meta.program} ${meta.run}`,
    status,
    startedAt: meta.startedAt,
    ...(live ? {} : { endedAt: Math.max(meta.heartbeatAt, ...kids.map(k => k.endedAt ?? 0)) }),
    toolCount: 0,
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

// Where a run home's logs are. `events` is set for an execution: its effort's events.jsonl, and the
// stamp its dispatches there carry.
type HomeDir = { dir: string; events?: { path: string; stamp: string } }

// A run's logs, each read on from where the last read stopped. An execution reads its effort's
// events.jsonl whole once, then only what is appended, keeping its own dispatches from it.
class RunLogTail {
  private state!: JsonlTail
  private events: JsonlTail | undefined
  private log!: RunLog

  private readonly home: HomeDir

  constructor(home: HomeDir) {
    this.home = home
    this.restart()
  }

  private restart(): void {
    this.state = new JsonlTail(join(this.home.dir, 'state.jsonl'))
    this.events = this.home.events === undefined ? undefined : new JsonlTail(this.home.events.path)
    this.log = emptyRunLog()
  }

  read(): RunLog {
    const state = this.state.read()
    const events = this.events?.read()
    // A log rewritten from the start voids the fold, the other log's share of it included.
    if (state.restarted || events?.restarted) {
      this.restart()
      return this.read()
    }
    for (const entry of state.entries) ingestRun(this.log, entry)
    const stamp = this.home.events?.stamp ?? ''
    for (const entry of events?.entries ?? []) ingestEvent(this.log, entry, stamp)
    return this.log
  }
}

// A run.json is read again only when it changed: its heartbeat rewrites it every 10 seconds.
type Home = { stamp: number; meta?: RunMeta; log?: RunLogTail }

export type StoredRun = { meta: RunMeta; log: RunLog }

// The agentics store of the repository `repo` is a checkout of.
export const storeOf = (repo: string) => join(mainCheckout(repo), '.agentics')

// The runs in one agentics store that name the session that started them.
export class RunStore {
  private homes = new Map<string, Home>()

  private readonly store: string

  constructor(store: string) {
    this.store = store
  }

  private homeDirs(): HomeDir[] {
    const runs = join(this.store, '.state', 'runs')
    const efforts = listDir(this.store).filter(name => !name.startsWith('.'))
    return [
      ...listDir(runs)
        .filter(name => !name.startsWith('.'))
        .map(name => ({ dir: join(runs, name) })),
      ...efforts.flatMap(effort => {
        const state = join(this.store, effort, '.state')
        const dir = join(state, 'executions')
        return listDir(dir).map(stamp => ({ dir: join(dir, stamp), events: { path: join(state, 'events.jsonl'), stamp } }))
      }),
    ]
  }

  private refresh(dir: string): Home {
    const stamp = statSync(join(dir, 'run.json'), { throwIfNoEntry: false })?.mtimeMs ?? 0
    const home: Home = this.homes.get(dir) ?? { stamp: -1 }
    if (home.stamp !== stamp) {
      home.stamp = stamp
      try {
        home.meta = readRunMeta(JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8')))
      } catch {
        // Mid-write, or no run.json yet; the next read tries it again.
        home.stamp = -1
      }
    }
    this.homes.set(dir, home)
    return home
  }

  // Each run `wanted` keeps, its logs read up to now; the others' logs stay unread.
  read(wanted: (meta: RunMeta) => boolean = () => true): StoredRun[] {
    const out: StoredRun[] = []
    for (const where of this.homeDirs()) {
      const home = this.refresh(where.dir)
      const meta = home.meta
      if (meta === undefined || !wanted(meta)) continue
      home.log ??= new RunLogTail(where)
      out.push({ meta, log: home.log.read() })
    }
    return out
  }
}

// Follows the runs one session started, and every session they dispatched.
export class RunWatch {
  private store: RunStore
  private sessions = new Map<string, Followed>()

  private readonly projectsDir: string
  private readonly session: string

  constructor(repo: string, projectsDir: string, session: string) {
    this.store = new RunStore(storeOf(repo))
    this.projectsDir = projectsDir
    this.session = session
  }

  // Every run this session started, read up to now.
  read(): RunSource[] {
    return this.store.read(meta => meta.session === this.session).map(({ meta, log }) => {
      const transcripts = new Map<string, { facts: FileFacts; mtime: number }>()
      for (const [session, d] of log.sessions) {
        let f = this.sessions.get(session)
        if (f === undefined) {
          f = { tail: new JsonlTail(join(this.projectsDir, projectDirName(d.cwd), `${session}.jsonl`)), facts: emptyFacts() }
          this.sessions.set(session, f)
        }
        const read = f.tail.read()
        if (read.restarted) f.facts = emptyFacts()
        for (const entry of read.entries) ingest(f.facts, entry)
        if (f.tail.mtime > 0) transcripts.set(session, { facts: f.facts, mtime: f.tail.mtime })
      }
      return { meta, log, transcripts }
    })
  }
}

// The runs in the stores of many folders, for the session picker: each store read once however
// many of the folders are checkouts of its repository.
export class RunStores {
  private stores = new Map<string, RunStore>()
  private storeByFolder = new Map<string, string>()

  read(folders: Iterable<string>): StoredRun[] {
    const seen = new Set<string>()
    const out: StoredRun[] = []
    for (const folder of folders) {
      let store = this.storeByFolder.get(folder)
      if (store === undefined) {
        store = storeOf(folder)
        this.storeByFolder.set(folder, store)
      }
      if (seen.has(store)) continue
      seen.add(store)
      let runs = this.stores.get(store)
      if (runs === undefined) {
        runs = new RunStore(store)
        this.stores.set(store, runs)
      }
      out.push(...runs.read())
    }
    return out
  }
}
