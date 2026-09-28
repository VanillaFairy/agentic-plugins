import { describe, expect, test } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fakeClock } from './fake-clock.ts'
import { discoverProjects, createDiscovery, recentProjects, latestEffort } from '../server/projects.ts'

function makeTree(): string {
  const root = mkdtempSync(join(tmpdir(), 'agentics-viewer-'))
  mkdirSync(join(root, 'a', '.agentics'), { recursive: true })
  mkdirSync(join(root, 'b', 'c', '.agentics'), { recursive: true })
  mkdirSync(join(root, 'd', 'e', 'f', 'g', 'h', '.agentics'), { recursive: true })
  mkdirSync(join(root, 'node_modules', 'x', '.agentics'), { recursive: true })
  mkdirSync(join(root, '.claude', 'worktrees', 'w', '.agentics'), { recursive: true })
  mkdirSync(join(root, '.git', 'y', '.agentics'), { recursive: true })
  mkdirSync(join(root, 'a', '.agentics', 'z', '.agentics'), { recursive: true })
  mkdirSync(join(root, 'plain'), { recursive: true })
  return root
}

describe('discoverProjects', () => {
  test('finds projects holding .agentics', () => {
    const root = makeTree()
    const found = discoverProjects([root], 4).map((p) => p.path)
    expect(found).toContain(join(root, 'a'))
    expect(found).toContain(join(root, 'b', 'c'))
  })

  test('stops at the depth limit', () => {
    const root = makeTree()
    const found = discoverProjects([root], 4).map((p) => p.path)
    expect(found).not.toContain(join(root, 'd', 'e', 'f', 'g', 'h'))
  })

  test('skips node_modules', () => {
    const root = makeTree()
    const found = discoverProjects([root], 4).map((p) => p.path)
    expect(found.some((p) => p.includes('node_modules'))).toBe(false)
  })

  test('skips .claude', () => {
    const root = makeTree()
    const found = discoverProjects([root], 4).map((p) => p.path)
    expect(found.some((p) => p.includes('.claude'))).toBe(false)
  })

  test('skips .git', () => {
    const root = makeTree()
    const found = discoverProjects([root], 4).map((p) => p.path)
    expect(found.some((p) => p.includes('.git'))).toBe(false)
  })

  test('does not descend into .agentics', () => {
    const root = makeTree()
    const found = discoverProjects([root], 4).map((p) => p.path)
    expect(found).not.toContain(join(root, 'a', '.agentics', 'z'))
  })

  test('a root can be a project', () => {
    const root = mkdtempSync(join(tmpdir(), 'agentics-viewer-'))
    mkdirSync(join(root, '.agentics'), { recursive: true })
    const found = discoverProjects([root], 4).map((p) => p.path)
    expect(found).toContain(root)
  })

  test('unreadable directories are skipped', () => {
    const root = mkdtempSync(join(tmpdir(), 'agentics-viewer-'))
    const missing = join(root, 'does-not-exist')
    expect(() => discoverProjects([missing], 4)).not.toThrow()
    expect(discoverProjects([missing], 4)).toEqual([])
  })

  test('results are sorted with base names', () => {
    const root = makeTree()
    const found = discoverProjects([root], 4)
    const paths = found.map((p) => p.path)
    const sorted = [...paths].sort()
    expect(paths).toEqual(sorted)
    for (const ref of found) {
      expect(ref.name).toBe(ref.path.split(/[\\/]/).pop())
    }

    // Passing roots out of sorted order must still come back sorted.
    const base = mkdtempSync(join(tmpdir(), 'agentics-viewer-'))
    const rootB = join(base, 'b-root')
    const rootA = join(base, 'a-root')
    mkdirSync(join(rootB, '.agentics'), { recursive: true })
    mkdirSync(join(rootA, '.agentics'), { recursive: true })
    const outOfOrder = discoverProjects([rootB, rootA], 0).map((p) => p.path)
    expect(outOfOrder).toEqual([rootA, rootB])
  })

  test('discovery is cached for its ttl', () => {
    const root = mkdtempSync(join(tmpdir(), 'agentics-viewer-'))
    mkdirSync(join(root, '.agentics'), { recursive: true })
    const clock = fakeClock()
    const discovery = createDiscovery(clock, 1000)
    const first = discovery.list([root], 4)
    mkdirSync(join(root, 'later', '.agentics'), { recursive: true })
    const stillCached = discovery.list([root], 4)
    expect(stillCached).toEqual(first)
    clock.advance(1001)
    const rescanned = discovery.list([root], 4)
    expect(rescanned.length).toBe(2)
  })
})

describe('recentProjects', () => {
  test('recent drops missing folders', () => {
    const root = mkdtempSync(join(tmpdir(), 'agentics-viewer-'))
    const kept = join(root, 'kept')
    mkdirSync(kept, { recursive: true })
    const missing = join(root, 'missing')
    const result = recentProjects([kept, missing])
    expect(result.map((p) => p.path)).toEqual([kept])
  })
})

describe('latestEffort', () => {
  function makeStore(): string {
    const store = mkdtempSync(join(tmpdir(), 'agentics-viewer-'))
    mkdirSync(join(store, 'one', '.state'), { recursive: true })
    writeFileSync(join(store, 'one', '.state', 'nodes.jsonl'), '')
    mkdirSync(join(store, 'two'), { recursive: true })
    writeFileSync(join(store, 'two', 'DESIGN.md'), '')
    return store
  }

  test('latest effort is the most recently written', () => {
    const store = makeStore()
    const older = new Date(Date.now() - 10000)
    const newer = new Date(Date.now())
    utimesSync(join(store, 'one', '.state', 'nodes.jsonl'), older, older)
    utimesSync(join(store, 'two', 'DESIGN.md'), newer, newer)
    expect(latestEffort(store, ['one', 'two'])).toBe('two')

    utimesSync(join(store, 'one', '.state', 'nodes.jsonl'), newer, newer)
    utimesSync(join(store, 'two', 'DESIGN.md'), older, older)
    expect(latestEffort(store, ['one', 'two'])).toBe('one')
  })

  test('a tie goes to the larger name', () => {
    const store = makeStore()
    const same = new Date(Date.now())
    utimesSync(join(store, 'one', '.state', 'nodes.jsonl'), same, same)
    utimesSync(join(store, 'two', 'DESIGN.md'), same, same)
    expect(latestEffort(store, ['one', 'two'])).toBe('two')
  })

  test('no efforts gives null', () => {
    const store = mkdtempSync(join(tmpdir(), 'agentics-viewer-'))
    expect(latestEffort(store, [])).toBeNull()
  })
})
