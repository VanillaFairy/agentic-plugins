// The widths of the wide-mode side panes, set by dragging their edges and remembered per browser
// like the theme. Wrapped in try/catch: storage the browser has blocked just forgets the width.

export type PaneWidth = { initial: number; min: number; max: number; step: number; key: string }

export const RAIL_WIDTH: PaneWidth = { initial: 250, min: 160, max: 560, step: 16, key: 'agentics-viewer:rail-width' }
export const DETAIL_WIDTH: PaneWidth = { initial: 360, min: 280, max: 800, step: 16, key: 'agentics-viewer:detail-width' }

export function clampWidth(pane: PaneWidth, px: number): number {
  return Math.round(Math.min(pane.max, Math.max(pane.min, px)))
}

export function loadWidth(pane: PaneWidth): number {
  try {
    const v = Number(localStorage.getItem(pane.key))
    return v > 0 ? clampWidth(pane, v) : pane.initial
  } catch {
    return pane.initial
  }
}

export function saveWidth(pane: PaneWidth, px: number): void {
  try {
    localStorage.setItem(pane.key, String(px))
  } catch {
    // no storage — the width just doesn't survive a reload
  }
}
