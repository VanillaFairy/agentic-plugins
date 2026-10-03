import type { BoardModel } from './model.ts'

export interface Placed {
  id: string
  x: number
  y: number
}

/** A parent-to-child track as a polyline of orthogonal legs, parent end first. */
export interface Link {
  parent: string
  child: string
  points: [number, number][]
}

export interface Layout {
  placed: Map<string, Placed>
  links: Link[]
  width: number
  height: number
}

// h is the default block height: up to two wrapped title lines plus one subtitle line, with
// comfortable padding. A subtitle that genuinely needs more room (status text is never
// trimmed) grows every block in that render uniformly — see Board.tsx's blockHeightFor — so
// blocks stay the same size as each other, just not always this exact one.
// indent: how far a parent's children sit right of it; its track runs down the middle of that.
// levelGap: from a parent's bottom to its row of children.
export const BLOCK = { w: 170, h: 72, rowGap: 26, colGap: 48, indent: 28, levelGap: 36 }

// Leaves under one parent stack in a column this tall at most, then start another beside it.
export const STACK_MAX = 6

// A child's place relative to its parent. Its track leaves the parent's spine, crosses to the
// child's lane (a vertical in the gap left of the child's column) and enters the child from the
// side, or from a bus over the child's row and in at the top.
interface Kid {
  sub: Sub
  dx: number
  dy: number
  laneDx: number
  entry: 'side' | 'top'
}

interface Sub {
  id: string
  w: number
  h: number
  kids: Kid[]
}

/**
 * Children sit below their parent, indented. Leaf children stack in a band of columns of up to
 * STACK_MAX, entered from the side. Children with subtrees of their own follow that band in one
 * row, left to right in sibling order, entered from the top.
 */
function measure(model: BoardModel, id: string, blockH: number): Sub {
  const ids = model.nodes.get(id)?.children ?? []
  if (ids.length === 0) return { id, w: BLOCK.w, h: blockH, kids: [] }
  const subs = ids.map((k) => measure(model, k, blockH))
  const top = blockH + BLOCK.levelGap
  const kids: Kid[] = []
  let w = 0
  let h = 0

  const leaves = subs.filter((s) => s.kids.length === 0)
  if (leaves.length > 0) {
    const cols = Math.ceil(leaves.length / STACK_MAX)
    const rows = Math.ceil(leaves.length / cols)
    leaves.forEach((sub, i) => {
      const dx = BLOCK.indent + Math.floor(i / rows) * (BLOCK.w + BLOCK.colGap)
      kids.push({ sub, dx, dy: top + (i % rows) * (blockH + BLOCK.rowGap), laneDx: dx - BLOCK.indent / 2, entry: 'side' })
    })
    w = BLOCK.indent + cols * BLOCK.w + (cols - 1) * BLOCK.colGap
    h = top + rows * blockH + (rows - 1) * BLOCK.rowGap
  }

  const x0 = leaves.length > 0 ? w + BLOCK.colGap : BLOCK.indent
  let x = x0
  for (const sub of subs.filter((s) => s.kids.length > 0)) {
    kids.push({ sub, dx: x, dy: top, laneDx: x0 - BLOCK.indent / 2, entry: 'top' })
    w = x + sub.w
    h = Math.max(h, top + sub.h)
    x += sub.w + BLOCK.colGap
  }
  return { id, w, h, kids }
}

function place(sub: Sub, x: number, y: number, blockH: number, out: Layout): void {
  out.placed.set(sub.id, { id: sub.id, x, y })
  const spineX = x + BLOCK.indent / 2
  const bottom = y + blockH
  const busY = bottom + BLOCK.levelGap / 2
  for (const { sub: kid, dx, dy, laneDx, entry } of sub.kids) {
    const cx = x + dx
    const cy = y + dy
    const laneX = x + laneDx
    const toLane: [number, number][] = [[spineX, bottom], [spineX, busY], [laneX, busY]]
    const rowBusY = cy - BLOCK.levelGap / 2
    const midX = cx + BLOCK.w / 2
    const midY = cy + blockH / 2
    const points: [number, number][] =
      entry === 'side'
        ? [...toLane, [laneX, midY], [cx, midY]]
        : [...toLane, [laneX, rowBusY], [midX, rowBusY], [midX, cy]]
    out.links.push({ parent: sub.id, child: kid.id, points })
    place(kid, cx, cy, blockH, out)
  }
}

export function layoutTree(model: BoardModel, blockH: number = BLOCK.h): Layout {
  const root = measure(model, model.root, blockH)
  const out: Layout = { placed: new Map(), links: [], width: root.w, height: root.h }
  place(root, 0, 0, blockH, out)
  return out
}

// Rails run in the gap right of a column: the first this far from the blocks, then every `step`
// further out, squeezed when a gap holds more rails than fit.
export const DEP_RAIL = { margin: 14, step: 8 }
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
 * rail in the first gap, right of the rightmost column it touches, that no block reaches into
 * along the rail's length. In one gap, edges that overlap
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

  const range = (e: DepEdge): [number, number] => {
    const { fromY, toY } = portY.get(e)!
    return [Math.min(fromY, toY), Math.max(fromY, toY)]
  }
  // A gap is keyed by the x of the column on its left. A block that reaches into the gap within
  // the edge's vertical span pushes the edge out to the gap right of that block.
  const blocks = [...placed.values()]
  const gaps = new Map<number, DepEdge[]>()
  for (const e of live) {
    const [lo, hi] = range(e)
    let gap = Math.max(at(e.from).x, at(e.to).x)
    for (;;) {
      const inGap = blocks.filter((b) =>
        b.y < hi && b.y + blockH > lo && b.x < gap + BLOCK.w + BLOCK.colGap && b.x + BLOCK.w > gap + BLOCK.w)
      if (inGap.length === 0) break
      gap = Math.max(...inGap.map((b) => b.x))
    }
    gaps.set(gap, [...(gaps.get(gap) ?? []), e])
  }
  const railX = new Map<DepEdge, number>()
  for (const [gap, list] of gaps) {
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
    const step = Math.min(DEP_RAIL.step, (BLOCK.colGap - 2 * DEP_RAIL.margin) / Math.max(1, rails.length - 1))
    for (const e of list) railX.set(e, gap + BLOCK.w + DEP_RAIL.margin + railOf.get(e)! * step)
  }

  return live.map((e) => ({ from: e.from, to: e.to, ...portY.get(e)!, railX: railX.get(e)! }))
}
