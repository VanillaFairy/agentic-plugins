import type { Clock, TimerHandle } from '../server/clock.ts'

export interface FakeClock extends Clock {
  advance(ms: number): void
  pending(): number
}

interface Timer {
  id: number
  due: number
  fn: () => void
}

export function fakeClock(start = 0): FakeClock {
  let now = start
  let nextId = 1
  const timers: Timer[] = []

  return {
    now(): number {
      return now
    },
    setTimeout(fn: () => void, ms: number): TimerHandle {
      const id = nextId++
      timers.push({ id, due: now + ms, fn })
      return { id }
    },
    clearTimeout(h: TimerHandle): void {
      const index = timers.findIndex((t) => t.id === h.id)
      if (index !== -1) {
        timers.splice(index, 1)
      }
    },
    advance(ms: number): void {
      const target = now + ms
      for (;;) {
        let earliest: Timer | null = null
        for (const t of timers) {
          if (t.due <= target && (earliest === null || t.due < earliest.due || (t.due === earliest.due && t.id < earliest.id))) {
            earliest = t
          }
        }
        if (earliest === null) break
        const index = timers.indexOf(earliest)
        timers.splice(index, 1)
        now = earliest.due
        earliest.fn()
      }
      now = target
    },
    pending(): number {
      return timers.length
    },
  }
}
