import { hierarchy, tree } from 'd3-hierarchy'
import type { BoardModel } from './model.ts'

export interface Placed {
  id: string
  x: number // across depth
  y: number // down
}

export interface Layout {
  placed: Map<string, Placed>
  width: number
  height: number
}

// h is the default block height: up to two wrapped title lines plus one subtitle line, with
// comfortable padding. A subtitle that genuinely needs more room (status text is never
// trimmed) grows every block in that render uniformly — see Board.tsx's blockHeightFor — so
// blocks stay the same size as each other, just not always this exact one.
export const BLOCK = { w: 170, h: 72, rowGap: 26, depthGap: 70 }

export function layoutTree(model: BoardModel, blockH: number = BLOCK.h): Layout {
  const root = hierarchy(model.root, (id) => model.nodes.get(id)?.children ?? [])
  tree<string>().nodeSize([blockH + BLOCK.rowGap, BLOCK.w + BLOCK.depthGap])(root)

  const nodes = root.descendants()
  let minAcross = Infinity
  let minDown = Infinity
  for (const n of nodes) {
    minAcross = Math.min(minAcross, n.y!)
    minDown = Math.min(minDown, n.x!)
  }

  const placed = new Map<string, Placed>()
  let width = 0
  let height = 0
  for (const n of nodes) {
    const x = n.y! - minAcross
    const y = n.x! - minDown
    placed.set(n.data, { id: n.data, x, y })
    width = Math.max(width, x + BLOCK.w)
    height = Math.max(height, y + blockH)
  }

  return { placed, width, height }
}

// Rails run in the gap right of a column: the first this far from the blocks, then every `step`
// further out, squeezed when a gap holds more rails than fit.
export const DEP_RAIL = { margin: 20, step: 8 }
const RAIL_CLEARANCE = 4

export interface DepEdge {
  from: string
  to: string
}

export interface DepRoute {
  from: string
  to: string
  fromY: number
  toY: number
  railX: number
}

/**
 * Geometry for every dependency edge, blocker to blocked. Each edge leaves its blocker's right
 * side from the lower half and enters the blocked node's right side in the upper half, each at
 * its own point, ordered by where the other end sits, so no two edges share an end. It runs down a
 * rail in the gap right of the rightmost column it touches. In one gap, edges that overlap
 * vertically take separate rails, a contained edge inside the one containing it, so edges nest
 * rather than cross; edges that don't overlap share the innermost rail they fit.
 */
export function routeDeps(edges: DepEdge[], placed: Map<string, Placed>, blockH: number): DepRoute[] {
  const live = edges.filter((e) => e.from !== e.to && placed.has(e.from) && placed.has(e.to))
  const at = (id: string): Placed => placed.get(id)!
  const byOtherEnd = (other: (e: DepEdge) => string) => (a: DepEdge, b: DepEdge) =>
    at(other(a)).y - at(other(b)).y || other(a).localeCompare(other(b))

  const portY = new Map<DepEdge, { fromY: number; toY: number }>()
  for (const e of live) portY.set(e, { fromY: 0, toY: 0 })
  const spread = (id: string, list: DepEdge[], lo: number, hi: number, set: (e: DepEdge, y: number) => void): void => {
    list.forEach((e, i) => set(e, at(id).y + blockH * (lo + ((hi - lo) * (i + 1)) / (list.length + 1))))
  }
  for (const id of new Set(live.flatMap((e) => [e.from, e.to]))) {
    const ins = live.filter((e) => e.to === id).sort(byOtherEnd((e) => e.from))
    const outs = live.filter((e) => e.from === id).sort(byOtherEnd((e) => e.to))
    spread(id, ins, 0.1, 0.5, (e, y) => (portY.get(e)!.toY = y))
    spread(id, outs, 0.5, 0.9, (e, y) => (portY.get(e)!.fromY = y))
  }

  const gaps = new Map<number, DepEdge[]>()
  for (const e of live) {
    const gap = Math.max(at(e.from).x, at(e.to).x)
    gaps.set(gap, [...(gaps.get(gap) ?? []), e])
  }
  const railX = new Map<DepEdge, number>()
  for (const [gap, list] of gaps) {
    const range = (e: DepEdge): [number, number] => {
      const { fromY, toY } = portY.get(e)!
      return [Math.min(fromY, toY), Math.max(fromY, toY)]
    }
    const span = (e: DepEdge): number => range(e)[1] - range(e)[0]
    list.sort((a, b) => span(a) - span(b) || a.from.localeCompare(b.from) || a.to.localeCompare(b.to))
    // Shortest first, each onto the innermost rail it overlaps nothing on. An edge that contains
    // another overlaps it and everything that pushed it outward, so it lands further out.
    const rails: [number, number][][] = []
    const railOf = new Map<DepEdge, number>()
    for (const e of list) {
      const [lo, hi] = range(e)
      const clear = (taken: [number, number][]): boolean => taken.every(([a, b]) => hi + RAIL_CLEARANCE < a || lo > b + RAIL_CLEARANCE)
      let rail = rails.findIndex(clear)
      if (rail === -1) rail = rails.push([]) - 1
      rails[rail].push([lo, hi])
      railOf.set(e, rail)
    }
    const step = Math.min(DEP_RAIL.step, (BLOCK.depthGap - 2 * DEP_RAIL.margin) / Math.max(1, rails.length - 1))
    for (const e of list) railX.set(e, gap + BLOCK.w + DEP_RAIL.margin + railOf.get(e)! * step)
  }

  return live.map((e) => ({ from: e.from, to: e.to, ...portY.get(e)!, railX: railX.get(e)! }))
}
