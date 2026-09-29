// The outline's width in wide mode, set by dragging its edge and remembered per browser like the
// theme. Wrapped in try/catch: storage the browser has blocked just forgets the width.

export const RAIL_WIDTH = { initial: 250, min: 160, max: 560, step: 16 }

const KEY = 'agentics-viewer:rail-width'

export function clampRailWidth(px: number): number {
  return Math.round(Math.min(RAIL_WIDTH.max, Math.max(RAIL_WIDTH.min, px)))
}

export function loadRailWidth(): number {
  try {
    const v = Number(localStorage.getItem(KEY))
    return v > 0 ? clampRailWidth(v) : RAIL_WIDTH.initial
  } catch {
    return RAIL_WIDTH.initial
  }
}

export function saveRailWidth(px: number): void {
  try {
    localStorage.setItem(KEY, String(px))
  } catch {
    // no storage — the width just doesn't survive a reload
  }
}
