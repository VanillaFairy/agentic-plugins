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
// levelGap: from a parent's bottom to its first children, and between slots stacked in a column.
export const BLOCK = { w: 170, h: 72, rowGap: 26, colGap: 48, indent: 28, levelGap: 36 }

// Leaves under one parent stack in a column this tall at most, then start another beside it.
export const STACK_MAX = 6

// What a subtree occupies: its blocks, and its tracks as zero-width or zero-height strips.
interface Rect {
  x: number
  y: number
  w: number
  h: number
  block: boolean
}

// A child's place and its track, both relative to its parent. The track runs down the parent's
// spine to the bus in the gap above the child's slot, then either along it to the child's lane
// (a vertical in the gap left of the child's column) and into the child from the side, or along
// it to above the child and in at the top.
interface Kid {
  sub: Sub
  dx: number
  dy: number
  points: [number, number][]
}

interface Sub {
  id: string
  w: number
  h: number
  kids: Kid[]
  rects: Rect[] // relative to the subtree's own block
}

const shift = (r: Rect, dx: number, dy: number): Rect => ({ ...r, x: r.x + dx, y: r.y + dy })

function legs(points: [number, number][]): Rect[] {
  return points.slice(1).map(([x, y], i) => {
    const [px, py] = points[i]
    return { x: Math.min(x, px), y: Math.min(y, py), w: Math.abs(x - px), h: Math.abs(y - py), block: false }
  })
}

// How far apart, along the axis a slot moves on, a thing of an earlier slot and a thing of this
// one must stay; null when their gap across that axis already keeps them apart. Blocks of two
// subtrees in line with each other keep twice the gap blocks keep inside a group in that
// direction, so neither reads as the next one in the other's stack or row; blocks diagonally
// near keep the ordinary gap in one direction. Tracks keep half an indent clear of everything.
function spacing(a: Rect, b: Rect, column: boolean): number | null {
  const [a0, a1, b0, b1] = column ? [a.x, a.x + a.w, b.x, b.x + b.w] : [a.y, a.y + a.h, b.y, b.y + b.h]
  const across = Math.max(a0 - b1, b0 - a1)
  if (!a.block || !b.block) return across < BLOCK.indent / 2 ? BLOCK.indent / 2 : null
  const [alongGap, acrossGap] = column ? [BLOCK.rowGap, BLOCK.colGap] : [BLOCK.colGap, BLOCK.rowGap]
  if (across < 0) return 2 * alongGap // in line along the axis
  if (across < acrossGap) return alongGap // diagonal, too close across to count as apart
  if (across < 2 * acrossGap) return 0 // must not end up in line across the axis
  return null
}

// How far a slot must move down (in a column) or right (in a row) from where it was laid out to
// clear what the slots before it occupy.
function clearance(placed: Rect[], slot: Rect[], column: boolean): number {
  let d = 0
  for (const b of slot) {
    for (const a of placed) {
      const along = spacing(a, b, column)
      if (along !== null) d = Math.max(d, column ? a.y + a.h + along - b.y : a.x + a.w + along - b.x)
    }
  }
  return d
}

/**
 * Children sit below their parent, indented, in sibling order — the model's blocking order, so
 * a child comes after everything it depends on. Each run of consecutive leaves forms one band of
 * columns of up to STACK_MAX, entered from the side; each child with a subtree of its own is one
 * slot by itself. Slots alternate direction by depth: under the root and every second level
 * below, they stack in a column, groups entered from the side; on the levels between, they run in
 * one row, groups entered from the top. Each slot moves up the column, or left along the row,
 * until it just clears what the slots before it actually occupy, so it tucks into the room a
 * shallower subtree leaves.
 */
function measure(model: BoardModel, id: string, blockH: number, depth: number): Sub {
  const own: Rect = { x: 0, y: 0, w: BLOCK.w, h: blockH, block: true }
  const ids = model.nodes.get(id)?.children ?? []
  if (ids.length === 0) return { id, w: BLOCK.w, h: blockH, kids: [], rects: [own] }
  const subs = ids.map((k) => measure(model, k, blockH, depth + 1))
  const slots: Sub[][] = []
  for (const sub of subs) {
    const last = slots.at(-1)
    if (sub.kids.length === 0 && last !== undefined && last[0].kids.length === 0) last.push(sub)
    else slots.push([sub])
  }

  const column = depth % 2 === 0
  const top = blockH + BLOCK.levelGap
  const spineX = BLOCK.indent / 2

  // A slot laid out with its top-left at (x, y): its kids, and what it occupies. The legs a
  // slot shares with its siblings — the parent's spine, and in a row the bus — never count
  // against it.
  const layOut = (slot: Sub[], x: number, y: number): { kids: Kid[]; rects: Rect[]; mine: Rect[] } => {
    const busY = (column ? y : top) - BLOCK.levelGap / 2
    const kids: Kid[] = []
    if (slot[0].kids.length === 0) {
      const cols = Math.ceil(slot.length / STACK_MAX)
      const rows = Math.ceil(slot.length / cols)
      slot.forEach((sub, i) => {
        const dx = x + Math.floor(i / rows) * (BLOCK.w + BLOCK.colGap)
        const dy = y + (i % rows) * (blockH + BLOCK.rowGap)
        const laneX = dx - BLOCK.indent / 2
        const midY = dy + blockH / 2
        kids.push({ sub, dx, dy, points: [[spineX, blockH], [spineX, busY], [laneX, busY], [laneX, midY], [dx, midY]] })
      })
    } else {
      const sub = slot[0]
      const points: [number, number][] = column
        ? [[spineX, blockH], [spineX, busY], [spineX, y + blockH / 2], [x, y + blockH / 2]]
        : [[spineX, blockH], [spineX, busY], [x + BLOCK.w / 2, busY], [x + BLOCK.w / 2, y]]
      kids.push({ sub, dx: x, dy: y, points })
    }
    const inner = kids.flatMap((k) => k.sub.rects.map((r) => shift(r, k.dx, k.dy)))
    const mine = [...inner, ...kids.flatMap((k) => legs(k.points.slice(column ? 1 : 2)))]
    return { kids, rects: [...inner, ...kids.flatMap((k) => legs(k.points))], mine }
  }

  const kids: Kid[] = []
  const rects: Rect[] = []
  for (const slot of slots) {
    const d = clearance(rects, layOut(slot, BLOCK.indent, top).mine, column)
    const done = column ? layOut(slot, BLOCK.indent, top + d) : layOut(slot, BLOCK.indent + d, top)
    kids.push(...done.kids)
    rects.push(...done.rects)
  }
  rects.push(own)
  const blocks = rects.filter((r) => r.block)
  const w = Math.max(...blocks.map((r) => r.x + r.w))
  const h = Math.max(...blocks.map((r) => r.y + r.h))
  return { id, w, h, kids, rects }
}

function place(sub: Sub, x: number, y: number, out: Layout): void {
  out.placed.set(sub.id, { id: sub.id, x, y })
  for (const kid of sub.kids) {
    out.links.push({ parent: sub.id, child: kid.sub.id, points: kid.points.map(([px, py]) => [x + px, y + py]) })
    place(kid.sub, x + kid.dx, y + kid.dy, out)
  }
}

export function layoutTree(model: BoardModel, blockH: number = BLOCK.h): Layout {
  const root = measure(model, model.root, blockH, 0)
  const out: Layout = { placed: new Map(), links: [], width: root.w, height: root.h }
  place(root, 0, 0, out)
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
