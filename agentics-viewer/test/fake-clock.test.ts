import { describe, expect, test } from 'vitest'
import { fakeClock } from './fake-clock.ts'

describe('fakeClock', () => {
  test('timers run in due order', () => {
    const clock = fakeClock()
    const order: string[] = []
    clock.setTimeout(() => order.push('b'), 20)
    clock.setTimeout(() => order.push('a'), 10)
    clock.advance(20)
    expect(order).toEqual(['a', 'b'])
  })

  test('timers set by timers run in the same advance', () => {
    const clock = fakeClock()
    const order: string[] = []
    clock.setTimeout(() => {
      order.push('first')
      clock.setTimeout(() => order.push('second'), 5)
    }, 10)
    clock.advance(20)
    expect(order).toEqual(['first', 'second'])
  })

  test('now lands at the end of the advance', () => {
    const clock = fakeClock(100)
    clock.setTimeout(() => {}, 5)
    clock.advance(20)
    expect(clock.now()).toBe(120)
  })

  test('clearTimeout cancels', () => {
    const clock = fakeClock()
    let ran = false
    const handle = clock.setTimeout(() => {
      ran = true
    }, 10)
    clock.clearTimeout(handle)
    clock.advance(20)
    expect(ran).toBe(false)
  })

  test('pending counts waiting timers', () => {
    const clock = fakeClock()
    clock.setTimeout(() => {}, 10)
    const handle = clock.setTimeout(() => {}, 20)
    expect(clock.pending()).toBe(2)
    clock.clearTimeout(handle)
    expect(clock.pending()).toBe(1)
    clock.advance(10)
    expect(clock.pending()).toBe(0)
  })
})
