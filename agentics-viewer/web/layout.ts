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

export const BLOCK = { w: 170, h: 48, rowGap: 12, depthGap: 60 }

export function layoutTree(model: BoardModel): Layout {
  const root = hierarchy(model.root, (id) => model.nodes.get(id)?.children ?? [])
  tree<string>().nodeSize([BLOCK.h + BLOCK.rowGap, BLOCK.w + BLOCK.depthGap])(root)

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
    height = Math.max(height, y + BLOCK.h)
  }

  return { placed, width, height }
}
