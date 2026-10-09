// Where every card of the tree goes, in graph units. Pure, so the canvas only paints it.

import type { AgentNode, ToolEvent } from '../shared/model.ts'

export const ROOT = 'main'

export const NODE_W = 236
export const NODE_H = 80
export const GAP_X = 60
export const GAP_Y = 14
export const PAD = 40
// The fold mark sits centred on a card's right edge, where its wires leave.
export const FOLD_R = 8

// What a folded node keeps out of sight: how many agents, and whether any of them still runs.
export type Folded = { hidden: number; running: boolean }

// `x`, `y` are the card's top-left corner. `fold` is set on a node with agents under it:
// 'open' while they show.
export type Placed = {
  id: string
  node?: AgentNode
  parent?: string
  x: number
  y: number
  depth: number
  fold?: 'open' | Folded
}

export type Layout = { placed: Placed[]; width: number; height: number }

function childrenOf(nodes: Record<string, AgentNode>): Map<string, AgentNode[]> {
  const kids = new Map<string, AgentNode[]>()
  for (const node of Object.values(nodes).sort((a, b) => a.startedAt - b.startedAt)) {
    const parent = node.parentId !== undefined && nodes[node.parentId] ? node.parentId : ROOT
    kids.set(parent, [...(kids.get(parent) ?? []), node])
  }
  return kids
}

// The tree with every done agent left out, unless something under it is not done.
export function withoutDone(nodes: Record<string, AgentNode>): Record<string, AgentNode> {
  const kids = childrenOf(nodes)
  const kept: Record<string, AgentNode> = {}
  const keep = (node: AgentNode): boolean => {
    const anyKid = (kids.get(node.id) ?? []).map(keep).some(Boolean)
    if (!anyKid && node.status === 'completed') return false
    kept[node.id] = node
    return true
  }
  for (const top of kids.get(ROOT) ?? []) keep(top)
  return kept
}

function folded(kids: Map<string, AgentNode[]>, id: string): Folded {
  const under = (one: string): AgentNode[] => (kids.get(one) ?? []).flatMap(kid => [kid, ...under(kid.id)])
  const all = under(id)
  return { hidden: all.length, running: all.some(n => n.status === 'running') }
}

// A sideways tree: one column per depth, siblings stacked in start order, and a parent level
// with the middle of its children. Nothing under a node in `collapsed` is placed.
export function layout(nodes: Record<string, AgentNode>, collapsed: ReadonlySet<string> = new Set()): Layout {
  const kids = childrenOf(nodes)
  const shown = (id: string) => (collapsed.has(id) ? [] : (kids.get(id) ?? []))
  const span = new Map<string, number>()
  const measure = (id: string): number => {
    const parts = shown(id).map(c => measure(c.id))
    const height = Math.max(NODE_H, parts.reduce((a, b) => a + b, 0) + GAP_Y * Math.max(0, parts.length - 1))
    span.set(id, height)
    return height
  }
  const total = measure(ROOT)

  const placed: Placed[] = []
  let deepest = 0
  const place = (id: string, node: AgentNode | undefined, parent: string | undefined, top: number, depth: number): number => {
    deepest = Math.max(deepest, depth)
    const here: Placed = { id, ...(node ? { node } : {}), ...(parent !== undefined ? { parent } : {}), x: PAD + depth * (NODE_W + GAP_X), y: top, depth }
    if (kids.has(id)) here.fold = collapsed.has(id) ? folded(kids, id) : 'open'
    placed.push(here)
    const ys: number[] = []
    let at = top
    for (const child of shown(id)) {
      ys.push(place(child.id, child, id, at, depth + 1))
      at += (span.get(child.id) ?? NODE_H) + GAP_Y
    }
    if (ys.length > 0) here.y = ((ys[0] ?? top) + (ys[ys.length - 1] ?? top)) / 2
    return here.y
  }
  place(ROOT, undefined, undefined, PAD, 0)

  return { placed, width: PAD * 2 + (deepest + 1) * NODE_W + deepest * GAP_X, height: total + PAD * 2 }
}

export function foldCentre(p: Placed): { x: number; y: number } {
  return { x: p.x + NODE_W, y: p.y + NODE_H / 2 }
}

export type Hit = { kind: 'fold'; id: string } | { kind: 'card'; id: string }

// What sits under graph point (`gx`, `gy`); a fold mark wins over the card it is drawn on.
// `slack` widens the fold mark's reach, in graph units, for a small mark at a low zoom.
export function hitAt(lay: Layout, gx: number, gy: number, slack = 0): Hit | undefined {
  for (const p of lay.placed) {
    if (p.fold === undefined) continue
    const c = foldCentre(p)
    if (Math.hypot(gx - c.x, gy - c.y) <= FOLD_R + 3 + slack) return { kind: 'fold', id: p.id }
  }
  const card = lay.placed.find(p => gx >= p.x && gx <= p.x + NODE_W && gy >= p.y && gy <= p.y + NODE_H)
  return card === undefined ? undefined : { kind: 'card', id: card.id }
}

// A stopwatch reading: whole seconds gone, seconds shown at every length.
export function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${pad(s % 60)}s`
  return `${Math.floor(m / 60)}h ${pad(m % 60)}m ${pad(s % 60)}s`
}

export function current(list: readonly ToolEvent[] | undefined): ToolEvent | undefined {
  return [...(list ?? [])].reverse().find(one => one.endedAt === undefined)
}

export const STATUS_WORD = {
  running: 'running',
  completed: 'done',
  failed: 'failed',
  killed: 'stopped',
} as const
