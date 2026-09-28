import { watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import type { Clock, TimerHandle } from './clock.ts'

export interface SchedulerOptions { quietMs?: number; capMs?: number; pollMs?: number }
export interface Scheduler {
  notify(): void
  setActive(active: boolean): void
  dispose(): void
}

type Phase = 'idle' | 'waiting' | 'running'

export function createScheduler(run: () => Promise<void>, clock: Clock, opts: SchedulerOptions = {}): Scheduler {
  const quietMs = opts.quietMs ?? 300
  const capMs = opts.capMs ?? 1000
  const pollMs = opts.pollMs ?? 5000

  let phase: Phase = 'idle'
  let followUp = false
  let quietTimer: TimerHandle | null = null
  let capTimer: TimerHandle | null = null
  let pollTimer: TimerHandle | null = null
  let active = false
  let disposed = false

  function clearWaitTimers(): void {
    if (quietTimer !== null) {
      clock.clearTimeout(quietTimer)
      quietTimer = null
    }
    if (capTimer !== null) {
      clock.clearTimeout(capTimer)
      capTimer = null
    }
  }

  // Starts a run right now. Clears any pending quiet/cap timers (rule 2):
  // once a run starts, the wait that led to it is over either way.
  function start(): void {
    clearWaitTimers()
    phase = 'running'
    const settle = (): void => {
      phase = 'idle'
      if (disposed) return
      if (followUp) {
        followUp = false
        schedule()
      }
    }
    // A rejected run still settles (rule 6). Attach both branches directly,
    // rather than .finally(), so the rejection is handled here and never
    // surfaces as an unhandled rejection.
    run().then(settle, settle)
  }

  // Tries to run right now (used by the cap timer, the poll timer, and the
  // quiet timer). If a run is already in flight, marks the one allowed
  // follow-up instead (rule 3).
  function attempt(): void {
    if (disposed) return
    if (phase === 'running') {
      followUp = true
      return
    }
    start()
  }

  // Arms/restarts the quiet timer, and arms the cap timer the first time
  // since the last run started (rules 1 and 2). While a run is in flight,
  // this only marks the follow-up (rule 3) — timers start once it settles.
  function schedule(): void {
    if (disposed) return
    if (phase === 'running') {
      followUp = true
      return
    }
    if (phase === 'idle') {
      phase = 'waiting'
      capTimer = clock.setTimeout(attempt, capMs)
    }
    if (quietTimer !== null) clock.clearTimeout(quietTimer)
    quietTimer = clock.setTimeout(attempt, quietMs)
  }

  function schedulePoll(): void {
    pollTimer = clock.setTimeout(() => {
      schedulePoll()
      attempt()
    }, pollMs)
  }

  return {
    notify(): void {
      schedule()
    },
    setActive(nextActive: boolean): void {
      if (disposed || nextActive === active) return
      active = nextActive
      if (active) {
        schedulePoll()
      } else if (pollTimer !== null) {
        clock.clearTimeout(pollTimer)
        pollTimer = null
      }
    },
    dispose(): void {
      disposed = true
      clearWaitTimers()
      if (pollTimer !== null) {
        clock.clearTimeout(pollTimer)
        pollTimer = null
      }
    },
  }
}

// True for a path with a segment sequence '.state/context/<something>', and for
// any path whose base name is '.lock'. Separators may be '\' or '/'. Never widened
// to match a bare ancestor directory on its own — see interfaces.md's Decided
// paragraph on the Windows bare-ancestor-event contract.
export function isIgnored(relativePath: string): boolean {
  const segments = relativePath.split(/[\\/]+/).filter((s) => s.length > 0)
  const basename = segments[segments.length - 1]
  if (basename === '.lock') return true
  for (let i = 0; i < segments.length - 2; i++) {
    if (segments[i] === '.state' && segments[i + 1] === 'context') return true
  }
  return false
}

export function watchStore(store: string, onChange: () => void, opts: { clock: Clock; log: (m: string) => void; fallbackPollMs?: number }): { close(): void } {
  const { clock, log } = opts
  const fallbackPollMs = opts.fallbackPollMs ?? 2000

  let closed = false
  let watcher: FSWatcher | null = null
  let pollTimer: TimerHandle | null = null
  let failures = 0

  function startPolling(): void {
    log(`watching ${store} by polling every 2 s`)
    const tick = (): void => {
      if (closed) return
      onChange()
      pollTimer = clock.setTimeout(tick, fallbackPollMs)
    }
    pollTimer = clock.setTimeout(tick, fallbackPollMs)
  }

  function onError(): void {
    if (closed) return
    if (watcher !== null) {
      watcher.close()
      watcher = null
    }
    failures++
    if (failures === 1) {
      tryWatch()
    } else {
      startPolling()
    }
  }

  function tryWatch(): void {
    try {
      const w = watch(store, { recursive: true }, (_eventType, filename) => {
        if (closed) return
        const rel = filename === null ? '' : filename.toString()
        if (!isIgnored(rel)) onChange()
      })
      w.on('error', onError)
      watcher = w
    } catch {
      onError()
    }
  }

  tryWatch()

  return {
    close(): void {
      closed = true
      if (watcher !== null) {
        watcher.close()
        watcher = null
      }
      if (pollTimer !== null) {
        clock.clearTimeout(pollTimer)
        pollTimer = null
      }
    },
  }
}
