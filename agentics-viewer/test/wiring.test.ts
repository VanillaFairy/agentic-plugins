import { afterEach, describe, expect, test } from 'vitest'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { realClock } from '../server/clock.ts'
import { statePath } from '../server/state.ts'
import { createApp } from '../server/app.ts'
import type { AppDeps } from '../server/app.ts'
import type { AgenticsLocation } from '../server/agentics.ts'
import type { Snapshot } from '../shared/snapshot.ts'
import type { FolderPick } from '../server/windows.ts'

// An end-to-end wiring check: a real fixture project on disk, a real
// fs.watch-backed watcher, and a fake `lib/status.mjs` that reads the fixture
// itself (rather than a control file) so a write to events.jsonl really is
// what drives a new snapshot.

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface SseClient {
  events: Array<{ event: string; data: unknown }>
  close(): void
}

function connectSse(url: string): SseClient {
  const events: Array<{ event: string; data: unknown }> = []
  const controller = new AbortController()
  fetch(url, { signal: controller.signal })
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

function tempDir(prefix = 'agentics-viewer-'): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

function fixtureProject(): { root: string; store: string; eventsFile: string } {
  const root = tempDir('agentics-viewer-fixture-')
  const store = join(root, '.agentics')
  mkdirSync(join(store, 'eff', '.state'), { recursive: true })
  const eventsFile = join(store, 'eff', '.state', 'events.jsonl')
  writeFileSync(eventsFile, '{"seq":1}\n')
  return { root, store, eventsFile }
}

// Builds the fake agentics install: `list` reports the fixture's one effort,
// `snapshot` reports seq_max as the number of lines in events.jsonl (so a
// real append is what changes its digest). Every call is logged outside
// `.agentics/`, so tests can prove a run did or didn't happen.
function fakeAgentics(dir: string, store: string, eventsFile: string, runLogFile: string): void {
  mkdirSync(join(dir, 'lib'), { recursive: true })
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true })
  writeFileSync(join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({ version: '1.0.0' }))
  const script = `
import { readFileSync, appendFileSync } from 'node:fs'
const cmd = process.argv[2]
try { appendFileSync(${JSON.stringify(runLogFile)}, cmd + '\\n') } catch {}
if (cmd === 'list') {
  console.log(JSON.stringify({
    payload: { repo: 'r', store: ${JSON.stringify(store)}, store_present: true, efforts: [{ effort: 'eff', about: '', root_status: 'planned', seq_max: 0, malformed: 0 }], notes: '' },
    payload_digest: 'list-1',
  }))
} else {
  let lines = 0
  try { lines = readFileSync(${JSON.stringify(eventsFile)}, 'utf8').split('\\n').filter(Boolean).length } catch {}
  console.log(JSON.stringify({
    payload: { format: 1, store: ${JSON.stringify(store)}, effort: 'eff', about: '', seq_max: lines, malformed: 0, folders: [], nodes: [], cost: { dispatches: 0, tokens: 0, tokens_unreported: 0, per_leaf: {} } },
    payload_digest: String(lines),
  }))
}
`
  writeFileSync(join(dir, 'lib', 'status.mjs'), script)
}

interface Harness {
  app: ReturnType<typeof createApp>
  base: string
  runLogFile: string
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

async function buildWiringApp(store: string, eventsFile: string, overrides: Partial<AppDeps> = {}): Promise<Harness> {
  const home = tempDir()
  tempDirs.push(home)
  const distDir = tempDir()
  tempDirs.push(distDir)
  writeFileSync(join(distDir, 'index.html'), '<html>viewer</html>')

  const agenticsDir = tempDir()
  tempDirs.push(agenticsDir)
  const runLogFile = join(agenticsDir, 'runs.log')
  writeFileSync(runLogFile, '')
  fakeAgentics(agenticsDir, store, eventsFile, runLogFile)

  const deps: AppDeps = {
    port: 0,
    stateFile: statePath(home),
    distDir,
    clock: realClock,
    locate: (): AgenticsLocation => ({ path: agenticsDir, version: '1.0.0' }),
    toast: async (): Promise<void> => {},
    pickFolder: async (): Promise<FolderPick> => ({ path: 'C:/x' }),
    log: () => {},
    ...overrides,
  }
  const app = createApp(deps)
  await new Promise<void>((resolve) => app.server.on('listening', resolve))
  const address = app.server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  cleanups.push(() => app.close())
  return { app, base: `http://127.0.0.1:${port}`, runLogFile }
}

function connect(h: Harness, project: string): SseClient {
  const client = connectSse(`${h.base}/api/stream?${new URLSearchParams({ project })}`)
  cleanups.push(() => client.close())
  return client
}

function runLines(runLogFile: string): number {
  return readFileSync(runLogFile, 'utf8').split('\n').filter((l) => l.startsWith('snapshot')).length
}

function snapshotBytes(dir: string): Record<string, string> {
  const out: Record<string, string> = {}
  function walk(d: string, prefix: string): void {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry)
      const rel = prefix === '' ? entry : `${prefix}/${entry}`
      const stat = statSync(full)
      if (stat.isDirectory()) walk(full, rel)
      else out[rel] = readFileSync(full).toString('base64')
    }
  }
  walk(dir, '')
  return out
}

describe('wiring', () => {
  test('a write reaches the page within a second and a half', async () => {
    const { root, store, eventsFile } = fixtureProject()
    tempDirs.push(root)
    const h = await buildWiringApp(store, eventsFile)
    const client = connect(h, root)
    const first = await waitForNth(client, 'snapshot', 0)
    expect((first.data as Snapshot).seq_max).toBe(1)

    appendFileSync(eventsFile, '{"seq":2}\n')
    const second = await waitForNth(client, 'snapshot', 1, 1500)
    expect((second.data as Snapshot).seq_max).toBe(2)
  })

  test('the viewer writes nothing under .agentics', async () => {
    const { root, store, eventsFile } = fixtureProject()
    tempDirs.push(root)
    const before = snapshotBytes(store)

    const h = await buildWiringApp(store, eventsFile)
    const client = connect(h, root)
    await waitForNth(client, 'snapshot', 0)
    await sleep(300)

    expect(snapshotBytes(store)).toEqual(before)
  })

  test('the last stream closing stops watching', async () => {
    const { root, store, eventsFile } = fixtureProject()
    tempDirs.push(root)
    // app.ts logs `store change: <key>` for every raw fs.watch event that
    // reaches the app, before checking whether any scheduler is left to
    // notify. That makes a still-open watcher observable even though the
    // (correctly emptied) efforts map would otherwise swallow the evidence.
    const logMessages: string[] = []
    const h = await buildWiringApp(store, eventsFile, { log: (m) => { logMessages.push(m) } })
    const client = connect(h, root)
    await waitForNth(client, 'snapshot', 0)
    const before = runLines(h.runLogFile)

    client.close()
    await sleep(200)
    const logsAtClose = logMessages.length
    appendFileSync(eventsFile, '{"seq":2}\n')
    await sleep(1000)

    expect(runLines(h.runLogFile)).toBe(before)
    expect(logMessages.length).toBe(logsAtClose)
  })
})
