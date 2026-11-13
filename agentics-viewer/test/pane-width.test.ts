import { afterEach, expect, test, vi } from 'vitest'
import { RAIL_WIDTH, DETAIL_WIDTH, loadWidth, saveWidth } from '../web/pane-width.ts'

const PANES = [RAIL_WIDTH, DETAIL_WIDTH]

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

test('each pane gets its own saved width back', () => {
  vi.stubGlobal('localStorage', fakeStorage())
  PANES.forEach((pane, i) => saveWidth(pane, pane.min + 10 * (i + 1)))
  PANES.forEach((pane, i) => expect(loadWidth(pane)).toBe(pane.min + 10 * (i + 1)))
})

test('a stored width outside the bounds, or not a number, never reaches the layout', () => {
  const storage = fakeStorage()
  vi.stubGlobal('localStorage', storage)
  for (const pane of PANES) {
    const cases: Array<[string, number]> = [
      [String(pane.max * 10), pane.max],
      ['1', pane.min],
      ['wide', pane.initial],
    ]
    for (const [stored, expected] of cases) {
      storage.setItem(pane.key, stored)
      expect(loadWidth(pane)).toBe(expected)
    }
  }
})

test('blocked storage falls back to the initial width', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw new Error('blocked')
    },
  })
  for (const pane of PANES) expect(loadWidth(pane)).toBe(pane.initial)
})
