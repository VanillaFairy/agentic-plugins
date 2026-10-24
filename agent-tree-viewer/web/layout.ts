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
// How much of each card a deck shows above the next one.
export const DECK_STEP = 10
// Fewer finished siblings in a row than this stay as cards.
export const MIN_DECK = 3

// What a folded node keeps out of sight: how many agents, and whether any of them still runs.
export type Folded = { hidden: number; running: boolean }

// Finished siblings in a row with nothing under them, piled so each shows only its top strip and
// the last shows whole. `ids` in start order.
export type Deck = { parent: string; ids: string[]; height: number }

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
  deck?: Deck
}

export type Layout = { placed: Placed[]; decks: Deck[]; width: number; height: number }

function childrenOf(nodes: Record<string, AgentNode>): Map<string, AgentNode[]> {
  const kids = new Map<string, AgentNode[]>()
  for (const node of Object.values(nodes).sort((a, b) => a.startedAt - b.startedAt)) {
    const parent = node.parentId !== undefined && nodes[node.parentId] ? node.parentId : ROOT
    const list = kids.get(parent)
    if (list === undefined) kids.set(parent, [node])
    else list.push(node)
  }
  return kids
}

// The height a card takes in the column: a deck card's strip, or the whole card.
export function slot(p: Placed): number {
  return p.deck !== undefined && p.deck.ids[p.deck.ids.length - 1] !== p.id ? DECK_STEP : NODE_H
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

// The nodes, the session's own card included, with agents under them and every one of those done.
export function allDoneUnder(nodes: Record<string, AgentNode>): Set<string> {
  const kids = childrenOf(nodes)
  const found = new Set<string>()
  const done = (id: string): boolean => {
    const under = (kids.get(id) ?? []).map(kid => done(kid.id) && kid.status === 'completed')
    const all = under.every(Boolean)
    if (under.length > 0 && all) found.add(id)
    return all
  }
  done(ROOT)
  return found
}

function folded(kids: Map<string, AgentNode[]>, id: string): Folded {
  const under = (one: string): AgentNode[] => (kids.get(one) ?? []).flatMap(kid => [kid, ...under(kid.id)])
  const all = under(id)
  return { hidden: all.length, running: all.some(n => n.status === 'running') }
}

// A node's children as the column shows them: single cards, and decks where enough finished
// leaves sit in a row, if `stack` is on. A card in `whole` never joins a deck.
function rows(id: string, list: AgentNode[], kids: Map<string, AgentNode[]>, whole: ReadonlySet<string>, stack: boolean): (AgentNode | Deck)[] {
  const out: (AgentNode | Deck)[] = []
  let run: AgentNode[] = []
  const flush = () => {
    if (stack && run.length >= MIN_DECK) out.push({ parent: id, ids: run.map(n => n.id), height: (run.length - 1) * DECK_STEP + NODE_H })
    else out.push(...run)
    run = []
  }
  for (const child of list) {
    if (child.status !== 'running' && !kids.has(child.id) && !whole.has(child.id)) run.push(child)
    else {
      flush()
      out.push(child)
    }
  }
  flush()
  return out
}

// A sideways tree: one column per depth, siblings stacked in start order, and a parent level
// with the middle of its children. Nothing under a node in `collapsed` is placed. Finished
// leaves in a row pile into decks unless `stack` is off; running agents and those in `whole`
// always show whole.
export function layout(
  nodes: Record<string, AgentNode>,
  collapsed: ReadonlySet<string> = new Set(),
  whole: ReadonlySet<string> = new Set(),
  stack = true,
): Layout {
  const kids = childrenOf(nodes)
  const shown = new Map<string, (AgentNode | Deck)[]>()
  const rowsOf = (id: string) => {
    let got = shown.get(id)
    if (got === undefined) shown.set(id, (got = collapsed.has(id) ? [] : rows(id, kids.get(id) ?? [], kids, whole, stack)))
    return got
  }
  const span = new Map<string, number>()
  const measure = (id: string): number => {
    const parts = rowsOf(id).map(r => ('ids' in r ? r.height : measure(r.id)))
    const height = Math.max(NODE_H, parts.reduce((a, b) => a + b, 0) + GAP_Y * Math.max(0, parts.length - 1))
    span.set(id, height)
    return height
  }
  const total = measure(ROOT)

  const placed: Placed[] = []
  const decks: Deck[] = []
  let deepest = 0
  const place = (id: string, node: AgentNode | undefined, parent: string | undefined, top: number, depth: number): number => {
    deepest = Math.max(deepest, depth)
    const here: Placed = { id, ...(node ? { node } : {}), ...(parent !== undefined ? { parent } : {}), x: PAD + depth * (NODE_W + GAP_X), y: top, depth }
    if (kids.has(id)) here.fold = collapsed.has(id) ? folded(kids, id) : 'open'
    placed.push(here)
    const ys: number[] = []
    let at = top
    for (const row of rowsOf(id)) {
      if ('ids' in row) {
        decks.push(row)
        row.ids.forEach((kid, i) => {
          const n = nodes[kid]
          placed.push({ id: kid, ...(n ? { node: n } : {}), parent: id, x: PAD + (depth + 1) * (NODE_W + GAP_X), y: at + i * DECK_STEP, depth: depth + 1, deck: row })
        })
        deepest = Math.max(deepest, depth + 1)
        // A deck lines up with its parent by its middle, as a card does.
        ys.push(at + (row.height - NODE_H) / 2)
        at += row.height + GAP_Y
      } else {
        ys.push(place(row.id, row, id, at, depth + 1))
        at += (span.get(row.id) ?? NODE_H) + GAP_Y
      }
    }
    if (ys.length > 0) here.y = ((ys[0] ?? top) + (ys[ys.length - 1] ?? top)) / 2
    return here.y
  }
  place(ROOT, undefined, undefined, PAD, 0)

  return { placed, decks, width: PAD * 2 + (deepest + 1) * NODE_W + deepest * GAP_X, height: total + PAD * 2 }
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
  const card = lay.placed.find(p => gx >= p.x && gx <= p.x + NODE_W && gy >= p.y && gy < p.y + slot(p))
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
