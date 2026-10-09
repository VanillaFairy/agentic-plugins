import { describe, expect, it } from 'vitest'
import type { AgentNode, AgentStatus } from '../shared/model.ts'
import { NODE_H, NODE_W, ROOT, foldCentre, hitAt, layout, withoutDone } from '../web/layout.ts'

const node = (id: string, startedAt: number, status: AgentStatus = 'running', parentId?: string): AgentNode => ({
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
