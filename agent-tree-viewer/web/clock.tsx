// Clocks that tick on their own, so a ticking second redraws one line and not the page around it.

import { useEffect, useState } from 'preact/hooks'
import { elapsed } from './layout.ts'

// The page's clock, read again every `everyMs`; it stands still when `everyMs` is undefined.
export function useNow(everyMs: number | undefined): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (everyMs === undefined) return
    const timer = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(timer)
  }, [everyMs])
  return now
}

// The stopwatch reading from `from` to `to`, or to this second while `to` is undefined. `skew` is
// the server's clock minus the page's.
export function Elapsed({ from, to, skew }: { from: number; to?: number | undefined; skew: number }) {
  const now = useNow(to === undefined ? 1000 : undefined)
  return <>{elapsed((to ?? now + skew) - from)}</>
}
