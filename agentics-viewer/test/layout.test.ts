import { describe, expect, test } from 'vitest'
import { node, snap } from './snapshot-fixture.ts'
import { buildModel } from '../web/model.ts'
import { layoutTree, routeDeps, BLOCK, STACK_MAX } from '../web/layout.ts'

describe('layoutTree', () => {
  test('every node is placed', () => {
    const s = snap([node('.'), node('a'), node('a.x'), node('a.y'), node('b')])
    const m = buildModel(s)
    const { placed } = layoutTree(m)
    for (const id of m.order) expect(placed.has(id)).toBe(true)
  })

  // Ten groups of one to eight leaves each, like an effort's foundations.
  const wide = snap([
    node('.'),
    ...Array.from({ length: 10 }, (_, g) => [
      node(`g${g}`, { kind: 'composite' }),
      ...Array.from({ length: 1 + (g % 8) }, (_, l) => node(`g${g}.l${l}`)),
    ]).flat(),
  ])

  test('no two blocks overlap', () => {
    const blocks = [...layoutTree(buildModel(wide)).placed.values()]
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const [a, b] = [blocks[i], blocks[j]]
        const apart = a.x + BLOCK.w <= b.x || b.x + BLOCK.w <= a.x || a.y + BLOCK.h <= b.y || b.y + BLOCK.h <= a.y
        expect(apart, `${a.id} and ${b.id}`).toBe(true)
      }
    }
  })

  test('every child sits below its parent and to its right', () => {
    const m = buildModel(wide)
    const { placed } = layoutTree(m)
    for (const id of m.order) {
      const parent = placed.get(id)!
      for (const kid of m.nodes.get(id)!.children) {
        expect(placed.get(kid)!.y).toBeGreaterThanOrEqual(parent.y + BLOCK.h)
        expect(placed.get(kid)!.x).toBeGreaterThan(parent.x)
      }
    }
  })

  test('leaves under one parent stack in a column, then start another', () => {
    const leaves = (n: number) => snap([node('.'), ...Array.from({ length: n }, (_, i) => node(`l${i}`))])
    const columns = (n: number) => new Set([...layoutTree(buildModel(leaves(n))).placed.values()].filter((p) => p.id !== '.').map((p) => p.x)).size
    expect(columns(STACK_MAX)).toBe(1)
    expect(columns(STACK_MAX + 1)).toBe(2)
  })

  test('children with subtrees share one row, left to right in sibling order', () => {
    const m = buildModel(wide)
    const { placed } = layoutTree(m)
    const groups = m.nodes.get(m.root)!.children.map((id) => placed.get(id)!)
    expect(new Set(groups.map((p) => p.y)).size).toBe(1)
    for (let i = 1; i < groups.length; i++) expect(groups[i].x).toBeGreaterThan(groups[i - 1].x)
  })

  test('every parent-child pair gets a track from the parent to the child', () => {
    const m = buildModel(wide)
    const { placed, links } = layoutTree(m)
    const pairs = m.order.flatMap((id) => m.nodes.get(id)!.children.map((kid) => `${id}>${kid}`))
    expect(links.map((l) => `${l.parent}>${l.child}`).sort()).toEqual(pairs.sort())
    const inside = ([x, y]: [number, number], p: { x: number; y: number }) =>
      x >= p.x && x <= p.x + BLOCK.w && y >= p.y && y <= p.y + BLOCK.h
    for (const l of links) {
      expect(inside(l.points[0], placed.get(l.parent)!)).toBe(true)
      expect(inside(l.points[l.points.length - 1], placed.get(l.child)!)).toBe(true)
    }
  })

  test('orphans hang from the root', () => {
    const s = snap([node('.'), node('a', { parent: 'ghost' })])
    const m = buildModel(s)
    const { links } = layoutTree(m)
    expect(links).toContainEqual(expect.objectContaining({ parent: '.', child: 'a' }))
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
