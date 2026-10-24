import { describe, expect, it } from 'vitest'
import type { AgentNode, AgentStatus } from '../shared/model.ts'
import { DECK_STEP, MIN_DECK, NODE_H, NODE_W, ROOT, allDoneUnder, foldCentre, hitAt, layout, withoutDone } from '../web/layout.ts'

const node = (id: string, startedAt: number, status: AgentStatus = 'running', parentId?: string): AgentNode => ({
  kind: 'subagent',
  id,
  ...(parentId !== undefined ? { parentId } : {}),
  type: 't',
  description: id,
  status,
  startedAt,
  toolCount: 0,
  activity: [],
})

const tree = (...nodes: AgentNode[]) => Object.fromEntries(nodes.map(n => [n.id, n]))

describe('withoutDone', () => {
  it('leaves out done agents, except one with something still going under it', () => {
    const kept = withoutDone(tree(node('a', 1, 'completed'), node('b', 2, 'completed'), node('c', 3, 'running', 'b'), node('d', 4, 'failed')))
    expect(Object.keys(kept).sort()).toEqual(['b', 'c', 'd'])
  })
})

describe('allDoneUnder', () => {
  it('names the nodes whose agents below are all done, never a node for its own status', () => {
    const nodes = tree(node('a', 1, 'running'), node('b', 2, 'completed', 'a'), node('c', 3, 'completed'), node('d', 4, 'completed', 'c'), node('e', 5, 'running', 'd'))
    expect([...allDoneUnder(nodes)].sort()).toEqual(['a'])
  })

  it('takes in the session itself once every agent is done', () => {
    expect(allDoneUnder(tree(node('a', 1, 'completed'), node('b', 2, 'completed', 'a'))).has(ROOT)).toBe(true)
  })
})

describe('layout', () => {
  it('stacks siblings in start order in the next column, the parent level with their middle', () => {
    const lay = layout(tree(node('late', 2), node('early', 1)))
    const at = (id: string) => lay.placed.find(p => p.id === id)!
    expect(at('early').y).toBeLessThan(at('late').y)
    expect(at('early').x).toBe(at('late').x)
    expect(at('early').x).toBeGreaterThan(at(ROOT).x)
    expect(at(ROOT).y).toBe((at('early').y + at('late').y) / 2)
  })

  it('hangs an agent whose parent is unknown under the session', () => {
    expect(layout(tree(node('orphan', 1, 'running', 'gone'))).placed.find(p => p.id === 'orphan')?.parent).toBe(ROOT)
  })

  it('places nothing under a folded node and counts what it hides', () => {
    const nodes = tree(node('a', 1, 'completed'), node('b', 2, 'running', 'a'), node('c', 3, 'completed', 'b'))
    const lay = layout(nodes, new Set(['a']))
    expect(lay.placed.map(p => p.id)).toEqual([ROOT, 'a'])
    expect(lay.placed[1]?.fold).toEqual({ hidden: 2, running: true })
    expect(lay.placed[0]?.fold).toBe('open')
  })
})

describe('decks', () => {
  const done = (count: number, from: number, parentId?: string) =>
    Array.from({ length: count }, (_, i) => node(`d${from + i}`, from + i, i % 2 === 0 ? 'completed' : 'failed', parentId))

  it('piles finished leaves in a row into one deck, one strip apart, broken by a running agent', () => {
    const lay = layout(tree(...done(MIN_DECK, 0), node('live', 10), ...done(MIN_DECK - 1, 20)))
    expect(lay.decks.map(d => d.ids)).toEqual([done(MIN_DECK, 0).map(n => n.id)])
    const at = (id: string) => lay.placed.find(p => p.id === id)!
    expect(at('d1').y - at('d0').y).toBe(DECK_STEP)
    expect(at('d20').deck).toBeUndefined()
    expect(at('live').deck).toBeUndefined()
  })

  it('leaves a card asked for whole, and one with agents under it, out of any deck', () => {
    const nodes = tree(...done(MIN_DECK * 2 + 1, 0), node('kid', 50, 'completed', `d${MIN_DECK}`))
    const lay = layout(nodes, new Set(), new Set(['d1']))
    const decked = lay.decks.flatMap(d => d.ids)
    expect(decked).not.toContain('d1')
    expect(decked).not.toContain(`d${MIN_DECK}`)
  })

  it('shows every finished leaf whole when stacking is off', () => {
    const lay = layout(tree(...done(MIN_DECK, 0)), new Set(), new Set(), false)
    expect(lay.decks).toEqual([])
    expect(lay.placed.every(p => p.deck === undefined)).toBe(true)
  })

  it('finds the card whose strip is under the point, and the last card by its whole body', () => {
    const lay = layout(tree(...done(MIN_DECK, 0)))
    const [first, second, last] = lay.decks[0]!.ids.map(id => lay.placed.find(p => p.id === id)!)
    expect(hitAt(lay, first!.x + 30, first!.y + DECK_STEP / 2)).toEqual({ kind: 'card', id: first!.id })
    expect(hitAt(lay, second!.x + 30, second!.y + DECK_STEP / 2)).toEqual({ kind: 'card', id: second!.id })
    expect(hitAt(lay, last!.x + 30, last!.y + NODE_H - 2)).toEqual({ kind: 'card', id: last!.id })
  })
})

describe('hitAt', () => {
  it('finds a fold mark before the card it sits on, and a card by its body', () => {
    const lay = layout(tree(node('a', 1)))
    const root = lay.placed[0]!
    const mark = foldCentre(root)
    expect(hitAt(lay, mark.x - 2, mark.y)).toEqual({ kind: 'fold', id: ROOT })
    expect(hitAt(lay, root.x + NODE_W / 2, root.y + NODE_H / 2)).toEqual({ kind: 'card', id: ROOT })
    expect(hitAt(lay, root.x - 10, root.y - 10)).toBeUndefined()
  })
})
