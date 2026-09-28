import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, mkdirSync, appendFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fakeClock } from './fake-clock.ts'
import { realClock } from '../server/clock.ts'
import { createScheduler, isIgnored, watchStore } from '../server/watch.ts'

// A `run` fake that records when it was called and hands the test a resolve/reject
// pair for each call, so "in flight" is entirely under the test's control.
function makeRun(clock: { now(): number }) {
  const calls: number[] = []
  const pending: Array<{ resolve: () => void; reject: (e: Error) => void }> = []
  const run = (): Promise<void> =>
    new Promise((resolve, reject) => {
      calls.push(clock.now())
      pending.push({ resolve, reject })
    })
  return { run, calls, pending }
}

describe('createScheduler', () => {
  test('a single change runs after the quiet period', () => {
    const clock = fakeClock()
    const { run, calls } = makeRun(clock)
    const scheduler = createScheduler(run, clock)

    scheduler.notify()
    clock.advance(299)
    expect(calls.length).toBe(0)
    clock.advance(1)
    expect(calls.length).toBe(1)
  })

  test('a steady stream still runs every second', async () => {
    const clock = fakeClock()
    const { run, calls, pending } = makeRun(clock)
    const scheduler = createScheduler(run, clock)

    // Notify every 200ms (inside the 300ms quiet period, so the quiet timer
    // never gets to fire) for 3s. Resolve each run as soon as it starts, so
    // only the capMs timer can be forcing runs.
    for (let i = 0; i < 15; i++) {
      scheduler.notify()
      clock.advance(200)
      while (pending.length > 0) {
        pending.shift()!.resolve()
        await Promise.resolve()
        await Promise.resolve()
      }
    }

    expect(calls.length).toBeGreaterThanOrEqual(3)
  })

  test('changes inside the quiet period coalesce', () => {
    const clock = fakeClock()
    const { run, calls } = makeRun(clock)
    const scheduler = createScheduler(run, clock)

    scheduler.notify()
    clock.advance(100)
    scheduler.notify() // restarts the quiet timer, due at t=400
    clock.advance(299)
    expect(calls.length).toBe(0)
    clock.advance(1)
    expect(calls.length).toBe(1)
  })

  test('changes during a run queue exactly one more', async () => {
    const clock = fakeClock()
    const { run, calls, pending } = makeRun(clock)
    const scheduler = createScheduler(run, clock)

    scheduler.notify()
    clock.advance(300)
    expect(calls.length).toBe(1)

    scheduler.notify()
    scheduler.notify()
    scheduler.notify()
    clock.advance(5000) // well past quiet+cap; the run is still in flight
    expect(calls.length).toBe(1)

    pending.shift()!.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(calls.length).toBe(1) // the follow-up is served from the settle moment, not before

    clock.advance(300)
    expect(calls.length).toBe(2)

    pending.shift()!.resolve()
    await Promise.resolve()
    await Promise.resolve()
    clock.advance(5000)
    expect(calls.length).toBe(2) // exactly one follow-up for three notifies, not three
  })

  test('a failed run still settles', async () => {
    const clock = fakeClock()
    const { run, calls, pending } = makeRun(clock)
    const scheduler = createScheduler(run, clock)

    scheduler.notify()
    clock.advance(300)
    expect(calls.length).toBe(1)

    scheduler.notify()
    pending.shift()!.reject(new Error('boom'))
    await Promise.resolve()
    await Promise.resolve()
    clock.advance(300)
    expect(calls.length).toBe(2)
  })

  test('active polling runs every five seconds', async () => {
    const clock = fakeClock()
    const { run, calls, pending } = makeRun(clock)
    const scheduler = createScheduler(run, clock)

    scheduler.setActive(true)
    for (let i = 1; i <= 3; i++) {
      clock.advance(5000)
      expect(calls.length).toBe(i)
      pending.shift()!.resolve()
      await Promise.resolve()
      await Promise.resolve()
    }
  })

  test('inactive stops polling', async () => {
    const clock = fakeClock()
    const { run, calls, pending } = makeRun(clock)
    const scheduler = createScheduler(run, clock)

    scheduler.setActive(true)
    clock.advance(5000)
    expect(calls.length).toBe(1)
    pending.shift()!.resolve()
    await Promise.resolve()
    await Promise.resolve()

    scheduler.setActive(false)
    clock.advance(20000)
    expect(calls.length).toBe(1)
  })

  test('setActive with the current value changes nothing', async () => {
    const clock = fakeClock()
    const { run, calls, pending } = makeRun(clock)
    const scheduler = createScheduler(run, clock)

    scheduler.setActive(true)
    clock.advance(2000)
    scheduler.setActive(true) // redundant, partway through the interval: must not reset its phase
    clock.advance(3000) // completes the original 5000ms interval, not a new one from t=2000
    expect(calls.length).toBe(1)
    pending.shift()!.resolve()
    await Promise.resolve()
    await Promise.resolve()

    clock.advance(5000)
    expect(calls.length).toBe(2)
    pending.shift()!.resolve()
    await Promise.resolve()
    await Promise.resolve()

    clock.advance(5000)
    expect(calls.length).toBe(3) // exactly three polled runs over the 15s total
  })

  test('polling respects one run at a time', async () => {
    const clock = fakeClock()
    const { run, calls, pending } = makeRun(clock)
    const scheduler = createScheduler(run, clock)

    scheduler.setActive(true)
    clock.advance(5000)
    expect(calls.length).toBe(1)

    clock.advance(5000) // a second poll comes due while the first run is still in flight
    expect(calls.length).toBe(1)

    pending.shift()!.resolve()
    await Promise.resolve()
    await Promise.resolve()
    clock.advance(5000)
    expect(calls.length).toBe(2)
  })

  test('dispose stops everything', () => {
    const clock = fakeClock()
    const { run, calls } = makeRun(clock)
    const scheduler = createScheduler(run, clock)

    scheduler.notify()
    scheduler.setActive(true)
    scheduler.dispose()
    expect(clock.pending()).toBe(0)

    scheduler.notify()
    expect(clock.pending()).toBe(0)
    clock.advance(20000)
    expect(calls.length).toBe(0)
  })
})

describe('isIgnored', () => {
  test('context files are ignored', () => {
    expect(isIgnored('.state/context/x.md')).toBe(true)
    expect(isIgnored('.state\\context\\x.md')).toBe(true)
  })

  test('lock files are ignored', () => {
    expect(isIgnored('.state/.lock')).toBe(true)
    expect(isIgnored('a/.lock')).toBe(true)
  })

  test('logs and specs are not ignored', () => {
    expect(isIgnored('.state/events.jsonl')).toBe(false)
    expect(isIgnored('a/DESIGN.md')).toBe(false)
  })
})

describe('watchStore', () => {
  const dirs: string[] = []

  function tempStore(): string {
    const dir = mkdtempSync(join(tmpdir(), 'agentics-viewer-'))
    dirs.push(dir)
    return join(dir, 'eff', '.state')
  }

  afterEach(() => {
    while (dirs.length > 0) {
      rmSync(dirs.pop()!, { recursive: true, force: true })
    }
  })

  test('watchStore reports a write', async () => {
    const store = tempStore()
    mkdirSync(store, { recursive: true })
    let changed = false
    const handle = watchStore(store, () => { changed = true }, { clock: realClock, log: () => {} })

    appendFileSync(join(store, 'events.jsonl'), 'line\n')
    const deadline = Date.now() + 2000
    while (!changed && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }

    expect(changed).toBe(true)
    handle.close()
  })

  test('watchStore ignores context writes', async () => {
    const store = tempStore()
    mkdirSync(join(store, 'context'), { recursive: true })
    let changed = false
    const handle = watchStore(store, () => { changed = true }, { clock: realClock, log: () => {} })

    appendFileSync(join(store, 'context', 'c.md'), 'line\n')
    await new Promise((resolve) => setTimeout(resolve, 500))

    expect(changed).toBe(false)
    handle.close()
  })

  test('a store that cannot be watched is polled', async () => {
    const clock = fakeClock()
    const store = join(tmpdir(), 'agentics-viewer-missing-does-not-exist')
    const logs: string[] = []
    let changed = 0
    const handle = watchStore(store, () => { changed++ }, { clock, log: (m: string) => logs.push(m) })

    await Promise.resolve()
    await Promise.resolve()
    expect(logs).toContain(`watching ${store} by polling every 2 s`)

    clock.advance(2000)
    expect(changed).toBe(1)
    clock.advance(2000)
    expect(changed).toBe(2)

    handle.close()
    expect(clock.pending()).toBe(0)
    clock.advance(4000)
    expect(changed).toBe(2)
  })
})
