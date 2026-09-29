import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { addRecent, DEFAULT_STATE, projectKey, readState, statePath, writeState } from '../server/state.ts'
import type { ViewerState } from '../server/state.ts'

function tempHome(): string {
  return mkdtempSync(join(tmpdir(), 'agentics-viewer-'))
}

describe('statePath', () => {
  test('statePath is under .agentics-viewer', () => {
    const home = tempHome()
    expect(statePath(home)).toBe(join(home, '.agentics-viewer', 'state.json'))
  })
})

describe('readState', () => {
  test('a missing file reads as defaults', () => {
    const home = tempHome()
    const file = statePath(home)
    const { state, problem } = readState(file)
    expect(state).toEqual(DEFAULT_STATE)
    expect(problem).toBeNull()
  })

  test('malformed JSON reads as defaults with a problem', () => {
    const home = tempHome()
    const file = statePath(home)
    mkdirSync(join(home, '.agentics-viewer'), { recursive: true })
    writeFileSync(file, '{ not json', 'utf8')
    const { state, problem } = readState(file)
    expect(state).toEqual(DEFAULT_STATE)
    expect(problem).not.toBeNull()
    expect(problem).toContain(file)
  })

  test('a partial file keeps its values and fills the rest from defaults', () => {
    const home = tempHome()
    const file = statePath(home)
    writeState(file, { ...DEFAULT_STATE, port: 5000, roots: ['C:\\other'] })
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    delete raw.depth
    delete raw.recent
    writeFileSync(file, JSON.stringify(raw), 'utf8')
    const { state, problem } = readState(file)
    expect(problem).toBeNull()
    expect(state.port).toBe(5000)
    expect(state.roots).toEqual(['C:\\other'])
    expect(state.depth).toBe(DEFAULT_STATE.depth)
    expect(state.recent).toEqual(DEFAULT_STATE.recent)
  })

  test('a wrong-typed key takes its default', () => {
    const home = tempHome()
    const file = statePath(home)
    writeState(file, DEFAULT_STATE)
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    raw.port = 'not-a-number'
    raw.roots = 'not-an-array'
    writeFileSync(file, JSON.stringify(raw), 'utf8')
    const { state, problem } = readState(file)
    expect(problem).toBeNull()
    expect(state.port).toBe(DEFAULT_STATE.port)
    expect(state.roots).toEqual(DEFAULT_STATE.roots)
  })

  test('unknown keys are dropped', () => {
    const home = tempHome()
    const file = statePath(home)
    writeState(file, DEFAULT_STATE)
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    raw.mystery = 'should not survive'
    writeFileSync(file, JSON.stringify(raw), 'utf8')
    const { state } = readState(file)
    expect((state as unknown as Record<string, unknown>).mystery).toBeUndefined()
  })
})

describe('writeState', () => {
  test('writeState creates the directory', () => {
    const home = tempHome()
    const file = statePath(home)
    expect(existsSync(join(home, '.agentics-viewer'))).toBe(false)
    writeState(file, DEFAULT_STATE)
    expect(existsSync(join(home, '.agentics-viewer'))).toBe(true)
    expect(existsSync(file)).toBe(true)
  })

  test('writeState replaces an older file', () => {
    const home = tempHome()
    const file = statePath(home)
    writeState(file, { ...DEFAULT_STATE, port: 1111 })
    writeState(file, { ...DEFAULT_STATE, port: 2222 })
    const { state } = readState(file)
    expect(state.port).toBe(2222)
  })

  test('writing what was read round-trips', () => {
    const home = tempHome()
    const file = statePath(home)
    writeState(file, { ...DEFAULT_STATE, port: 9999, roots: ['C:\\a', 'C:\\b'] })
    const { state: first } = readState(file)
    writeState(file, first)
    const { state: second } = readState(file)
    expect(second).toEqual(first)
  })

  test('a leftover temp file is ignored and replaced', () => {
    const home = tempHome()
    const file = statePath(home)
    writeState(file, { ...DEFAULT_STATE, port: 3333 })
    writeFileSync(`${file}.tmp`, 'garbage leftover', 'utf8')
    const { state: before } = readState(file)
    expect(before.port).toBe(3333)
    writeState(file, { ...DEFAULT_STATE, port: 4444 })
    const { state: after } = readState(file)
    expect(after.port).toBe(4444)
  })
})

describe('addRecent', () => {
  test('addRecent puts the newest first', () => {
    const state: ViewerState = { ...DEFAULT_STATE, recent: ['C:\\work\\a', 'C:\\work\\b'] }
    const next = addRecent(state, 'C:\\work\\c')
    expect(next.recent[0]).toBe('C:\\work\\c')
  })

  test('addRecent drops an earlier entry with the same key', () => {
    const state: ViewerState = { ...DEFAULT_STATE, recent: ['C:\\work\\x', 'C:\\work\\y'] }
    const next = addRecent(state, 'c:/work/x/')
    expect(next.recent).toEqual(['c:/work/x/', 'C:\\work\\y'])
  })

  test('addRecent keeps eight', () => {
    const recent = Array.from({ length: 8 }, (_, i) => `C:\\work\\p${i}`)
    const state: ViewerState = { ...DEFAULT_STATE, recent }
    const next = addRecent(state, 'C:\\work\\new')
    expect(next.recent).toHaveLength(8)
    expect(next.recent[0]).toBe('C:\\work\\new')
    expect(next.recent).not.toContain('C:\\work\\p7')
  })
})

describe('projectKey', () => {
  test('projectKey normalises separators, trailing slash and drive case', () => {
    expect(projectKey('C:\\work\\x')).toBe(projectKey('c:/work/x/'))
    expect(projectKey('C:\\work\\x')).toBe('c:/work/x')
  })
})
