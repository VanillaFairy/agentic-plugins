import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { locateAgentics, runSnapshot, runList } from '../server/agentics.ts'
import { FORMAT } from '../shared/snapshot.ts'
import type { AgenticsLocation } from '../server/agentics.ts'

function fakeAgentics(dir: string, body: string, version = '4.0.0') {
  mkdirSync(join(dir, 'lib'), { recursive: true })
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true })
  writeFileSync(join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({ version }))
  writeFileSync(join(dir, 'lib', 'status.mjs'), body)
}

function installedPluginsFile(dir: string, installPath: string): string {
  const path = join(dir, 'installed_plugins.json')
  writeFileSync(path, JSON.stringify({ plugins: { 'agentics@vanillafairy': [{ installPath }] } }))
  return path
}

const okBody = `
console.log(JSON.stringify({
  payload: {
    format: ${FORMAT}, store: 's', effort: 'e', about: '', seq_max: 0, malformed: 0,
    folders: [], nodes: [], cost: { dispatches: 0, tokens: 0, usd: 0, unmeasured: 0, by_model: {}, per_leaf: {}, per_folder: {} },
    argv: process.argv.slice(2),
  },
  payload_digest: '00000000',
}))
`

const tooOldBody = `
console.log(JSON.stringify({ error: 'unknown command "snapshot" — expected list, show, todos or cost' }))
process.exit(1)
`

function formatBody(format: number): string {
  return `
console.log(JSON.stringify({
  payload: { format: ${format}, store: 's', effort: 'e', about: '', seq_max: 0, malformed: 0, folders: [], nodes: [], cost: { dispatches: 0, tokens: 0, usd: 0, unmeasured: 0, by_model: {}, per_leaf: {}, per_folder: {} } },
  payload_digest: '00000000',
}))
`
}

const brokenBody = `console.log('not json')`

const errorBody = `
console.log(JSON.stringify({ error: 'boom' }))
process.exit(1)
`

const slowBody = `setTimeout(() => {}, 60000)`

const listBody = `
console.log(JSON.stringify({
  payload: { repo: 'r', store: 's', store_present: true, efforts: [], notes: '' },
  payload_digest: '00000000',
}))
`

describe('locateAgentics', () => {
  test('the override wins', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentics-viewer-'))
    fakeAgentics(dir, okBody, '1.2.3')
    const decoy = mkdtempSync(join(tmpdir(), 'agentics-viewer-'))
    const installedPlugins = installedPluginsFile(decoy, decoy)
    const result = locateAgentics({ override: dir, installedPlugins })
    expect(result).toEqual({ path: dir, version: '1.2.3' })
  })

  test('installed_plugins.json resolves agentics@vanillafairy', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentics-viewer-'))
    fakeAgentics(dir, okBody, '2.0.0')
    const installedPlugins = installedPluginsFile(dir, dir)
    const result = locateAgentics({ override: null, installedPlugins })
    expect(result).toEqual({ path: dir, version: '2.0.0' })
  })

  test('a missing install is agentics_missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentics-viewer-'))
    const missingPath = join(dir, 'nowhere')
    const result = locateAgentics({ override: missingPath, installedPlugins: join(dir, 'installed_plugins.json') })
    expect(result).toEqual({ code: 'agentics_missing', path: missingPath })
  })

  test('version is read from plugin.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentics-viewer-'))
    fakeAgentics(dir, okBody, '9.9.9')
    const withVersion = locateAgentics({ override: dir, installedPlugins: '' })
    expect((withVersion as AgenticsLocation).version).toBe('9.9.9')

    const noPlugin = mkdtempSync(join(tmpdir(), 'agentics-viewer-'))
    mkdirSync(join(noPlugin, 'lib'), { recursive: true })
    writeFileSync(join(noPlugin, 'lib', 'status.mjs'), okBody)
    const withoutVersion = locateAgentics({ override: noPlugin, installedPlugins: '' })
    expect((withoutVersion as AgenticsLocation).version).toBe('')
  })
})

describe('runSnapshot', () => {
  test('a snapshot in the viewer format is ok', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentics-viewer-'))
    fakeAgentics(dir, okBody)
    const loc: AgenticsLocation = { path: dir, version: '4.0.0' }
    const result = await runSnapshot(loc, 'proj', 'my-effort')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payload.format).toBe(FORMAT)
      expect(result.digest).toBe('00000000')
    }
  })

  test('a design the planner writes is queued; one you write, or of unknown author, still needs design', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentics-viewer-'))
    const nodes = [
      { id: 'p', kind: 'design', author: 'planner', status: 'open' },
      { id: 'y', kind: 'design', author: 'you', status: 'open' },
      { id: 'old', kind: 'design', status: 'open' },
    ]
    fakeAgentics(dir, okBody.replace('nodes: []', `nodes: ${JSON.stringify(nodes)}`))
    const result = await runSnapshot({ path: dir, version: '4.16.0' }, 'proj', 'e')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(Object.fromEntries(result.payload.nodes.map((n) => [n.id, n.status]))).toEqual({ p: 'planned', y: 'open', old: 'open' })
    }
  })

  test('an old agentics is agentics_too_old', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentics-viewer-'))
    fakeAgentics(dir, tooOldBody, '1.0.0')
    const loc: AgenticsLocation = { path: dir, version: '1.0.0' }
    const result = await runSnapshot(loc, 'proj', 'e')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.problem).toEqual({ code: 'agentics_too_old', path: dir, version: '1.0.0' })
    }
  })

  test('another format is format_mismatch', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentics-viewer-'))
    fakeAgentics(dir, formatBody(FORMAT + 1))
    const loc: AgenticsLocation = { path: dir, version: '4.0.0' }
    const result = await runSnapshot(loc, 'proj', 'e')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.problem.code).toBe('format_mismatch')
      expect(result.problem.format).toBe(FORMAT + 1)
    }
  })

  test('a format mismatch names the install', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentics-viewer-'))
    fakeAgentics(dir, formatBody(FORMAT + 1))
    const loc: AgenticsLocation = { path: dir, version: '4.0.0' }
    const result = await runSnapshot(loc, 'proj', 'e')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.problem.path).toBe(dir)
      expect(result.problem.version).toBe('4.0.0')
    }
  })

  test('a failed snapshot names the install', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentics-viewer-'))
    fakeAgentics(dir, brokenBody)
    const loc: AgenticsLocation = { path: dir, version: '4.0.0' }
    const result = await runSnapshot(loc, 'proj', 'e')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.problem.path).toBe(dir)
      expect(result.problem.version).toBe('4.0.0')
    }
  })

  test('garbage output is snapshot_failed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentics-viewer-'))
    fakeAgentics(dir, brokenBody)
    const loc: AgenticsLocation = { path: dir, version: '4.0.0' }
    const result = await runSnapshot(loc, 'proj', 'e')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.problem.code).toBe('snapshot_failed')
      expect(result.problem.detail).toBe('not json\n')
    }
  })

  test('an agentics error is snapshot_failed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentics-viewer-'))
    fakeAgentics(dir, errorBody)
    const loc: AgenticsLocation = { path: dir, version: '4.0.0' }
    const result = await runSnapshot(loc, 'proj', 'e')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.problem.code).toBe('snapshot_failed')
      expect(result.problem.detail).toBe('boom')
    }
  })

  test('a slow agentics times out as snapshot_failed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentics-viewer-'))
    fakeAgentics(dir, slowBody)
    const loc: AgenticsLocation = { path: dir, version: '4.0.0' }
    const result = await runSnapshot(loc, 'proj', 'e', { timeoutMs: 300 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.problem.code).toBe('snapshot_failed')
      expect(result.problem.detail).toBe('timed out')
    }
  }, 10000)

  test('paths with spaces pass through', async () => {
    const base = mkdtempSync(join(tmpdir(), 'agentics-viewer-'))
    const agenticsDir = join(base, 'has space')
    fakeAgentics(agenticsDir, okBody)
    const projectDir = join(base, 'my project')
    mkdirSync(projectDir, { recursive: true })
    const loc: AgenticsLocation = { path: agenticsDir, version: '4.0.0' }
    const result = await runSnapshot(loc, projectDir, 'my effort')
    expect(result.ok).toBe(true)
    if (result.ok) {
      const argv = (result.payload as unknown as { argv: string[] }).argv
      expect(argv).toEqual(['snapshot', '--repo', projectDir, '--effort', 'my effort', '--json'])
    }
  })
})

describe('runList', () => {
  test('runList returns the efforts list with no format check', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentics-viewer-'))
    fakeAgentics(dir, listBody)
    const loc: AgenticsLocation = { path: dir, version: '4.0.0' }
    const result = await runList(loc, 'proj')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payload.repo).toBe('r')
      expect(result.payload.store_present).toBe(true)
    }
  })
})
