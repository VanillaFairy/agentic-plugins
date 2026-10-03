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

  test('children with subtrees alternate: a column under the root, a row below that, a column below that', () => {
    // Three levels of groups, two to a parent, each bottom group holding one leaf.
    const ids = ['a', 'b'].flatMap((a) => [a, ...['p', 'q'].flatMap((p) => [`${a}.${p}`, ...['s', 't'].flatMap((s) => [`${a}.${p}.${s}`, `${a}.${p}.${s}.l`])])])
    const m = buildModel(snap([node('.'), ...ids.map((id) => node(id))]))
    const { placed } = layoutTree(m)
    const runs = (parent: string, axis: 'x' | 'y') => {
      const kids = m.nodes.get(parent)!.children.map((id) => placed.get(id)!)
      const across = axis === 'x' ? 'y' : 'x'
      expect(new Set(kids.map((p) => p[across])).size, `${parent}'s groups share one ${across}`).toBe(1)
      for (let i = 1; i < kids.length; i++) expect(kids[i][axis], `${parent}'s groups in order`).toBeGreaterThan(kids[i - 1][axis])
    }
    runs('.', 'y')
    for (const a of ['a', 'b']) {
      runs(a, 'x')
      for (const p of ['p', 'q']) runs(`${a}.${p}`, 'y')
    }
  })

  test('a child comes after a sibling it depends on: below it in a column, right of it in a row', () => {
    // Under the root (a column): leaf d depends on group g. Under g (a row): leaf g.d on group g.h.
    const s = snap([
      node('.'),
      node('d', { deps: ['g'] }),
      node('g'),
      node('g.d', { deps: ['g.h'] }),
      node('g.h'),
      node('g.h.l'),
    ])
    const { placed } = layoutTree(buildModel(s))
    expect(placed.get('d')!.y).toBeGreaterThan(placed.get('g')!.y)
    expect(placed.get('g.d')!.x).toBeGreaterThan(placed.get('g.h')!.x)
  })

  // Under the root (a column): a, whose row holds a shallow group then a deep one, then b.
  const tuck = snap([
    node('.'),
    ...['a', 'a.p', 'a.p.l', 'a.q', ...Array.from({ length: 5 }, (_, i) => `a.q.l${i}`), 'b', 'b.x'].map((id) => node(id)),
  ])

  test('a slot tucks into the room a shallower subtree before it leaves', () => {
    const { placed } = layoutTree(buildModel(tuck))
    expect(placed.get('b')!.y).toBeLessThan(placed.get('a.q.l4')!.y)
  })

  test('blocks of sibling subtrees in line keep twice the in-group gap, diagonal ones the ordinary gap', () => {
    for (const s of [wide, tuck]) {
      const m = buildModel(s)
      const { placed } = layoutTree(m)
      const under = (id: string): string[] => [id, ...m.nodes.get(id)!.children.flatMap(under)]
      for (const id of m.order) {
        const kids = m.nodes.get(id)!.children
        for (const [i, c1] of kids.entries()) {
          for (const c2 of kids.slice(i + 1)) {
            if (m.nodes.get(c1)!.children.length === 0 && m.nodes.get(c2)!.children.length === 0) continue
            for (const a of under(c1).map((n) => placed.get(n)!)) {
              for (const b of under(c2).map((n) => placed.get(n)!)) {
                const gx = Math.abs(a.x - b.x) - BLOCK.w
                const gy = Math.abs(a.y - b.y) - BLOCK.h
                const apart =
                  gx < 0 ? gy >= 2 * BLOCK.rowGap
                  : gy < 0 ? gx >= 2 * BLOCK.colGap
                  : gx >= BLOCK.colGap || gy >= BLOCK.rowGap
                expect(apart, `${a.id} and ${b.id}`).toBe(true)
              }
            }
          }
        }
      }
    }
  })

  test('no track runs through a block other than its own two ends', () => {
    for (const s of [wide, tuck]) {
      const { placed, links } = layoutTree(buildModel(s))
      for (const l of links) {
        for (const p of placed.values()) {
          if (p.id === l.parent || p.id === l.child) continue
          l.points.slice(1).forEach(([x, y], i) => {
            const [px, py] = l.points[i]
            const crosses = Math.min(x, px) < p.x + BLOCK.w && Math.max(x, px) > p.x && Math.min(y, py) < p.y + BLOCK.h && Math.max(y, py) > p.y
            expect(crosses, `${l.parent}>${l.child} through ${p.id}`).toBe(false)
          })
        }
      }
    }
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

  test('a rail never runs through a block', () => {
    // Groups stacked under the root, the first with leaves and a group of its own below it.
    const stacked = snap([
      node('.'),
      ...['a', 'a.x', 'a.y', 'a.g', 'a.g.l', 'a.h', 'a.h.l', 'b', 'b.x'].map((id) => node(id)),
      node('c', { deps: ['a'] }),
      node('c.x'),
    ])
    const { placed } = layoutTree(buildModel(stacked))
    const deps = [{ from: 'a', to: 'c' }, { from: 'a.x', to: 'b.x' }]
    for (const r of routeDeps(deps, placed, BLOCK.h)) {
      for (const p of placed.values()) {
        const across = p.x < r.railX && r.railX < p.x + BLOCK.w
        const along = p.y < Math.max(r.fromY, r.toY) && Math.min(r.fromY, r.toY) < p.y + BLOCK.h
        expect(across && along, `${r.from}>${r.to} through ${p.id}`).toBe(false)
      }
    }
  })
})
