import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { RunStore, RunStores, RunWatch, emptyRunLog, ingestRun, projectDirName, readRunMeta, returnOf, runNodeId, runNodes } from '../server/runs.ts'
import type { RunLog, RunSource } from '../server/runs.ts'
import { emptyFacts, ingest } from '../server/transcript.ts'

const T0 = Date.parse('2026-10-20T17:43:25.000Z')
const iso = (s: number) => new Date(T0 + s * 1000).toISOString()

const runJson = (session: string, heartbeatS = 0) => ({ run: 'r1', program: 'survey', session, started_at: iso(0), heartbeat_at: iso(heartbeatS) })
const dispatched = (session: string, thread: string, role = 'analyst', cwd = 'C:\\repo') => ({ kind: 'dispatched', session, role, thread, model: 'haiku', effort: 'low', cwd })
const returned = (session: string, status = 'returned') => ({ kind: 'returned', session, status })
const toolCall = (s: number, id: string) => ({ type: 'assistant', timestamp: iso(s), message: { content: [{ type: 'tool_use', id, name: 'Read', input: { file_path: 'a.ts' } }] } })

function source(heartbeatS: number, log: object[], transcripts: Record<string, object[]> = {}): RunSource {
  const meta = readRunMeta(runJson('parent', heartbeatS))
  if (meta === undefined) throw new Error('run.json unread')
  const folded = emptyRunLog()
  for (const e of log) ingestRun(folded, e)
  const files = new Map(
    Object.entries(transcripts).map(([id, entries]) => {
      const facts = emptyFacts()
      for (const e of entries) ingest(facts, e)
      return [id, { facts, mtime: facts.lastAt ?? T0 }] as const
    }),
  )
  return { meta, log: folded, transcripts: files }
}

const byId = (src: RunSource, nowS: number) => Object.fromEntries(runNodes(src, T0 + nowS * 1000).map(n => [n.id, n]))

describe('a run started by a session', () => {
  it('is not read from a run.json that names no session', () => {
    expect(readRunMeta(runJson(''))).toBeUndefined()
    expect(readRunMeta({ run: 'r1' })).toBeUndefined()
  })

  it('hangs each dispatched session under the run, named by its thread and model', () => {
    const nodes = byId(source(0, [{ kind: 'run' }, dispatched('s1', 'judge:1'), dispatched('s2', 'plan', 'planner')]), 10)
    const run = nodes[runNodeId('r1')]
    expect(run?.parentId).toBeUndefined()
    expect(run?.description).toContain('survey')
    expect(nodes.s1).toMatchObject({ parentId: runNodeId('r1'), type: 'analyst', status: 'running' })
    expect(nodes.s1?.description).toContain('judge:1')
    expect(nodes.s1).toMatchObject({ model: 'haiku', effort: 'low' })
    expect(nodes.s2?.type).toBe('planner')
  })

  it('marks each session by how its dispatch returned', () => {
    const log = [{ kind: 'run' }, dispatched('ok', 'a'), dispatched('bad', 'b'), dispatched('wait', 'c'), dispatched('open', 'd'), returned('ok'), returned('bad', 'failed'), returned('wait', 'stopped')]
    const nodes = byId(source(0, log), 10)
    expect(nodes.ok?.status).toBe('completed')
    expect(nodes.bad?.status).toBe('failed')
    expect(nodes.wait?.status).toBe('killed')
    expect(nodes.open?.status).toBe('running')
    expect(nodes.open?.endedAt).toBeUndefined()
  })

  it('keeps one card for a session its thread resumes, as the latest dispatch left it', () => {
    const nodes = byId(source(0, [{ kind: 'run' }, dispatched('s1', 'scout'), returned('s1'), dispatched('s1', 'scout')]), 10)
    expect(Object.keys(nodes)).toHaveLength(2)
    expect(nodes.s1?.status).toBe('running')
  })

  it('is live while its heartbeat is fresh and it has not ended, and stopped once the heartbeat goes stale', () => {
    const log = [{ kind: 'run' }, dispatched('s1', 'a')]
    expect(byId(source(0, log), 60)[runNodeId('r1')]?.status).toBe('running')
    const stale = byId(source(0, log), 600)
    expect(stale[runNodeId('r1')]?.status).toBe('killed')
    expect(stale.s1?.status).toBe('killed')
  })

  it('is done once it ended, until a later start of it', () => {
    const ended = [{ kind: 'run' }, dispatched('s1', 'a'), returned('s1'), { kind: 'ended', result: { status: 'done' } }]
    expect(byId(source(0, ended), 10)[runNodeId('r1')]?.status).toBe('completed')
    expect(byId(source(0, [...ended, { kind: 'run' }]), 10)[runNodeId('r1')]?.status).toBe('running')
  })

  it('counts and shows the tool calls its sessions made', () => {
    const nodes = byId(source(0, [{ kind: 'run' }, dispatched('s1', 'a')], { s1: [toolCall(1, 'c1'), toolCall(2, 'c2')] }), 10)
    expect(nodes.s1?.toolCount).toBe(2)
    expect(nodes.s1?.activity.map(c => c.id)).toEqual(['c1', 'c2'])
    expect(nodes.s1?.startedAt).toBe(T0 + 1000)
  })

  it('shows the run as a process that makes no tool calls, and its sessions as dispatched ones', () => {
    const nodes = byId(source(0, [{ kind: 'run' }, { ...dispatched('s1', 'producer:auth/login'), node: 'auth/login' }], { s1: [toolCall(1, 'c1')] }), 10)
    expect(nodes[runNodeId('r1')]).toMatchObject({ kind: 'run', program: 'survey', heartbeatAt: T0, toolCount: 0 })
    expect(nodes.s1).toMatchObject({ kind: 'dispatched', role: 'analyst', node: 'auth/login', model: 'haiku', description: 'auth/login' })
  })
})

describe('the run store', () => {
  let dir: string
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const write = (path: string, body: object | object[]) => {
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, Array.isArray(body) ? body.map(e => JSON.stringify(e) + '\n').join('') : JSON.stringify(body))
  }

  it('finds the program and execution runs a session started, and their sessions’ transcripts, from a worktree of the repo', () => {
    dir = mkdtempSync(join(tmpdir(), 'atv-runs-'))
    const repo = join(dir, 'repo')
    const worktree = join(dir, 'wt')
    const projects = join(dir, 'projects')
    mkdirSync(worktree, { recursive: true })
    writeFileSync(join(worktree, '.git'), `gitdir: ${join(repo, '.git', 'worktrees', 'wt')}\n`)
    const state = join(repo, '.agentics', '.state', 'runs')
    write(join(state, 'mine', 'run.json'), { ...runJson('parent', 0), run: 'mine' })
    write(join(state, 'mine', 'state.jsonl'), [{ kind: 'run' }, dispatched('s1', 'judge:1', 'analyst', worktree)])
    write(join(state, 'theirs', 'run.json'), { ...runJson('other', 0), run: 'theirs' })
    write(join(state, 'theirs', 'state.jsonl'), [{ kind: 'run' }, dispatched('s9', 'x')])
    const execution = join(repo, '.agentics', 'auth', '.state', 'executions', '20261020-180000')
    write(join(execution, 'run.json'), { ...runJson('parent', 0), run: 'auth.20261020-180000', program: 'execute' })
    write(join(execution, 'state.jsonl'), [{ kind: 'run' }])
    write(join(repo, '.agentics', 'auth', '.state', 'events.jsonl'), [{ ...dispatched('s2', 'leaf', 'implementer', worktree), execution: '20261020-180000' }])
    write(join(projects, projectDirName(worktree), 's1.jsonl'), [toolCall(1, 'c1')])

    const runs = new RunWatch(worktree, projects, 'parent').read()
    expect(runs.map(r => r.meta.run).sort()).toEqual(['auth.20261020-180000', 'mine'])
    const mine = runs.find(r => r.meta.run === 'mine')
    expect(mine?.transcripts.get('s1')?.facts.calls.map(c => c.id)).toEqual(['c1'])
    expect(runs.find(r => r.meta.program === 'execute')?.log.sessions.has('s2')).toBe(true)
  })
  it('lists every run of a repository once from any of its checkouts, and sees a dispatch added since', () => {
    dir = mkdtempSync(join(tmpdir(), 'atv-runs-'))
    const repo = join(dir, 'repo')
    const worktree = join(dir, 'wt')
    mkdirSync(worktree, { recursive: true })
    writeFileSync(join(worktree, '.git'), `gitdir: ${join(repo, '.git', 'worktrees', 'wt')}\n`)
    const home = join(repo, '.agentics', '.state', 'runs', 'r1')
    write(join(home, 'run.json'), runJson('parent'))
    write(join(home, 'state.jsonl'), [{ kind: 'run' }, dispatched('s1', 'a')])
    write(join(repo, '.agentics', '.state', 'runs', 'old', 'run.json'), { run: 'old', program: 'survey' })
    write(join(repo, '.agentics', '.state', 'runs', 'old', 'state.jsonl'), [{ kind: 'run' }, dispatched('s9', 'x')])

    const stores = new RunStores()
    const first = stores.read([repo, worktree])
    expect(first.map(r => [r.meta.run, r.meta.session, [...r.log.sessions.keys()]])).toEqual([['r1', 'parent', ['s1']]])
    appendFileSync(join(home, 'state.jsonl'), JSON.stringify(dispatched('s2', 'b')) + '\n')
    expect([...(stores.read([worktree])[0]?.log.sessions.keys() ?? [])]).toEqual(['s1', 's2'])
  })

  describe('an execution', () => {
    const STAMP = '20261021-161920'
    let state: string
    let events: string
    const setUp = () => {
      dir = mkdtempSync(join(tmpdir(), 'atv-runs-'))
      const effort = join(dir, 'repo', '.agentics', 'auth', '.state')
      const home = join(effort, 'executions', STAMP)
      state = join(home, 'state.jsonl')
      events = join(effort, 'events.jsonl')
      write(join(home, 'run.json'), { ...runJson('parent', 0), run: `auth.${STAMP}`, program: 'execute' })
      return new RunStore(join(dir, 'repo', '.agentics'))
    }
    const at = (seq: number, e: object, execution = STAMP) => ({ ...e, seq, execution })
    const log = (store: RunStore) => {
      const [run] = store.read()
      if (run === undefined) throw new Error('no run read')
      return run.log
    }
    const statuses = (l: RunLog) => Object.fromEntries([...l.sessions.keys()].map(s => [s, returnOf(l, s) ?? 'open']))

    it('takes its dispatches from the effort’s events and its returns from its own log', () => {
      const store = setUp()
      write(events, [at(2, dispatched('s1', 'a')), at(3, dispatched('other', 'x'), '20261020-000000'), at(5, dispatched('s2', 'b')), { kind: 'planned', seq: 6 }])
      write(state, [{ kind: 'run', seq: 1 }, at(4, returned('s1')), at(7, returned('s2', 'failed'))])
      expect(statuses(log(store))).toEqual({ s1: 'returned', s2: 'failed' })
    })

    it('reads on from where it stopped, whichever of its logs a return or its dispatch reaches first', () => {
      const store = setUp()
      write(events, [at(2, dispatched('s1', 'a'))])
      write(state, [{ kind: 'run', seq: 1 }])
      expect(statuses(log(store))).toEqual({ s1: 'open' })
      appendFileSync(state, JSON.stringify(at(4, returned('s2'))) + '\n')
      expect(statuses(log(store))).toEqual({ s1: 'open' })
      appendFileSync(events, JSON.stringify(at(3, dispatched('s2', 'b'))) + '\n')
      expect(statuses(log(store))).toEqual({ s1: 'open', s2: 'returned' })
    })

    it('starts the fold over when the effort’s events are rewritten', () => {
      const store = setUp()
      write(events, [at(2, dispatched('s1', 'a')), at(3, dispatched('s2', 'b'))])
      write(state, [{ kind: 'run', seq: 1 }, at(4, returned('s2'))])
      expect(statuses(log(store))).toEqual({ s1: 'open', s2: 'returned' })
      write(events, [at(3, dispatched('s2', 'b'))])
      expect(statuses(log(store))).toEqual({ s2: 'returned' })
    })
  })
})
