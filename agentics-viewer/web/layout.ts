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
