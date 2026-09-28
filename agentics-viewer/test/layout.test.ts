import { describe, expect, test } from 'vitest'
import { node, snap } from './snapshot-fixture.ts'
import { buildModel } from '../web/model.ts'
import { layoutTree, BLOCK } from '../web/layout.ts'

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
