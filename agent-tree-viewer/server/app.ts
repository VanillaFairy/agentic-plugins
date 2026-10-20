// The viewer's HTTP server: the session list, a live stream per session, and the built page.

import http from 'node:http'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ProjectGroup, SessionSnapshot } from '../shared/model.ts'
import { SessionWatch } from './live.ts'
import type { SessionIndex } from './sessions.ts'

const HERE = fileURLToPath(new URL('.', import.meta.url))
export const PACKAGE_VERSION = (JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf8')) as { version: string }).version
export const APP_NAME = 'agent-tree-viewer'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}
const SSE_HEADERS = { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' }
const POLL_MS = 600
const HEARTBEAT_MS = 15000
// A listing walks every project folder, so callers within this long share one.
const LIST_REUSE_MS = 1500

// Only pages served from this server may read it: no other site in the browser can.
export function hostAllowed(headers: http.IncomingHttpHeaders, port: number): boolean {
  const ok = [`127.0.0.1:${port}`, `localhost:${port}`]
  if (headers.host === undefined || !ok.includes(headers.host)) return false
  return headers.origin === undefined || ok.map(h => `http://${h}`).includes(headers.origin)
}

// Without its clock, so a snapshot that only aged compares equal to the last one sent.
const content = (s: SessionSnapshot) => JSON.stringify({ ...s, now: 0 })

type Stream = { watch: SessionWatch; clients: Set<http.ServerResponse>; last: string; timer: NodeJS.Timeout }

export type AppDeps = {
  port: number
  distDir: string
  index: SessionIndex
  staleMs: number
  now: () => number
}

// The built page, read once at start. Another viewer started on this folder rebuilds the page on
// disk; a server that kept reading it would hand its clients a page its own API does not match.
function readPage(dir: string): Map<string, Buffer> {
  const files = new Map<string, Buffer>()
  if (!existsSync(dir)) return files
  for (const name of readdirSync(dir, { recursive: true, encoding: 'utf8' })) {
    const file = join(dir, name)
    if (statSync(file).isFile()) files.set(name.split(sep).join('/'), readFileSync(file))
  }
  return files
}

export function createApp(deps: AppDeps): { server: http.Server; close: () => Promise<void> } {
  const streams = new Map<string, Stream>()
  const page = readPage(deps.distDir)
  let listed: { at: number; groups: ProjectGroup[] } | undefined

  const list = (): ProjectGroup[] => {
    const now = deps.now()
    if (listed === undefined || now - listed.at > LIST_REUSE_MS) listed = { at: now, groups: deps.index.list(now) }
    return listed.groups
  }

  const push = (stream: Stream, id: string, force: boolean): void => {
    const found = deps.index.find(id)
    if (found === undefined) return
    const project = list().find(g => g.sessions.some(s => s.id === id))
    const { live, waitingFor } = found.row
    const presence = waitingFor === undefined ? { live } : { live, waitingFor }
    const snap = stream.watch.snapshot(deps.now(), found.row.title, { path: found.row.path, name: project?.name ?? found.row.path }, presence)
    const body = content(snap)
    if (!force && body === stream.last) return
    stream.last = body
    const frame = `event: snapshot\ndata: ${JSON.stringify(snap)}\n\n`
    for (const res of stream.clients) res.write(frame)
  }

  const openStream = (id: string, res: http.ServerResponse): void => {
    list()
    const found = deps.index.find(id)
    if (found === undefined) {
      res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ error: `No session ${id} in the last listing` }))
      return
    }
    res.writeHead(200, SSE_HEADERS)
    let stream = streams.get(id)
    if (stream === undefined) {
      const created: Stream = {
        watch: new SessionWatch(found.files, deps.staleMs, found.row.path),
        clients: new Set(),
        last: '',
        timer: setInterval(() => {
          try {
            push(created, id, false)
          } catch (err) {
            console.error(`agent-tree-viewer: reading session ${id} failed`, err)
          }
        }, POLL_MS),
      }
      stream = created
      streams.set(id, stream)
    }
    stream.clients.add(res)
    // A new client needs the current tree even when nothing changed since the last push.
    push(stream, id, true)
    const beat = setInterval(() => res.write(': beat\n\n'), HEARTBEAT_MS)
    res.on('close', () => {
      clearInterval(beat)
      const s = streams.get(id)
      if (s === undefined) return
      s.clients.delete(res)
      if (s.clients.size === 0) {
        clearInterval(s.timer)
        streams.delete(id)
      }
    })
  }

  // The session's open stream when there is one, so its transcripts are read only once.
  const watchOf = (sessionId: string): SessionWatch | undefined => {
    const open = streams.get(sessionId)?.watch
    if (open !== undefined) return open
    list()
    const found = deps.index.find(sessionId)
    return found === undefined ? undefined : new SessionWatch(found.files, deps.staleMs, found.row.path)
  }
  const json = (res: http.ServerResponse, body: unknown) =>
    body === undefined
      ? res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'No such session, agent or call' }))
      : res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body))

  const serveStatic = (urlPath: string, res: http.ServerResponse): void => {
    const asked = decodeURIComponent(urlPath).replace(/^\/+/, '')
    const name = page.has(asked) ? asked : 'index.html'
    const body = page.get(name)
    if (body === undefined) {
      res.writeHead(500, { 'content-type': 'text/plain' }).end('The page is not built. Run `npm run build`.')
      return
    }
    res.writeHead(200, { 'content-type': MIME[extname(name)] ?? 'application/octet-stream' }).end(body)
  }

  const server = http.createServer((req, res) => {
    if (!hostAllowed(req.headers, deps.port)) {
      res.writeHead(403).end()
      return
    }
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${deps.port}`)
    const stream = /^\/api\/sessions\/([^/]+)\/stream$/.exec(url.pathname)
    const node = /^\/api\/sessions\/([^/]+)\/nodes\/([^/]+)$/.exec(url.pathname)
    const call = /^\/api\/sessions\/([^/]+)\/nodes\/([^/]+)\/calls\/([^/]+)$/.exec(url.pathname)
    try {
      if (url.pathname === '/api/health') {
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ app: APP_NAME, version: PACKAGE_VERSION }))
      } else if (url.pathname === '/api/sessions') {
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(list()))
      } else if (stream?.[1] !== undefined) {
        openStream(decodeURIComponent(stream[1]), res)
      } else if (node?.[1] !== undefined && node[2] !== undefined) {
        json(res, watchOf(decodeURIComponent(node[1]))?.detail(decodeURIComponent(node[2])))
      } else if (call?.[1] !== undefined && call[2] !== undefined && call[3] !== undefined) {
        json(res, watchOf(decodeURIComponent(call[1]))?.call(decodeURIComponent(call[2]), decodeURIComponent(call[3])))
      } else if (url.pathname.startsWith('/api/')) {
        res.writeHead(404).end()
      } else {
        serveStatic(url.pathname, res)
      }
    } catch (err) {
      console.error('agent-tree-viewer: request failed', err)
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' }).end(String(err))
    }
  })
  server.listen(deps.port, '127.0.0.1')

  return {
    server,
    close: () =>
      new Promise<void>(done => {
        for (const s of streams.values()) {
          clearInterval(s.timer)
          for (const res of s.clients) res.end()
        }
        streams.clear()
        server.close(() => done())
      }),
  }
}
