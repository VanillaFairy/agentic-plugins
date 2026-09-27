export type TimerHandle = { readonly id: number }

export interface Clock {
  now(): number
  setTimeout(fn: () => void, ms: number): TimerHandle
  clearTimeout(h: TimerHandle): void
}

let nextId = 1
const handles = new Map<number, NodeJS.Timeout>()

export const realClock: Clock = {
  now(): number {
    return Date.now()
  },
  setTimeout(fn: () => void, ms: number): TimerHandle {
    const id = nextId++
    const timeout = setTimeout(() => {
      handles.delete(id)
      fn()
    }, ms)
    handles.set(id, timeout)
    return { id }
  },
  clearTimeout(h: TimerHandle): void {
    const timeout = handles.get(h.id)
    if (timeout !== undefined) {
      clearTimeout(timeout)
      handles.delete(h.id)
    }
  },
}
