import http from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Clock, TimerHandle } from './clock.ts'
import type { SchedulerOptions, Scheduler } from './watch.ts'
import { createScheduler, watchStore } from './watch.ts'
import type { AgenticsLocation, RunResult } from './agentics.ts'
import { runList, runSnapshot } from './agentics.ts'
import type { EffortsList, Problem, Snapshot } from '../shared/snapshot.ts'
import type { FolderPick } from './windows.ts'
import type { ViewerState } from './state.ts'
import { addRecent, projectKey, readState, writeState } from './state.ts'
import { createDiscovery, latestEffort, recentProjects } from './projects.ts'
import { diffAlerts } from './alerts.ts'

export interface AppDeps {
  port: number
  stateFile: string
  distDir: string
  clock: Clock
  locate: () => AgenticsLocation | Problem
  toast: (title: string, body: string) => Promise<void>
  pickFolder: () => Promise<FolderPick>
  log: (m: string) => void
  heartbeatMs?: number
  timings?: SchedulerOptions
}

const HERE = fileURLToPath(new URL('.', import.meta.url))
export const PACKAGE_VERSION = (JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf8')) as { version: string }).version

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

const SSE_HEADERS = { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' }

export function hostAllowed(headers: http.IncomingHttpHeaders, port: number): boolean {
  const host = headers.host
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return false
  const origin = headers.origin
  if (origin !== undefined && origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`) return false
  return true
}

function isProblem(x: AgenticsLocation | Problem): x is Problem {
  return 'code' in x
}

interface StreamConn {
  res: http.ServerResponse
  hasSnapshot: boolean
}

interface EffortState {
  scheduler: Scheduler
  streams: Set<StreamConn>
  snapshot: Snapshot | null
  snapshotDigest: string | null
  listDigest: string | null
}

interface KeyState {
  project: string
  watcher: { close(): void } | null
  efforts: Map<string, EffortState>
  openCount: number
}

function sendEvent(res: http.ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

function broadcast(streams: Iterable<StreamConn>, event: string, data: unknown): void {
  for (const conn of streams) sendEvent(conn.res, event, data)
}

function mimeFor(path: string): string {
  const dot = path.lastIndexOf('.')
  return dot === -1 ? 'application/octet-stream' : (MIME[path.slice(dot)] ?? 'application/octet-stream')
}

export function createApp(deps: AppDeps): { server: http.Server; close(): Promise<void> } {
  const heartbeatMs = deps.heartbeatMs ?? 15000
  const discovery = createDiscovery(deps.clock)

  const { state: startState, problem: readProblem } = readState(deps.stateFile)
  if (readProblem !== null) deps.log(readProblem)
  let state: ViewerState = startState

  const keys = new Map<string, KeyState>()
  const allStreams = new Set<StreamConn>()

  function saveState(next: ViewerState): void {
    state = next
    writeState(deps.stateFile, state)
  }

  function failOrStale(effortState: EffortState, problem: Problem): void {
    for (const conn of effortState.streams) {
      sendEvent(conn.res, conn.hasSnapshot ? 'stale' : 'problem', problem)
    }
  }

  async function runPair(key: string, effort: string): Promise<void> {
    const keyState = keys.get(key)
    if (keyState === undefined) return
    const effortState = keyState.efforts.get(effort)
    if (effortState === undefined) return

    if (!existsSync(keyState.project)) {
      broadcast(effortState.streams, 'problem', { code: 'project_gone', path: keyState.project })
      return
    }

    const loc = deps.locate()
    if (isProblem(loc)) {
      failOrStale(effortState, loc)
      return
    }

    const listResult: RunResult<EffortsList> = await runList(loc, keyState.project)
    if (!listResult.ok) {
      failOrStale(effortState, listResult.problem)
      return
    }
    if (listResult.digest !== effortState.listDigest) {
      effortState.listDigest = listResult.digest
      broadcast(effortState.streams, 'efforts', { list: listResult.payload, selected: effort })
    }

    const snapResult: RunResult<Snapshot> = await runSnapshot(loc, keyState.project, effort)
    if (!snapResult.ok) {
      failOrStale(effortState, snapResult.problem)
      return
    }
    if (snapResult.digest !== effortState.snapshotDigest) {
      effortState.snapshotDigest = snapResult.digest
      effortState.snapshot = snapResult.payload
      broadcast(effortState.streams, 'snapshot', snapResult.payload)
      for (const conn of effortState.streams) conn.hasSnapshot = true
      effortState.scheduler.setActive(snapResult.payload.nodes.some((n) => n.status === 'active'))
    }

    const watermark = state.alerted[key]?.[effort]
    const { alerts, watermark: nextWatermark } = diffAlerts(snapResult.payload, watermark)
    if (nextWatermark !== watermark) {
      saveState({ ...state, alerted: { ...state.alerted, [key]: { ...state.alerted[key], [effort]: nextWatermark } } })
    }
    for (const alert of alerts) {
      await deps.toast(alert.title, alert.body)
    }
  }

  function handleStream(req: http.IncomingMessage, res: http.ServerResponse, query: URLSearchParams): void {
    const project = query.get('project')
    if (project === null) {
      res.writeHead(400).end()
      return
    }
    const effortParam = query.get('effort')

    res.writeHead(200, SSE_HEADERS)
    const conn: StreamConn = { res, hasSnapshot: false }
    allStreams.add(conn)
    sendEvent(res, 'hello', { version: PACKAGE_VERSION })

    let cleanupDone = false
    let disposeFn: (() => void) | undefined
    function cleanup(): void {
      if (cleanupDone) return
      cleanupDone = true
      allStreams.delete(conn)
      disposeFn?.()
    }
    req.on('close', cleanup)

    if (!existsSync(project)) {
      sendEvent(res, 'problem', { code: 'project_gone', path: project })
      return
    }

    const loc = deps.locate()
    if (isProblem(loc)) {
      sendEvent(res, 'problem', loc)
      return
    }

    runList(loc, project).then((listResult) => {
      if (cleanupDone) return
      if (!listResult.ok) {
        sendEvent(res, 'problem', listResult.problem)
        return
      }
      const list = listResult.payload
      const key = projectKey(dirname(list.store))
      const names = list.efforts.map((e) => e.effort)
      const effort = effortParam ?? latestEffort(list.store, names)
      sendEvent(res, 'efforts', { list, selected: effort })

      let keyState = keys.get(key)
      const isNewKey = keyState === undefined
      if (keyState === undefined) {
        keyState = { project, watcher: null, efforts: new Map(), openCount: 0 }
        keys.set(key, keyState)
      }
      const openKeyState = keyState
      // Every stream attached to this key counts here, whether or not it has
      // an effort (an effortless stream never gets an EffortState entry, so
      // `efforts.size` alone can't tell us when the key is truly unused).
      openKeyState.openCount += 1
      if (isNewKey) {
        let next = addRecent(state, project)
        if (effort !== null) next = { ...next, last: { project, effort } }
        saveState(next)
        openKeyState.watcher = watchStore(list.store, () => {
          // No effort is attached right now (either none is open yet, or the
          // last one just closed): there's nothing to `notify()`, so a leaked
          // watcher would otherwise be invisible. Logging here is the only
          // trace such a leak leaves.
          if (openKeyState.efforts.size === 0) deps.log(`store change with no effort open: ${key}`)
          for (const es of openKeyState.efforts.values()) es.scheduler.notify()
        }, { clock: deps.clock, log: deps.log })
      }

      function releaseKey(): void {
        openKeyState.openCount -= 1
        if (openKeyState.openCount === 0) {
          openKeyState.watcher?.close()
          keys.delete(key)
        }
      }

      if (effort === null) {
        disposeFn = releaseKey
        return
      }

      let effortState = openKeyState.efforts.get(effort)
      if (effortState === undefined) {
        effortState = {
          scheduler: createScheduler(() => runPair(key, effort), deps.clock, deps.timings),
          streams: new Set(),
          snapshot: null,
          snapshotDigest: null,
          listDigest: null,
        }
        openKeyState.efforts.set(effort, effortState)
      }
      const openEffortState = effortState
      openEffortState.streams.add(conn)
      if (openEffortState.snapshot !== null) {
        sendEvent(res, 'snapshot', openEffortState.snapshot)
        conn.hasSnapshot = true
      }
      openEffortState.scheduler.notify()

      disposeFn = () => {
        openEffortState.streams.delete(conn)
        if (openEffortState.streams.size === 0) {
          openEffortState.scheduler.dispose()
          openKeyState.efforts.delete(effort)
        }
        releaseKey()
      }
    })
  }

  function serveStatic(pathname: string, res: http.ServerResponse): void {
    let decoded: string
    try {
      decoded = decodeURIComponent(pathname)
    } catch {
      decoded = pathname
    }
    const rel = decoded === '/' ? 'index.html' : decoded.slice(1)
    const distRoot = resolve(deps.distDir)
    const filePath = resolve(distRoot, rel)
    if (filePath !== distRoot && !filePath.startsWith(distRoot + sep)) {
      res.writeHead(403).end()
      return
    }
    let servedPath = filePath
    let body: Buffer
    try {
      if (!statSync(filePath).isFile()) throw new Error('not a file')
      body = readFileSync(filePath)
    } catch {
      servedPath = join(deps.distDir, 'index.html')
      body = readFileSync(servedPath)
    }
    res.writeHead(200, { 'content-type': mimeFor(servedPath) })
    res.end(body)
  }

  let boundPort = deps.port
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://internal')
    if (!hostAllowed(req.headers, boundPort)) {
      res.writeHead(403).end()
      return
    }
    if (req.method === 'GET' && url.pathname === '/api/health') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ app: 'agentics-viewer', version: PACKAGE_VERSION }))
      return
    }
    if (req.method === 'GET' && url.pathname === '/api/projects') {
      const found = discovery.list(state.roots, state.depth)
      const recent = recentProjects(state.recent)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ found, recent, last: state.last }))
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/browse') {
      deps.pickFolder().then((result) => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify(result))
      })
      return
    }
    if (req.method === 'GET' && url.pathname === '/api/stream') {
      handleStream(req, res, url.searchParams)
      return
    }
    if (req.method === 'GET') {
      serveStatic(url.pathname, res)
      return
    }
    res.writeHead(404).end()
  })

  server.on('listening', () => {
    const addr = server.address()
    if (addr !== null && typeof addr === 'object') boundPort = addr.port
  })
  server.listen(deps.port, '127.0.0.1')

  let heartbeatTimer: TimerHandle | null = null
  function scheduleHeartbeat(): void {
    heartbeatTimer = deps.clock.setTimeout(() => {
      for (const conn of allStreams) conn.res.write(': ping\n\n')
      scheduleHeartbeat()
    }, heartbeatMs)
  }
  scheduleHeartbeat()

  return {
    server,
    close(): Promise<void> {
      if (heartbeatTimer !== null) deps.clock.clearTimeout(heartbeatTimer)
      for (const conn of [...allStreams]) conn.res.end()
      for (const keyState of keys.values()) {
        keyState.watcher?.close()
        for (const es of keyState.efforts.values()) es.scheduler.dispose()
      }
      keys.clear()
      return new Promise((resolve) => server.close(() => resolve()))
    },
  }
}
