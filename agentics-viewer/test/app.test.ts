import { afterEach, describe, expect, test } from 'vitest'
import http from 'node:http'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { realClock } from '../server/clock.ts'
import { DEFAULT_STATE, projectKey, readState, statePath, writeState } from '../server/state.ts'
import type { ViewerState } from '../server/state.ts'
import { createApp } from '../server/app.ts'
import type { AppDeps } from '../server/app.ts'
import type { AgenticsLocation } from '../server/agentics.ts'
import type { Problem, Snapshot, SnapshotNode } from '../shared/snapshot.ts'
import type { FolderPick } from '../server/windows.ts'
import { node, snap } from './snapshot-fixture.ts'

// ---- fixtures & fakes -------------------------------------------------

function tempDir(prefix = 'agentics-viewer-'): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

interface ControlEntry { payload?: unknown; digest?: string; error?: string }
interface Control { list?: Record<string, ControlEntry>; snapshot?: Record<string, Record<string, ControlEntry>> }

// The fake `lib/status.mjs`: keyed by --repo (and --effort for snapshot), read
// fresh from the control file on every invocation, and it logs every call so
// tests can prove a run did or didn't happen.
function fakeAgentics(dir: string, controlFile: string, runLogFile: string): void {
  mkdirSync(join(dir, 'lib'), { recursive: true })
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true })
  writeFileSync(join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({ version: '1.0.0' }))
  const script = `
import { readFileSync, appendFileSync } from 'node:fs'
const args = process.argv.slice(2)
const cmd = args[0]
const ri = args.indexOf('--repo')
const repo = ri === -1 ? '' : args[ri + 1]
const ei = args.indexOf('--effort')
const effort = ei === -1 ? '' : args[ei + 1]
try { appendFileSync(${JSON.stringify(runLogFile)}, cmd + ' ' + repo + ' ' + effort + '\\n') } catch {}
let control
try { control = JSON.parse(readFileSync(${JSON.stringify(controlFile)}, 'utf8')) } catch { console.log(JSON.stringify({ error: 'no control' })); process.exit(1) }
const entry = cmd === 'snapshot' ? (control.snapshot || {})[repo]?.[effort] : (control.list || {})[repo]
if (!entry) { console.log(JSON.stringify({ error: 'no response for ' + cmd + ' ' + repo + ' ' + effort })); process.exit(1) }
if (entry.error) { console.log(JSON.stringify({ error: entry.error })); process.exit(1) }
console.log(JSON.stringify({ payload: entry.payload, payload_digest: entry.digest }))
`
  writeFileSync(join(dir, 'lib', 'status.mjs'), script)
}

function listEntry(store: string, efforts: string[], digest = 'l1'): ControlEntry {
  return {
    digest,
    payload: { repo: 'r', store, store_present: true, efforts: efforts.map((effort) => ({ effort, about: '', root_status: 'active', seq_max: 0, malformed: 0 })), notes: '' },
  }
}

function snapshotEntry(store: string, effort: string, nodes: SnapshotNode[] = [], digest = 's1', extra: Partial<Snapshot> = {}): ControlEntry {
  return { digest, payload: snap(nodes, { store, effort, ...extra }) }
}

function keyOf(store: string): string {
  return projectKey(dirname(store))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitUntil(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (check()) return
    if (Date.now() > deadline) throw new Error('timed out waiting')
    await sleep(10)
  }
}

// ---- a small SSE reader (fetch, split on blank lines) -----------------

interface SseClient {
  frames: string[]
  events: Array<{ event: string; data: unknown }>
  close(): void
}

function connectSse(url: string, headers: Record<string, string> = {}): SseClient {
  const frames: string[] = []
  const events: Array<{ event: string; data: unknown }> = []
  const controller = new AbortController()
  fetch(url, { signal: controller.signal, headers })
    .then(async (res) => {
      const body = res.body
      if (body === null) return
      const reader = body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let idx: number
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const chunk = buffer.slice(0, idx)
          buffer = buffer.slice(idx + 2)
          frames.push(chunk)
          if (chunk.startsWith(':')) continue
          let event = 'message'
          let data = ''
          for (const line of chunk.split('\n')) {
            if (line.startsWith('event: ')) event = line.slice('event: '.length)
            else if (line.startsWith('data: ')) data = line.slice('data: '.length)
          }
          if (data !== '') events.push({ event, data: JSON.parse(data) })
        }
      }
    })
    .catch(() => {})
  return {
    frames,
    events,
    close(): void {
      controller.abort()
    },
  }
}

function nth(client: SseClient, kind: string, index: number): { event: string; data: unknown } | undefined {
  return client.events.filter((e) => e.event === kind)[index]
}

async function waitForNth(client: SseClient, kind: string, index: number, timeoutMs = 2000): Promise<{ event: string; data: unknown }> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const found = nth(client, kind, index)
    if (found !== undefined) return found
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${kind}[${index}]`)
    await sleep(10)
  }
}

function rawRequest(port: number, path: string, opts: { method?: string; headers?: Record<string, string> } = {}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method: opts.method ?? 'GET', headers: opts.headers }, (res) => {
      let body = ''
      res.on('data', (c: Buffer) => (body += c.toString()))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
    })
    req.on('error', reject)
    req.end()
  })
}

// ---- app harness --------------------------------------------------------

interface Harness {
  deps: AppDeps
  app: ReturnType<typeof createApp>
  base: string
  port: number
  controlFile: string
  runLogFile: string
  stateFile: string
  control: Control
  toastCalls: Array<{ title: string; body: string; stateAtCall: ViewerState }>
}

const cleanups: Array<() => Promise<void> | void> = []
const tempDirs: string[] = []

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()!()
  }
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true })
  }
})

async function buildApp(overrides: Partial<AppDeps> = {}, opts: { home?: string; locate?: () => AgenticsLocation | Problem } = {}): Promise<Harness> {
  const home = opts.home ?? tempDir()
  tempDirs.push(home)
  const stateFile = statePath(home)
  const distDir = tempDir()
  tempDirs.push(distDir)
  writeFileSync(join(distDir, 'index.html'), '<html>viewer</html>')

  const agenticsDir = tempDir()
  tempDirs.push(agenticsDir)
  const controlFile = join(agenticsDir, 'control.json')
  const runLogFile = join(agenticsDir, 'runs.log')
  writeFileSync(runLogFile, '')
  fakeAgentics(agenticsDir, controlFile, runLogFile)
  const control: Control = {}
  writeFileSync(controlFile, JSON.stringify(control))

  const toastCalls: Array<{ title: string; body: string; stateAtCall: ViewerState }> = []
  const deps: AppDeps = {
    port: 0,
    stateFile,
    distDir,
    clock: realClock,
    locate: opts.locate ?? ((): AgenticsLocation | Problem => ({ path: agenticsDir, version: '1.0.0' })),
    toast: async (title: string, body: string): Promise<void> => {
      toastCalls.push({ title, body, stateAtCall: readState(stateFile).state })
    },
    pickFolder: async (): Promise<FolderPick> => ({ path: 'C:/x' }),
    log: () => {},
    heartbeatMs: 100,
    timings: { quietMs: 20, capMs: 60, pollMs: 150 },
    ...overrides,
  }
  const app = createApp(deps)
  await new Promise<void>((resolve) => app.server.on('listening', resolve))
  const address = app.server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  const base = `http://127.0.0.1:${port}`
  cleanups.push(() => app.close())
  return { deps, app, base, port, controlFile, runLogFile, stateFile, control, toastCalls }
}

function setList(h: Harness, repo: string, entry: ControlEntry): void {
  h.control.list = { ...h.control.list, [repo]: entry }
  writeFileSync(h.controlFile, JSON.stringify(h.control))
}

function setSnapshot(h: Harness, repo: string, effort: string, entry: ControlEntry): void {
  h.control.snapshot = { ...h.control.snapshot, [repo]: { ...(h.control.snapshot?.[repo] ?? {}), [effort]: entry } }
  writeFileSync(h.controlFile, JSON.stringify(h.control))
}

function runCount(h: Harness, cmd: string, repo: string): number {
  const text = readFileSync(h.runLogFile, 'utf8')
  return text.split('\n').filter((line) => line.startsWith(`${cmd} ${repo} `)).length
}

function connect(h: Harness, project: string, effort?: string): SseClient {
  const qp = new URLSearchParams({ project })
  if (effort !== undefined) qp.set('effort', effort)
  const client = connectSse(`${h.base}/api/stream?${qp.toString()}`)
  cleanups.push(() => client.close())
  return client
}

function project(): string {
  const dir = tempDir()
  tempDirs.push(dir)
  return dir
}

function store(): string {
  const dir = tempDir()
  tempDirs.push(dir)
  const s = join(dir, '.agentics')
  mkdirSync(s, { recursive: true })
  return s
}

function touchStore(s: string): void {
  appendFileSync(join(s, 'touch.log'), 'x\n')
}

// ---- tests ----------------------------------------------------------

describe('health and host checks', () => {
  test('health identifies the viewer', async () => {
    const h = await buildApp()
    const res = await rawRequest(h.port, '/api/health', { headers: { Host: `127.0.0.1:${h.port}` } })
    expect(res.status).toBe(200)
    const body = JSON.parse(res.body) as { app: string; version: string }
    expect(body.app).toBe('agentics-viewer')
    expect(typeof body.version).toBe('string')
  })

  test('a foreign host is refused', async () => {
    const h = await buildApp()
    const res = await rawRequest(h.port, '/api/health', { headers: { Host: 'evil.example:1' } })
    expect(res.status).toBe(403)
  })

  test('a foreign origin cannot read the stream', async () => {
    const h = await buildApp()
    const res = await fetch(`${h.base}/api/stream?project=${encodeURIComponent(project())}`, { headers: { Origin: 'http://evil.example' } })
    expect(res.status).toBe(403)
  })

  test('a foreign origin cannot open the dialog', async () => {
    let called = false
    const h = await buildApp({ pickFolder: async () => { called = true; return { path: 'C:/x' } } })
    const res = await fetch(`${h.base}/api/browse`, { method: 'POST', headers: { Origin: 'http://evil.example' } })
    expect(res.status).toBe(403)
    expect(called).toBe(false)
  })

  test('both local host names are allowed', async () => {
    const h = await buildApp()
    const byIp = await rawRequest(h.port, '/api/health', { headers: { Host: `127.0.0.1:${h.port}` } })
    const byName = await rawRequest(h.port, '/api/health', { headers: { Host: `localhost:${h.port}` } })
    expect(byIp.status).toBe(200)
    expect(byName.status).toBe(200)
  })
})

describe('projects and browse', () => {
  test('projects lists found, recent and last', async () => {
    const home = tempDir()
    const s = store()
    const p = dirname(s) // the temp dir `store()` made, holding `.agentics`
    writeState(statePath(home), { ...DEFAULT_STATE, roots: [p] })
    const h = await buildApp({}, { home })
    setList(h, p, listEntry(s, ['e']))
    setSnapshot(h, p, 'e', snapshotEntry(s, 'e'))
    const client = connect(h, p, 'e')
    await waitForNth(client, 'efforts', 0)

    const res = await fetch(`${h.base}/api/projects`)
    const body = (await res.json()) as { found: Array<{ path: string }>; recent: Array<{ path: string }>; last: { project: string; effort: string } | null }
    expect(body.found.some((r) => r.path === p)).toBe(true)
    expect(body.recent.some((r) => r.path === p)).toBe(true)
    expect(body.last).toEqual({ project: p, effort: 'e' })
  })

  test('browse returns the picked folder', async () => {
    const h = await buildApp({ pickFolder: async () => ({ path: 'C:/picked' }) })
    const res = await fetch(`${h.base}/api/browse`, { method: 'POST' })
    expect(await res.json()).toEqual({ path: 'C:/picked' })
  })
})

describe('stream connection basics', () => {
  test('a stream needs a project', async () => {
    const h = await buildApp()
    const res = await fetch(`${h.base}/api/stream`)
    expect(res.status).toBe(400)
  })

  test('an effort alone is not enough', async () => {
    const h = await buildApp()
    const res = await fetch(`${h.base}/api/stream?effort=e`)
    expect(res.status).toBe(400)
  })

  test('the latest effort is selected', async () => {
    const h = await buildApp()
    const s = store()
    const p = project()
    mkdirSync(join(s, 'old', '.state'), { recursive: true })
    mkdirSync(join(s, 'new', '.state'), { recursive: true })
    writeFileSync(join(s, 'old', '.state', 'events.jsonl'), '')
    writeFileSync(join(s, 'new', '.state', 'events.jsonl'), '')
    const past = new Date(Date.now() - 60_000)
    utimesSync(join(s, 'old', '.state', 'events.jsonl'), past, past)
    setList(h, p, listEntry(s, ['old', 'new']))
    setSnapshot(h, p, 'old', snapshotEntry(s, 'old'))
    setSnapshot(h, p, 'new', snapshotEntry(s, 'new'))
    const client = connect(h, p)
    const efforts = await waitForNth(client, 'efforts', 0)
    expect((efforts.data as { selected: string }).selected).toBe('new')
  })

  test('a project with no efforts leaks no watcher when its stream closes', async () => {
    const logMessages: string[] = []
    const h = await buildApp({ log: (m) => { logMessages.push(m) } })
    const p = project()
    const s = store()
    setList(h, p, listEntry(s, []))
    const client = connect(h, p)
    const efforts = await waitForNth(client, 'efforts', 0)
    expect((efforts.data as { selected: string | null }).selected).toBeNull()
    client.close()
    await sleep(200)
    const before = logMessages.length
    touchStore(s)
    await sleep(300)
    expect(logMessages.length).toBe(before)
  })

  test('a new stream gets the latest snapshot without waiting', async () => {
    const h = await buildApp()
    const s = store()
    const p = project()
    setList(h, p, listEntry(s, ['e']))
    setSnapshot(h, p, 'e', snapshotEntry(s, 'e', [], 'v1', { seq_max: 1 }))
    const client1 = connect(h, p, 'e')
    await waitForNth(client1, 'snapshot', 0)

    setSnapshot(h, p, 'e', snapshotEntry(s, 'e', [], 'v2', { seq_max: 2 }))
    const client2 = connect(h, p, 'e')
    const firstSnapshot = await waitForNth(client2, 'snapshot', 0)
    expect((firstSnapshot.data as Snapshot).seq_max).toBe(1)
  })

  test('closing one of two streams keeps the other updating', async () => {
    const h = await buildApp()
    const s = store()
    const p = project()
    setList(h, p, listEntry(s, ['e']))
    setSnapshot(h, p, 'e', snapshotEntry(s, 'e', [], 'v1', { seq_max: 1 }))
    const client1 = connect(h, p, 'e')
    const client2 = connect(h, p, 'e')
    await waitForNth(client1, 'snapshot', 0)
    await waitForNth(client2, 'snapshot', 0)

    client1.close()
    await sleep(100)
    setSnapshot(h, p, 'e', snapshotEntry(s, 'e', [], 'v2', { seq_max: 2 }))
    touchStore(s)
    const secondSnapshot = await waitForNth(client2, 'snapshot', 1)
    expect((secondSnapshot.data as Snapshot).seq_max).toBe(2)
  })

  test('a changed list resends efforts', async () => {
    const h = await buildApp()
    const s = store()
    const p = project()
    setList(h, p, listEntry(s, ['e'], 'l1'))
    setSnapshot(h, p, 'e', snapshotEntry(s, 'e'))
    const client = connect(h, p, 'e')
    await waitForNth(client, 'efforts', 0)

    setList(h, p, listEntry(s, ['e', 'e2'], 'l2'))
    touchStore(s)
    const second = await waitForNth(client, 'efforts', 1)
    expect((second.data as { list: { efforts: Array<{ effort: string }> } }).list.efforts.map((x) => x.effort)).toEqual(['e', 'e2'])
  })

  test('an unchanged digest sends nothing', async () => {
    const h = await buildApp()
    const s = store()
    const p = project()
    setList(h, p, listEntry(s, ['e'], 'l1'))
    setSnapshot(h, p, 'e', snapshotEntry(s, 'e', [], 's1'))
    const client = connect(h, p, 'e')
    await waitForNth(client, 'snapshot', 0)

    // Bump only the list digest and keep the snapshot response identical; the
    // (later) efforts resend proves a full run reached the snapshot stage
    // without producing a new snapshot event.
    setList(h, p, listEntry(s, ['e'], 'l2'))
    touchStore(s)
    await waitForNth(client, 'efforts', 1)
    // The run that resent efforts has reached its snapshot stage by now (list
    // runs before snapshot in one run()); give it a moment to finish either way.
    await sleep(300)
    expect(client.events.filter((e) => e.event === 'snapshot').length).toBe(1)
  })

  test('active nodes turn on polling', async () => {
    const h = await buildApp()
    const activeStore = store()
    const idleStore = store()
    const activeRepo = project()
    const idleRepo = project()
    setList(h, activeRepo, listEntry(activeStore, ['active']))
    setSnapshot(h, activeRepo, 'active', snapshotEntry(activeStore, 'active', [node('.', { status: 'active' })], 'sa'))
    setList(h, idleRepo, listEntry(idleStore, ['idle']))
    setSnapshot(h, idleRepo, 'idle', snapshotEntry(idleStore, 'idle', [], 'si'))

    const activeClient = connect(h, activeRepo, 'active')
    await waitForNth(activeClient, 'snapshot', 0)
    const idleClient = connect(h, idleRepo, 'idle')
    await waitForNth(idleClient, 'snapshot', 0)

    await waitUntil(() => runCount(h, 'snapshot', activeRepo) >= 3, 1500)
    expect(runCount(h, 'snapshot', idleRepo)).toBe(1)
  })

  test('streams get a heartbeat', async () => {
    const h = await buildApp()
    const s = store()
    const p = project()
    setList(h, p, listEntry(s, ['e']))
    setSnapshot(h, p, 'e', snapshotEntry(s, 'e'))
    const client = connect(h, p, 'e')
    await waitUntil(() => client.frames.some((f) => f.startsWith(': ping')), 1000)
  })
})

describe('failures', () => {
  test('a first failure is a problem', async () => {
    const h = await buildApp()
    const s = store()
    const p = project()
    setList(h, p, listEntry(s, ['e']))
    setSnapshot(h, p, 'e', { error: 'boom' })
    const client = connect(h, p, 'e')
    const problem = await waitForNth(client, 'problem', 0, 1000)
    expect((problem.data as Problem).code).toBe('snapshot_failed')
  })

  test('a later failure is stale', async () => {
    const h = await buildApp()
    const s = store()
    const p = project()
    setList(h, p, listEntry(s, ['e']))
    setSnapshot(h, p, 'e', snapshotEntry(s, 'e'))
    const client = connect(h, p, 'e')
    await waitForNth(client, 'snapshot', 0)

    setSnapshot(h, p, 'e', { error: 'boom' })
    touchStore(s)
    const stale = await waitForNth(client, 'stale', 0, 1000)
    expect((stale.data as Problem).code).toBe('snapshot_failed')
  })

  test('a missing agentics reaches the page', async () => {
    const problem: Problem = { code: 'agentics_missing', path: 'nowhere' }
    const h = await buildApp({}, { locate: () => problem })
    const client = connect(h, project(), 'e')
    const received = await waitForNth(client, 'problem', 0, 1000)
    expect(received.data).toEqual(problem)
  })

  test('deleting the project folder sends project_gone', async () => {
    const h = await buildApp()
    const s = store()
    const p = project()
    setList(h, p, listEntry(s, ['e']))
    setSnapshot(h, p, 'e', snapshotEntry(s, 'e'))
    const client = connect(h, p, 'e')
    await waitForNth(client, 'snapshot', 0)

    rmSync(p, { recursive: true, force: true })
    touchStore(s)
    const problem = await waitForNth(client, 'problem', 0, 1500)
    expect(problem.data).toEqual({ code: 'project_gone', path: p })
  })
})

describe('alerts', () => {
  test('the first open raises no toast', async () => {
    const h = await buildApp()
    const s = store()
    const p = project()
    setList(h, p, listEntry(s, ['e']))
    setSnapshot(h, p, 'e', snapshotEntry(s, 'e', [node('.', { status: 'parked', event: { kind: 'parked', seq: 5, question: 'now what?' } })], 's1', { seq_max: 5 }))
    const client = connect(h, p, 'e')
    await waitForNth(client, 'snapshot', 0)
    expect(h.toastCalls.length).toBe(0)
  })

  test('a new park toasts once and saves the watermark', async () => {
    const h = await buildApp()
    const s = store()
    const p = project()
    setList(h, p, listEntry(s, ['e']))
    setSnapshot(h, p, 'e', snapshotEntry(s, 'e', [], 's1', { seq_max: 5 }))
    const client = connect(h, p, 'e')
    await waitForNth(client, 'snapshot', 0)

    setSnapshot(h, p, 'e', snapshotEntry(s, 'e', [node('.', { status: 'parked', event: { kind: 'parked', seq: 6, question: 'now what?' } })], 's2', { seq_max: 6 }))
    touchStore(s)
    await waitUntil(() => h.toastCalls.length === 1, 1500)
    expect(h.toastCalls[0]!.title).toBe('e is waiting on you')
    expect(h.toastCalls[0]!.body).toBe('now what?')
    const finalState = readState(h.stateFile).state
    expect(finalState.alerted[keyOf(s)]?.e).toBe(6)
  })

  test('the watermark is saved before the toast', async () => {
    const h = await buildApp()
    const s = store()
    const p = project()
    setList(h, p, listEntry(s, ['e']))
    setSnapshot(h, p, 'e', snapshotEntry(s, 'e', [], 's1', { seq_max: 5 }))
    const client = connect(h, p, 'e')
    await waitForNth(client, 'snapshot', 0)

    setSnapshot(h, p, 'e', snapshotEntry(s, 'e', [node('.', { status: 'parked', event: { kind: 'parked', seq: 6, question: 'now what?' } })], 's2', { seq_max: 6 }))
    touchStore(s)
    await waitUntil(() => h.toastCalls.length === 1, 1500)
    expect(h.toastCalls[0]!.stateAtCall.alerted[keyOf(s)]?.e).toBe(6)
  })

  test('reopening an effort keeps its watermark', async () => {
    const h = await buildApp()
    const s = store()
    const p = project()
    setList(h, p, listEntry(s, ['e']))
    setSnapshot(h, p, 'e', snapshotEntry(s, 'e', [], 's1', { seq_max: 5 }))
    const client1 = connect(h, p, 'e')
    await waitForNth(client1, 'snapshot', 0)

    setSnapshot(h, p, 'e', snapshotEntry(s, 'e', [node('.', { status: 'parked', event: { kind: 'parked', seq: 6, question: 'now what?' } })], 's2', { seq_max: 6 }))
    touchStore(s)
    await waitUntil(() => h.toastCalls.length === 1, 1500)

    client1.close()
    await sleep(150)

    // While closed, a further park replaces the one already alerted. Reopening
    // must use the watermark (6) persisted from before closing as its baseline
    // and alert on this new one — a "first open" that lost the watermark would
    // silently treat it as history instead.
    setSnapshot(h, p, 'e', snapshotEntry(s, 'e', [node('.', { status: 'parked', event: { kind: 'parked', seq: 7, question: 'again?' } })], 's3', { seq_max: 7 }))

    const client2 = connect(h, p, 'e')
    await waitForNth(client2, 'snapshot', 0)
    await waitUntil(() => h.toastCalls.length === 2, 1500)
    expect(h.toastCalls[1]!.body).toBe('again?')
  })

  test('two efforts keep their own watermarks', async () => {
    const h = await buildApp()
    const s = store()
    const p = project()
    setList(h, p, listEntry(s, ['e1', 'e2']))
    setSnapshot(h, p, 'e1', snapshotEntry(s, 'e1', [], 's1', { seq_max: 5 }))
    setSnapshot(h, p, 'e2', snapshotEntry(s, 'e2', [], 's1', { seq_max: 5 }))
    const client1 = connect(h, p, 'e1')
    const client2 = connect(h, p, 'e2')
    await waitForNth(client1, 'snapshot', 0)
    await waitForNth(client2, 'snapshot', 0)

    setSnapshot(h, p, 'e1', snapshotEntry(s, 'e1', [node('.', { status: 'parked', event: { kind: 'parked', seq: 6, question: 'q1' } })], 's2', { seq_max: 6 }))
    setSnapshot(h, p, 'e2', snapshotEntry(s, 'e2', [node('.', { status: 'parked', event: { kind: 'parked', seq: 7, question: 'q2' } })], 's2', { seq_max: 7 }))
    touchStore(s)
    await waitUntil(() => h.toastCalls.length === 2, 1500)

    const finalState = readState(h.stateFile).state
    expect(finalState.alerted[keyOf(s)]).toEqual({ e1: 6, e2: 7 })
  })

  test('a linked worktree and its main checkout share a watermark', async () => {
    const h = await buildApp()
    const s = store()
    const mainCheckout = project()
    const worktree = project()
    setList(h, mainCheckout, listEntry(s, ['e']))
    setList(h, worktree, listEntry(s, ['e']))
    setSnapshot(h, mainCheckout, 'e', snapshotEntry(s, 'e', [], 's1', { seq_max: 5 }))
    setSnapshot(h, worktree, 'e', snapshotEntry(s, 'e', [], 's1', { seq_max: 5 }))
    const clientMain = connect(h, mainCheckout, 'e')
    await waitForNth(clientMain, 'snapshot', 0)
    const clientWorktree = connect(h, worktree, 'e')
    await waitForNth(clientWorktree, 'snapshot', 0)

    setSnapshot(h, mainCheckout, 'e', snapshotEntry(s, 'e', [node('.', { status: 'parked', event: { kind: 'parked', seq: 6, question: 'q' } })], 's2', { seq_max: 6 }))
    touchStore(s)
    await waitForNth(clientMain, 'snapshot', 1)
    await waitForNth(clientWorktree, 'snapshot', 1)
    expect(h.toastCalls.length).toBe(1)
  })
})

describe('opened projects and state', () => {
  test('opening a project records it', async () => {
    const h = await buildApp()
    const s = store()
    const p = project()
    setList(h, p, listEntry(s, ['e']))
    setSnapshot(h, p, 'e', snapshotEntry(s, 'e'))
    const client = connect(h, p, 'e')
    await waitForNth(client, 'efforts', 0)

    const finalState = readState(h.stateFile).state
    expect(finalState.recent).toContain(p)
    expect(finalState.last).toEqual({ project: p, effort: 'e' })
  })

  test("the app's state is the one it read at start", async () => {
    const home = tempDir()
    tempDirs.push(home)
    const file = statePath(home)
    const seeded: ViewerState = { port: 4747, roots: ['C:\\original'], depth: 4, agentics_path: null, recent: [], last: null, alerted: {} }
    writeState(file, seeded)

    const h = await buildApp({}, { home })
    writeState(file, { ...seeded, roots: ['C:\\hand-edited'] })

    const s = store()
    const p = project()
    setList(h, p, listEntry(s, ['e']))
    setSnapshot(h, p, 'e', snapshotEntry(s, 'e'))
    const client = connect(h, p, 'e')
    await waitForNth(client, 'efforts', 0)

    const finalState = readState(file).state
    expect(finalState.roots).toEqual(['C:\\original'])
  })
})

describe('static files', () => {
  test('dist files are served', async () => {
    const h = await buildApp()
    writeFileSync(join(h.deps.distDir, 'app.js'), 'console.log(1)')
    const res = await fetch(`${h.base}/app.js`)
    expect(await res.text()).toBe('console.log(1)')
  })

  test('unknown paths get the page', async () => {
    const h = await buildApp()
    const res = await fetch(`${h.base}/some/unknown/path`)
    expect(await res.text()).toBe('<html>viewer</html>')
  })

  test('paths cannot climb out of dist', async () => {
    const h = await buildApp()
    const res = await fetch(`${h.base}/..%2f..%2fpackage.json`)
    expect(res.status).toBe(403)
    // Windows resolves backslashes as separators too: `..%5c..%5c` decodes to
    // `..\..\`, a single path.split('/') segment that a forward-slash-only
    // check would miss.
    const backslashRes = await fetch(`${h.base}/..%5c..%5cpackage.json`)
    expect(backslashRes.status).toBe(403)
  })
})
