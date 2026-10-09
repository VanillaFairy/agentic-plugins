// Starts the viewer: reads the config, builds the page when its sources are newer than the
// build, serves it, and with --open shows it in the default browser. When the viewer already
// runs on the port, only opens it.

import http from 'node:http'
import { execFile, spawn } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP_NAME, PACKAGE_VERSION, createApp } from './app.ts'
import { configPath, readConfig } from './config.ts'
import { SessionIndex } from './sessions.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DAY_MS = 24 * 60 * 60 * 1000
const MINUTE_MS = 60 * 1000
const LIVE_MS = 2 * MINUTE_MS

function health(port: number): Promise<unknown> {
  return fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) })
    .then(res => res.json())
    .catch(() => null)
}

function portFree(port: number): Promise<boolean> {
  return new Promise(done => {
    const probe = http.createServer()
    probe.once('error', () => done(false))
    probe.listen(port, '127.0.0.1', () => probe.close(() => done(true)))
  })
}

function newestUnder(dir: string): number {
  let newest = 0
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) newest = Math.max(newest, statSync(join(entry.parentPath, entry.name)).mtimeMs)
  }
  return newest
}

function buildIfStale(): Promise<void> {
  const built = join(ROOT, 'dist', 'index.html')
  const sources = Math.max(newestUnder(join(ROOT, 'web')), newestUnder(join(ROOT, 'shared')), statSync(join(ROOT, 'package.json')).mtimeMs)
  if (existsSync(built) && statSync(built).mtimeMs >= sources) return Promise.resolve()
  console.log('building the page…')
  return new Promise((done, fail) => {
    execFile('npx', ['vite', 'build'], { cwd: ROOT, shell: true }, (err, stdout, stderr) => {
      if (err === null) done()
      else fail(new Error(stdout + stderr))
    })
  })
}

function openBrowser(url: string): void {
  const [cmd, args] = process.platform === 'win32' ? ['explorer.exe', [url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]]
  spawn(cmd, args, { detached: true, stdio: 'ignore' })
    .on('error', err => console.error('could not open the browser', err))
    .unref()
}

async function main(): Promise<void> {
  const { config, problem } = readConfig(homedir(), process.argv.slice(2))
  if (problem !== undefined) console.log(`${configPath(homedir())}: ${problem}`)
  const url = `http://127.0.0.1:${config.port}`
  const open = process.argv.includes('--open')

  const running = await health(config.port)
  if (typeof running === 'object' && running !== null && (running as Record<string, unknown>).app === APP_NAME) {
    console.log(`agent tree viewer is already running at ${url}`)
    if (open) openBrowser(url)
    return
  }
  if (!(await portFree(config.port))) {
    console.log(`port ${config.port} is in use. Pass --port <n>, or set "port" in ${configPath(homedir())}`)
    process.exit(1)
  }

  try {
    await buildIfStale()
  } catch (err) {
    console.error(String(err))
    process.exit(1)
  }

  const appData = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
  const index = new SessionIndex({
    projectsDir: join(homedir(), '.claude', 'projects'),
    desktopDir: join(appData, 'Claude', 'claude-code-sessions'),
    maxAgeMs: config.maxAgeDays * DAY_MS,
    liveMs: LIVE_MS,
  })
  const app = createApp({ port: config.port, distDir: join(ROOT, 'dist'), index, staleMs: config.staleMinutes * MINUTE_MS, now: Date.now })
  await new Promise<void>(done => app.server.on('listening', done))
  console.log(`agent tree viewer ${PACKAGE_VERSION} at ${url}`)
  if (open) openBrowser(url)

  process.on('SIGINT', () => {
    void app.close().then(() => process.exit(0))
  })
}

void main()
