import { afterEach, describe, expect, test } from 'vitest'
import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { needsBuild, startDecision } from '../server/start.ts'
import { realClock } from '../server/clock.ts'
import { createApp } from '../server/app.ts'
import { DEFAULT_STATE, statePath } from '../server/state.ts'
import type { AppDeps } from '../server/app.ts'
import type { AgenticsLocation } from '../server/agentics.ts'
import type { FolderPick } from '../server/windows.ts'

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'agentics-viewer-'))
}

const tempDirs: string[] = []
const cleanups: Array<() => Promise<void> | void> = []

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()!()
  }
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true })
  }
})

describe('startDecision', () => {
  test('a running viewer is recognised', () => {
    expect(startDecision({ app: 'agentics-viewer', version: '1.0.0' }, false)).toBe('already-running')
    expect(startDecision({ app: 'agentics-viewer', version: '1.0.0' }, true)).toBe('already-running')
  })

  test('a free port runs', () => {
    expect(startDecision(null, true)).toBe('run')
  })

  test('a port held by something else is taken', () => {
    expect(startDecision(null, false)).toBe('port-taken')
  })

  test('another app on the port is taken', () => {
    expect(startDecision({ app: 'some-other-app' }, false)).toBe('port-taken')
  })
})

describe('needsBuild', () => {
  test('no dist means build', () => {
    expect(needsBuild(1234, null)).toBe(true)
  })

  test('build only when web is newer', () => {
    expect(needsBuild(20, 10)).toBe(true)
    expect(needsBuild(10, 20)).toBe(false)
  })
})

describe('main.ts', () => {
  test('a second start against a running viewer exits 0', async () => {
    const distDir = tempDir()
    tempDirs.push(distDir)
    writeFileSync(join(distDir, 'index.html'), '<html>viewer</html>')

    const stateDir = tempDir()
    tempDirs.push(stateDir)
    const deps: AppDeps = {
      port: 0,
      stateFile: join(stateDir, 'state.json'),
      distDir,
      clock: realClock,
      locate: (): AgenticsLocation => ({ path: 'C:/agentics', version: '1.0.0' }),
      toast: async (): Promise<void> => {},
      pickFolder: async (): Promise<FolderPick> => ({ cancelled: true }),
      log: () => {},
    }
    const app = createApp(deps)
    await new Promise<void>((resolve) => app.server.on('listening', resolve))
    cleanups.push(() => app.close())
    const address = app.server.address()
    const port = typeof address === 'object' && address !== null ? address.port : 0

    const home = tempDir()
    tempDirs.push(home)
    mkdirSync(join(home, '.agentics-viewer'), { recursive: true })
    writeFileSync(statePath(home), JSON.stringify({ ...DEFAULT_STATE, port }))

    const cwd = join(import.meta.dirname, '..')
    const result = await new Promise<{ code: number | null; stdout: string }>((resolve) => {
      execFile(
        process.execPath,
        ['server/main.ts'],
        { cwd, env: { ...process.env, USERPROFILE: home, HOME: home }, timeout: 10_000 },
        (err, stdout) => {
          const errCode = (err as NodeJS.ErrnoException & { code?: number } | null)?.code
          const code = err === null ? 0 : typeof errCode === 'number' ? errCode : -1
          resolve({ code, stdout })
        },
      )
    })

    expect(result.code).toBe(0)
    expect(result.stdout).toContain(`agentics viewer is already running at http://127.0.0.1:${port}`)
  })
})
