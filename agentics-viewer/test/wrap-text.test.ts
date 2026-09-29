import { describe, expect, test } from 'vitest'
import { wrapMeasured } from '../web/wrap-text.ts'

const width = (s: string): number => s.length

describe('wrapMeasured', () => {
  test('no line is wider than the limit when a name breaks only at slashes', () => {
    const lines = wrapMeasured('foundations/utils/unreadable-save', 20, width, 3)
    for (const line of lines) expect(width(line)).toBeLessThanOrEqual(20)
    expect(lines.join('')).toBe('foundations/utils/unreadable-save')
  })
  test('a slug with no break at all is cut to the limit', () => {
    const text = 'x'.repeat(30)
    const lines = wrapMeasured(text, 12, width, 3)
    for (const line of lines) expect(width(line)).toBeLessThanOrEqual(12)
    expect(lines.join('')).toBe(text)
  })
  test('text past the last line ends in an ellipsis within the limit', () => {
    const lines = wrapMeasured('foundations/utils/unreadable-save', 12, width, 2)
    expect(lines).toHaveLength(2)
    expect(lines[1]!.endsWith('…')).toBe(true)
    for (const line of lines) expect(width(line)).toBeLessThanOrEqual(12)
  })
})
