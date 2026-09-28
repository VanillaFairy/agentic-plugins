import { describe, expect, test } from 'vitest'
import { node, snap } from './snapshot-fixture.ts'
import { buildModel } from '../web/model.ts'
import { layoutTree, routeDeps, BLOCK } from '../web/layout.ts'

describe('layoutTree', () => {
  test('every node is placed', () => {
    const s = snap([node('.'), node('a'), node('a.x'), node('a.y'), node('b')])
    const m = buildModel(s)
    const { placed } = layoutTree(m)
    for (const id of m.order) expect(placed.has(id)).toBe(true)
  })

  test("children sit one depth to the right", () => {
    const s = snap([node('.'), node('a'), node('a.x')])
    const m = buildModel(s)
    const { placed } = layoutTree(m)
    const parent = placed.get('a')!
    const child = placed.get('a.x')!
    expect(child.x).toBe(parent.x + BLOCK.w + BLOCK.depthGap)
  })

  test('blocks at one depth never overlap', () => {
    const s = snap([node('.'), node('a'), node('b'), node('c')])
    const m = buildModel(s)
    const { placed } = layoutTree(m)
    const siblings = ['a', 'b', 'c'].map((id) => placed.get(id)!)
    for (let i = 0; i < siblings.length; i++) {
      for (let j = i + 1; j < siblings.length; j++) {
        expect(Math.abs(siblings[i].y - siblings[j].y)).toBeGreaterThanOrEqual(BLOCK.h + BLOCK.rowGap)
      }
    }
  })

  test('orphans hang from the root', () => {
    const s = snap([node('.'), node('a', { parent: 'ghost' })])
    const m = buildModel(s)
    const { placed } = layoutTree(m)
    const root = placed.get('.')!
    const orphan = placed.get('a')!
    expect(orphan.x).toBe(root.x + BLOCK.w + BLOCK.depthGap)
  })

  test('the layout starts at the origin and reports its size', () => {
    const s = snap([node('.'), node('a'), node('a.x'), node('b')])
    const m = buildModel(s)
    const { placed, width, height } = layoutTree(m)
    let minX = Infinity
    let minY = Infinity
    let maxRight = 0
    let maxBottom = 0
    for (const p of placed.values()) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxRight = Math.max(maxRight, p.x + BLOCK.w)
      maxBottom = Math.max(maxBottom, p.y + BLOCK.h)
    }
    expect(minX).toBe(0)
    expect(minY).toBe(0)
    expect(width).toBe(maxRight)
    expect(height).toBe(maxBottom)
  })
})

describe('routeDeps', () => {
  // A chain a -> b -> c -> d plus a -> d, all siblings in one column.
  const s = snap([
    node('.'),
    node('a'),
    node('b', { deps: ['a'] }),
    node('c', { deps: ['b'] }),
    node('d', { deps: ['c', 'a'] }),
  ])
  const layout = layoutTree(buildModel(s))
  const edges = s.nodes.flatMap((n) => n.deps.map((d) => ({ from: d, to: n.id })))
  const routes = routeDeps(edges, layout.placed, BLOCK.h)

  test('no two edges share an end on the same block', () => {
    const ends = routes.flatMap((r) => [`${r.from}@${r.fromY}`, `${r.to}@${r.toY}`])
    expect(new Set(ends).size).toBe(ends.length)
  })

  test('an edge enters the upper half of the blocked node and leaves the lower half of the blocker', () => {
    for (const r of routes) {
      const from = layout.placed.get(r.from)!
      const to = layout.placed.get(r.to)!
      expect(r.fromY).toBeGreaterThan(from.y + BLOCK.h / 2)
      expect(r.toY).toBeLessThan(to.y + BLOCK.h / 2)
    }
  })

  const lo = (r: (typeof routes)[number]): number => Math.min(r.fromY, r.toY)
  const hi = (r: (typeof routes)[number]): number => Math.max(r.fromY, r.toY)
  const route = (from: string, to: string) => routes.find((r) => r.from === from && r.to === to)!

  test('edges that do not overlap share the innermost rail', () => {
    const chain = [route('a', 'b'), route('b', 'c'), route('c', 'd')]
    const innermost = Math.min(...routes.map((r) => r.railX))
    for (const r of chain) expect(r.railX).toBe(innermost)
  })

  test('an edge containing another runs outside it', () => {
    const outer = route('a', 'd')
    for (const r of routes) {
      if (r !== outer && lo(r) >= lo(outer) && hi(r) <= hi(outer)) expect(outer.railX).toBeGreaterThan(r.railX)
    }
  })

  test('edges that overlap never share a rail', () => {
    for (const x of routes) {
      for (const y of routes) {
        if (x !== y && lo(x) <= hi(y) && lo(y) <= hi(x)) expect(x.railX).not.toBe(y.railX)
      }
    }
  })

  test('an edge to a node outside the layout is dropped', () => {
    expect(routeDeps([{ from: 'ghost', to: 'a' }], layout.placed, BLOCK.h)).toEqual([])
  })
})
