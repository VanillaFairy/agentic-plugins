// Wires start.ts's pure decisions to real I/O: state file, health probe, vite build,
// createApp, SIGINT. Holds no decision of its own.

import http from 'node:http'
import { execFile } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { realClock } from './clock.ts'
import { locateAgentics } from './agentics.ts'
import { showToast, pickFolder, openBrowser } from './windows.ts'
import { readState, statePath } from './state.ts'
import { createApp } from './app.ts'
import { needsBuild, startDecision } from './start.ts'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const VIEWER_ROOT = join(HERE, '..')

function fetchHealth(port: number): Promise<unknown> {
  return fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) })
    .then((res) => res.json())
    .catch(() => null)
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = http.createServer()
    probe.once('error', () => resolve(false))
    probe.listen(port, '127.0.0.1', () => {
      probe.close(() => resolve(true))
    })
  })
}

function newestMtimeUnder(dir: string): number {
  let newest = 0
  const walk = (d: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.isFile()) {
        const mtime = statSync(full).mtimeMs
        if (mtime > newest) newest = mtime
      }
    }
  }
  walk(dir)
  return newest
}

function runViteBuild(): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    execFile('npx', ['vite', 'build'], { cwd: VIEWER_ROOT, shell: true }, (err, stdout, stderr) => {
      const code = err === null ? 0 : typeof err.code === 'number' ? err.code : 1
      resolve({ code, output: stdout + stderr })
    })
  })
}

async function main(): Promise<void> {
  const stateFile = statePath(homedir())
  const { state, problem } = readState(stateFile)
  if (problem !== null) console.log(problem)
  const url = `http://127.0.0.1:${state.port}`
  // --open: also show the viewer in the default browser, whether this starts it or it already runs.
  const open = process.argv.includes('--open')

  const health = await fetchHealth(state.port)
  const portFree = await isPortFree(state.port)

  const decision = startDecision(health, portFree)
  if (decision === 'already-running') {
    console.log(`agentics viewer is already running at ${url}`)
    if (open) openBrowser(url)
    process.exit(0)
  }
  if (decision === 'port-taken') {
    console.log(`port ${state.port} is in use; set "port" in ~/.agentics-viewer/state.json`)
    process.exit(1)
  }

  const webDir = join(VIEWER_ROOT, 'web')
  const distIndex = join(VIEWER_ROOT, 'dist', 'index.html')
  const distIndexMtime = existsSync(distIndex) ? statSync(distIndex).mtimeMs : null
  if (needsBuild(newestMtimeUnder(webDir), distIndexMtime)) {
    const { code, output } = await runViteBuild()
    if (code !== 0) {
      console.error(output)
      process.exit(1)
    }
  }

  const app = createApp({
    port: state.port,
    stateFile,
    distDir: join(VIEWER_ROOT, 'dist'),
    clock: realClock,
    locate: () =>
      locateAgentics({
        override: state.agentics_path,
        installedPlugins: join(homedir(), '.claude', 'plugins', 'installed_plugins.json'),
      }),
    toast: showToast,
    pickFolder,
    log: console.log,
  })

  await new Promise<void>((resolve) => app.server.on('listening', resolve))
  console.log(`agentics viewer at ${url}`)
  if (open) openBrowser(url)

  process.on('SIGINT', () => {
    void app.close().then(() => process.exit(0))
  })
}

void main()
