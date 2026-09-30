import { describe, expect, test } from 'vitest'
import { diffAlerts } from '../server/alerts.ts'
import type { Snapshot, SnapshotEvent, SnapshotNode } from '../shared/snapshot.ts'
import { FORMAT } from '../shared/snapshot.ts'

function node(id: string, status: string, event: SnapshotEvent | null): SnapshotNode {
  return {
    id,
    parent: id === '.' ? null : '.',
    kind: 'leaf',
    title: id,
    intent: '',
    context: '',
    rigor: 'verify',
    role: 'implementer',
    locus: [],
    deps: [],
    acceptance: [],
    status,
    event,
    stage: null,
    branch: 'main',
    worktree: null,
    commits: null,
    files: { spec: { path: '', line: null }, briefs: [], reports: [] },
  }
}

function snapshot(nodes: SnapshotNode[], seq_max: number): Snapshot {
  return {
    format: FORMAT,
    store: '.agentics',
    effort: 'my-effort',
    about: '',
    seq_max,
    malformed: 0,
    folders: [],
    nodes,
    cost: { dispatches: 0, tokens: 0, usd: 0, tokens_unreported: 0, usage: {}, per_leaf: {} },
  }
}

describe('diffAlerts', () => {
  test('the first open alerts nothing', () => {
    const s = snapshot([node('a', 'parked', { kind: 'parked', seq: 3, question: 'q' })], 5)
    const result = diffAlerts(s, undefined)
    expect(result.alerts).toEqual([])
    expect(result.watermark).toBe(s.seq_max)
  })

  test('a new park alerts once', () => {
    const n = node('a', 'parked', { kind: 'parked', seq: 3, question: 'q' })
    const s = snapshot([n], 3)
    const result = diffAlerts(s, 1)
    expect(result.alerts).toHaveLength(1)
    expect(result.alerts[0].node).toBe(n.id)
    expect(result.alerts[0].seq).toBe(n.event!.seq)
    expect(result.watermark).toBe(n.event!.seq)
  })

  test('the same snapshot twice alerts nothing', () => {
    const n = node('a', 'parked', { kind: 'parked', seq: 3, question: 'q' })
    const s = snapshot([n], 3)
    const first = diffAlerts(s, 1)
    const second = diffAlerts(s, first.watermark)
    expect(second.alerts).toEqual([])
    expect(second.watermark).toBe(first.watermark)
  })

  test('history does not alert', () => {
    const n = node('a', 'escalated', { kind: 'escalated', seq: 2, reason: 'r' })
    const s = snapshot([n], 5)
    const result = diffAlerts(s, 2)
    expect(result.alerts).toEqual([])
    expect(result.watermark).toBe(2)
  })

  test('a re-escalation alerts again', () => {
    const first = node('a', 'escalated', { kind: 'escalated', seq: 2, reason: 'r1' })
    const afterFirst = diffAlerts(snapshot([first], 2), 0)
    const second = node('a', 'escalated', { kind: 'escalated', seq: 5, reason: 'r2' })
    const afterSecond = diffAlerts(snapshot([second], 5), afterFirst.watermark)
    expect(afterSecond.alerts).toHaveLength(1)
    expect(afterSecond.alerts[0].seq).toBe(second.event!.seq)
  })

  test('the event must match the status', () => {
    const n = node('a', 'parked', { kind: 'escalated', seq: 3, reason: 'r' })
    const s = snapshot([n], 3)
    const result = diffAlerts(s, 1)
    expect(result.alerts).toEqual([])
  })

  test('alerts come in seq order', () => {
    const a = node('a', 'parked', { kind: 'parked', seq: 5, question: 'qa' })
    const b = node('b', 'escalated', { kind: 'escalated', seq: 3, reason: 'rb' })
    const s = snapshot([a, b], 5)
    const result = diffAlerts(s, 1)
    expect(result.alerts.map((x) => x.node)).toEqual([b.id, a.id])
  })

  test('park wording', () => {
    const withQuestion = node('team.alpha', 'parked', { kind: 'parked', seq: 2, question: 'q?', return: 'r' })
    const withReturn = node('team.beta', 'parked', { kind: 'parked', seq: 3, return: 'r' })
    const withNeither = node('team.gamma', 'parked', { kind: 'parked', seq: 4 })
    const s = snapshot([withQuestion, withReturn, withNeither], 4)
    const result = diffAlerts(s, 0)
    const byId = (id: string) => result.alerts.find((a) => a.node === id)!
    expect(byId(withQuestion.id).title).toBe('alpha is waiting on you')
    expect(byId(withQuestion.id).body).toBe('q?')
    expect(byId(withReturn.id).body).toBe('r')
    expect(byId(withNeither.id).body).toBe('')
  })

  test('escalation wording', () => {
    const withReason = node('team.alpha', 'escalated', { kind: 'escalated', seq: 2, reason: 'why', detail: 'd' })
    const withDetail = node('team.beta', 'escalated', { kind: 'escalated', seq: 3, detail: 'd' })
    const withNeither = node('team.gamma', 'escalated', { kind: 'escalated', seq: 4 })
    const s = snapshot([withReason, withDetail, withNeither], 4)
    const result = diffAlerts(s, 0)
    const byId = (id: string) => result.alerts.find((a) => a.node === id)!
    expect(byId(withReason.id).title).toBe('alpha escalated')
    expect(byId(withReason.id).body).toBe('why')
    expect(byId(withDetail.id).body).toBe('d')
    expect(byId(withNeither.id).body).toBe('')
  })

  test('the root is named after the effort', () => {
    const root = node('.', 'parked', { kind: 'parked', seq: 2, question: 'q' })
    const s = snapshot([root], 2)
    const result = diffAlerts(s, 0)
    expect(result.alerts[0].title).toBe(`${s.effort} is waiting on you`)
  })

  test('the watermark never goes back', () => {
    const s = snapshot([], 1)
    const result = diffAlerts(s, 10)
    expect(result.watermark).toBe(10)
  })
})
