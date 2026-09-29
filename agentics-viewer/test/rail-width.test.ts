import { afterEach, expect, test, vi } from 'vitest'
import { RAIL_WIDTH, loadRailWidth, saveRailWidth } from '../web/rail-width.ts'

function fakeStorage(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size
    },
  }
}

afterEach(() => vi.unstubAllGlobals())

test('a saved width comes back', () => {
  vi.stubGlobal('localStorage', fakeStorage())
  saveRailWidth(RAIL_WIDTH.initial + 40)
  expect(loadRailWidth()).toBe(RAIL_WIDTH.initial + 40)
})

test('a stored width outside the bounds, or not a number, never reaches the layout', () => {
  const storage = fakeStorage()
  vi.stubGlobal('localStorage', storage)
  const cases: Array<[string, number]> = [
    [String(RAIL_WIDTH.max * 10), RAIL_WIDTH.max],
    ['1', RAIL_WIDTH.min],
    ['wide', RAIL_WIDTH.initial],
  ]
  for (const [stored, expected] of cases) {
    storage.setItem('agentics-viewer:rail-width', stored)
    expect(loadRailWidth()).toBe(expected)
  }
})

test('blocked storage falls back to the initial width', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw new Error('blocked')
    },
  })
  expect(loadRailWidth()).toBe(RAIL_WIDTH.initial)
})
