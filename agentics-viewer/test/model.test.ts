import { describe, expect, test } from 'vitest'
import { node, snap } from './snapshot-fixture.ts'
import type { SnapshotFolder, SnapshotNode } from '../shared/snapshot.ts'
import type { Tile } from '../web/model.ts'
import {
  buildModel,
  lampAndWording,
  afterEdges,
  returnInWords,
  problemText,
  ago,
  vscodeLink,
  costText,
  spendText,
  tileKey,
  tabTitle,
  staleText,
  malformedText,
  noEffortsText,
  browseErrorText,
  TEXT,
  kindWord,
  fileLabel,
  addAck,
  visibleRows,
  moveSelection,
  subtreeDone,
} from '../web/model.ts'

// Depth-first pre-order over a node list, read from each node's own `.parent`
// (as the fixture derives it), never a hand-typed order.
function expectedOrder(nodes: SnapshotNode[]): string[] {
  const childrenOf = new Map<string, string[]>()
  for (const n of nodes) {
    if (n.parent === null) continue
    const list = childrenOf.get(n.parent) ?? []
    list.push(n.id)
    childrenOf.set(n.parent, list)
  }
  for (const list of childrenOf.values()) list.sort()
  const out: string[] = []
  function visit(id: string): void {
    out.push(id)
    for (const c of childrenOf.get(id) ?? []) visit(c)
  }
  visit('.')
  return out
}

describe('lampAndWording', () => {
  test('active leaf shows stage and commits', () => {
    const n = node('a', { status: 'active', kind: 'leaf', stage: 'fix round 2', commits: { count: 3, last_subject: '', last_at: '' } })
    const r = lampAndWording(n, null, [])
    expect(r.lamp).toBe('work')
    expect(r.wording).toBe('fix round 2, 3 commits')
  })

  test('one commit is singular', () => {
    const n = node('a', { status: 'active', kind: 'leaf', stage: 'reviewing', commits: { count: 1, last_subject: '', last_at: '' } })
    expect(lampAndWording(n, null, []).wording).toBe('reviewing, 1 commit')
  })

  test('active leaf without a stage reads working', () => {
    const n = node('a', { status: 'active', kind: 'leaf', stage: null, commits: null })
    expect(lampAndWording(n, null, []).wording).toBe('working')
  })

  test('active folder counts merged children', () => {
    const n = node('a', { status: 'active', kind: 'composite' })
    const r = lampAndWording(n, null, ['merged', 'active', 'planned'])
    expect(r.lamp).toBe('work')
    expect(r.wording).toBe('1 of 3 merged')
  })

  test('integrated and landed count as merged', () => {
    const n = node('a', { status: 'active', kind: 'composite' })
    expect(lampAndWording(n, null, ['integrated', 'landed', 'active']).wording).toBe('2 of 3 merged')
  })

  test('approved reads its stage or awaiting merge', () => {
    const held = node('a', { status: 'approved', stage: 'held' })
    const none = node('a', { status: 'approved', stage: null })
    expect(lampAndWording(held, null, []).lamp).toBe('work')
    expect(lampAndWording(held, null, []).wording).toBe('held')
    expect(lampAndWording(none, null, []).wording).toBe('awaiting merge')
  })

  test('parked waits on you', () => {
    const n = node('a', { status: 'parked' })
    const r = lampAndWording(n, null, [])
    expect(r.lamp).toBe('hold')
    expect(r.wording).toBe('waiting on you')
  })

  test('escalated is stop', () => {
    const n = node('a', { status: 'escalated' })
    const r = lampAndWording(n, null, [])
    expect(r.lamp).toBe('stop')
    expect(r.wording).toBe('escalated')
  })

  test('finished states are quiet', () => {
    for (const status of ['merged', 'integrated', 'landed']) {
      const n = node('a', { status })
      const r = lampAndWording(n, null, [])
      expect(r.lamp).toBe('done')
      expect(r.wording).toBe(status)
    }
  })

  test('planned leaf is queued', () => {
    const n = node('a', { status: 'planned', kind: 'leaf' })
    const r = lampAndWording(n, null, [])
    expect(r.lamp).toBe('idle')
    expect(r.wording).toBe('queued')
  })

  test('planned folder counts children', () => {
    const n = node('a', { status: 'planned', kind: 'composite' })
    const r = lampAndWording(n, null, ['planned', 'planned'])
    expect(r.lamp).toBe('idle')
    expect(r.wording).toBe('0 of 2 merged')
  })

  test('planned folder with no children is queued', () => {
    // Not a named acceptance line, but the rule text is explicit ("else queued"):
    // a lazy port of the leaf branch could show "0 of 0 merged" instead.
    const n = node('a', { status: 'planned', kind: 'composite' })
    expect(lampAndWording(n, null, []).wording).toBe('queued')
  })

  test('open design shows blocking and approval', () => {
    const folder: SnapshotFolder = { id: 'a', title: 'A', approval: 'none', blocking: 1, spec: { path: '' } }
    const n = node('a', { status: 'open', kind: 'design' })
    const r = lampAndWording(n, folder, [])
    expect(r.lamp).toBe('open')
    expect(r.wording).toBe('needs design, 1 blocking, not approved')
  })

  test('edited spec is named', () => {
    const folder: SnapshotFolder = { id: 'a', title: 'A', approval: 'edited', blocking: 0, spec: { path: '' } }
    const n = node('a', { status: 'open', kind: 'design' })
    expect(lampAndWording(n, folder, []).wording).toBe('needs design, edited since approval')
  })

  test('approved design needs only design', () => {
    const folder: SnapshotFolder = { id: 'a', title: 'A', approval: 'approved', blocking: 0, spec: { path: '' } }
    const n = node('a', { status: 'open', kind: 'design' })
    expect(lampAndWording(n, folder, []).wording).toBe('needs design')
  })

  test('open without a folder', () => {
    const n = node('a', { status: 'open', kind: 'design' })
    expect(lampAndWording(n, null, []).wording).toBe('needs design')
  })

  test('unknown status shows its raw name', () => {
    const n = node('a', { status: 'paused' })
    const r = lampAndWording(n, null, [])
    expect(r.lamp).toBe('unknown')
    expect(r.wording).toBe('paused')
  })

  test('active leaf with zero commits shows no commit count', () => {
    // The rule keys the suffix off commits.count > 0, not just a non-null
    // commits object; a `commits &&` check without the count would slip
    // ", 0 commits" in.
    const n = node('a', { status: 'active', kind: 'leaf', stage: 'x', commits: { count: 0, last_subject: '', last_at: '' } })
    expect(lampAndWording(n, null, []).wording).toBe('x')
  })
})

describe('buildModel', () => {
  test('order is depth-first by id', () => {
    // `a-b` is a root-level sibling whose id sorts before `a.a` and `a.z` in a
    // plain lexicographic sort of all ids ('-' 0x2D < '.' 0x2E), but after them
    // in depth-first order (it's a sibling of `a`, not a descendant). A plain
    // `nodes.map(id).sort()` implementation fails this test.
    const nodes = [node('.'), node('b'), node('a'), node('a.z'), node('a.a'), node('b.a'), node('a-b')]
    const s = snap(nodes)
    const m = buildModel(s)
    expect(m.order).toEqual(expectedOrder(nodes))
    expect(m.order).toEqual(['.', 'a', 'a.a', 'a.z', 'a-b', 'b', 'b.a'])
  })

  test('names are last segments', () => {
    const s = snap([node('.'), node('a'), node('a.b')], { effort: 'my-effort' })
    const m = buildModel(s)
    expect(m.nodes.get('.')!.name).toBe('my-effort')
    expect(m.nodes.get('a')!.name).toBe('a')
    expect(m.nodes.get('a.b')!.name).toBe('b')
  })

  test('depth counts from the root', () => {
    const s = snap([node('.'), node('a'), node('a.b')])
    const m = buildModel(s)
    expect(m.nodes.get('.')!.depth).toBe(0)
    expect(m.nodes.get('a')!.depth).toBe(1)
    expect(m.nodes.get('a.b')!.depth).toBe(2)
  })

  test('an orphan is drawn under the root', () => {
    const s = snap([node('.'), node('a', { parent: 'ghost' })])
    const m = buildModel(s)
    const view = m.nodes.get('a')!
    expect(view.orphan).toBe(true)
    expect(view.parent).toBe('.')
    expect(view.lamp).toBe('orphan')
    expect(view.wording).toBe('parent missing: ghost')
  })

  test('nodes find their folders', () => {
    const folder: SnapshotFolder = { id: 'a', title: 'A', approval: 'none', blocking: 0, spec: { path: '' } }
    const s = snap([node('.'), node('a', { kind: 'design' }), node('b')], { folders: [folder] })
    const m = buildModel(s)
    expect(m.nodes.get('a')!.folder).toBe(folder)
    expect(m.nodes.get('b')!.folder).toBeNull()
  })

  test('escalations lead the tiles', () => {
    const s = snap([
      node('.'),
      node('h1', { status: 'parked', event: { kind: 'x', seq: 5 } }),
      node('h2', { status: 'parked', event: { kind: 'x', seq: 9 } }),
      node('s1', { status: 'escalated', event: { kind: 'x', seq: 3 } }),
      node('s2', { status: 'escalated', event: { kind: 'x', seq: 7 } }),
    ])
    const m = buildModel(s)
    expect(m.tiles.map((t) => t.node)).toEqual(['s2', 's1', 'h2', 'h1'])
    expect(m.tiles.map((t) => t.kind)).toEqual(['stop', 'stop', 'hold', 'hold'])
  })

  test('tile titles name the node and its state', () => {
    // Titled but not separately covered by any acceptance line; the format
    // ("<name> is waiting on you" / "<name> escalated") is stated in the
    // Rules and would otherwise go untested.
    const s = snap([
      node('.'),
      node('held-thing', { status: 'parked', event: { kind: 'x', seq: 1 } }),
      node('stopped-thing', { status: 'escalated', event: { kind: 'x', seq: 2 } }),
    ])
    const m = buildModel(s)
    const hold = m.tiles.find((t) => t.node === 'held-thing')!
    const stop = m.tiles.find((t) => t.node === 'stopped-thing')!
    expect(hold.title).toBe('held-thing is waiting on you')
    expect(stop.title).toBe('stopped-thing escalated')
  })

  test('hold tiles explain the question', () => {
    const s = snap([
      node('.'),
      node('h1', { status: 'parked', event: { kind: 'x', seq: 1, question: 'why?' } }),
      node('h2', { status: 'parked', event: { kind: 'x', seq: 2, return: 'needs_decision' } }),
    ])
    const m = buildModel(s)
    expect(m.tiles.find((t) => t.node === 'h1')!.why).toBe('why?')
    expect(m.tiles.find((t) => t.node === 'h2')!.why).toBe('needs a decision')
  })

  test('stop tiles explain the reason', () => {
    const s = snap([
      node('.'),
      node('s1', { status: 'escalated', event: { kind: 'x', seq: 1, reason: 'blocked' } }),
      node('s2', { status: 'escalated', event: { kind: 'x', seq: 2, detail: 'stack trace' } }),
    ])
    const m = buildModel(s)
    expect(m.tiles.find((t) => t.node === 's1')!.why).toBe('blocked')
    expect(m.tiles.find((t) => t.node === 's2')!.why).toBe('stack trace')
  })

  test('no event, no tile', () => {
    const s = snap([node('.'), node('a', { status: 'parked', event: null })])
    const m = buildModel(s)
    expect(m.tiles).toEqual([])
  })

  test('counts cover leaves and design nodes', () => {
    const s = snap([
      node('.', { kind: 'composite', status: 'active' }),
      node('c1', { kind: 'composite', status: 'active' }),
      node('w1', { status: 'active' }),
      node('w2', { status: 'approved' }),
      node('m1', { status: 'merged' }),
      node('m2', { status: 'integrated' }),
      node('m3', { status: 'landed' }),
      node('q1', { status: 'planned' }),
      node('d1', { kind: 'design', status: 'open' }),
    ])
    const m = buildModel(s)
    expect(m.counts).toEqual({ working: 2, merged: 3, queued: 1, needDesign: 1 })
  })
})

describe('afterEdges', () => {
  test('after edges in and out', () => {
    const s = snap([
      node('.'),
      node('a', { deps: ['c', 'b'] }),
      node('b'),
      node('c'),
      node('e', { deps: ['a'] }),
      node('d', { deps: ['a'] }),
    ])
    const r = afterEdges(s, 'a')
    expect(r.incoming).toEqual(['b', 'c'])
    expect(r.outgoing).toEqual(['d', 'e'])
  })

  test('missing deps are dropped', () => {
    const s = snap([node('.'), node('a', { deps: ['ghost', 'b'] }), node('b')])
    expect(afterEdges(s, 'a').incoming).toEqual(['b'])
  })
})

describe('returnInWords', () => {
  test('needs_decision in words', () => {
    expect(returnInWords('needs_decision')).toBe('needs a decision')
  })
  test('needs_design in words', () => {
    expect(returnInWords('needs_design')).toBe('needs design')
  })
  test('needs_respec in words', () => {
    expect(returnInWords('needs_respec')).toBe('needs the spec fixed')
  })
  test('spec_defect in words', () => {
    expect(returnInWords('spec_defect')).toBe('needs the spec fixed')
  })
  test('premise_mismatch in words', () => {
    expect(returnInWords('premise_mismatch')).toBe('needs the spec fixed')
  })
  test('contract_changed in words', () => {
    expect(returnInWords('contract_changed')).toBe('needs the spec fixed')
  })
  test('contract_drift in words', () => {
    expect(returnInWords('contract_drift')).toBe('needs the spec fixed')
  })
  test('cant_tell in words', () => {
    expect(returnInWords('cant_tell')).toBe("can't tell from the evidence")
  })
  test('integration_critical in words', () => {
    expect(returnInWords('integration_critical')).toBe('needs a decision on the merged work')
  })
  test('an unknown return reads as words', () => {
    expect(returnInWords('some_thing')).toBe('some thing')
  })
})

describe('problemText', () => {
  test('agentics_missing sentence', () => {
    expect(problemText({ code: 'agentics_missing', path: '/opt/agentics' })).toBe(
      "The viewer can't find agentics. It looked at /opt/agentics. Install agentics, or set agentics_path in ~/.agentics-viewer/state.json.",
    )
  })
  test('agentics_too_old sentence', () => {
    expect(problemText({ code: 'agentics_too_old', version: '3.2.0', path: '/opt/agentics' })).toBe(
      'agentics 3.2.0 at /opt/agentics has no snapshot command. It arrives in agentics 4.0.0.',
    )
  })
  test('format_mismatch sentence', () => {
    expect(problemText({ code: 'format_mismatch', path: '/opt/agentics', format: 2 })).toBe(
      'This viewer reads snapshot format 1. agentics at /opt/agentics writes format 2. Update agentics-viewer.',
    )
  })
  test('snapshot_failed sentence', () => {
    expect(problemText({ code: 'snapshot_failed', detail: 'ECONNREFUSED' })).toBe('The first refresh failed: ECONNREFUSED.')
  })
  test('project_gone sentence', () => {
    expect(problemText({ code: 'project_gone', path: '/work/proj' })).toBe('This project folder is gone: /work/proj.')
  })
})

describe('text helpers', () => {
  test('stale text', () => {
    const since = new Date(2026, 8, 27, 14, 2, 0)
    expect(staleText({ code: 'snapshot_failed', detail: 'boom' }, since)).toBe(
      'Showing the board from 14:02. The last refresh failed: boom.',
    )
  })

  test('stale text without detail', () => {
    const since = new Date(2026, 8, 27, 14, 2, 0)
    expect(staleText({ code: 'snapshot_failed', detail: '' }, since)).toBe('Showing the board from 14:02. The last refresh failed.')
  })

  test('malformed text', () => {
    expect(malformedText(3)).toBe("3 lines in the logs couldn't be read, so the board may be missing nodes.")
    expect(malformedText(1)).toBe("1 line in the logs couldn't be read, so the board may be missing nodes.")
  })

  test('no efforts text', () => {
    expect(noEffortsText('eva-plays-2')).toBe('No efforts in eva-plays-2 yet. Start one with /agentics:design.')
  })

  test('browse error text', () => {
    expect(browseErrorText('x')).toBe("Couldn't open the folder dialog: x.")
  })

  test('fixed page sentences', () => {
    expect(TEXT.noProject).toBe('Open a project to watch its efforts.')
    expect(TEXT.lostServer).toBe('Lost the viewer server. Reconnecting.')
    expect(TEXT.browseWaiting).toBe('The folder dialog is open. It may be behind this window.')
  })

  test('kind words', () => {
    expect(kindWord('leaf')).toBe('task')
    expect(kindWord('composite')).toBe('folder')
    expect(kindWord('design')).toBe('design')
    expect(kindWord('mystery')).toBe('mystery')
  })

  test('a brief is labelled', () => {
    expect(fileLabel('/work/briefs/a.impl-implementer-r1.md', 'brief')).toBe('Brief, implementer round 1')
  })

  test('a report with a dashed role is labelled', () => {
    expect(fileLabel('/work/reports/20260927-101500-a.impl-test-author-r2.md', 'report')).toBe('Report, test-author round 2')
  })

  test('dashes in the node part do not confuse the role', () => {
    expect(fileLabel('x-y.z-w-reviewer-r3.md', 'brief')).toBe('Brief, reviewer round 3')
  })

  test('an unparsable name falls back to the base name', () => {
    expect(fileLabel('odd.md', 'brief')).toBe('Brief, odd.md')
  })

  test('fileLabel accepts the none role', () => {
    // The rule's own regex names "none" as a valid role; nothing in the
    // acceptance list exercises it, so a hand-rolled 4-role check would pass
    // every named test while still rejecting this one.
    expect(fileLabel('a.b-none-r1.md', 'brief')).toBe('Brief, none round 1')
  })
})

describe('acks', () => {
  test('acks append newest last', () => {
    expect(addAck(['a', 'b'], 'c')).toEqual(['a', 'b', 'c'])
  })

  test('an ack is never duplicated', () => {
    expect(addAck(['a', 'b', 'c'], 'a')).toEqual(['b', 'c', 'a'])
  })

  test('acks are capped', () => {
    expect(addAck(['a', 'b', 'c'], 'd', 3)).toEqual(['b', 'c', 'd'])
  })
})

describe('visibleRows', () => {
  test('collapse hides descendants', () => {
    const s = snap([node('.'), node('a'), node('a.x'), node('b')])
    const m = buildModel(s)
    const rows = visibleRows(m, '', new Set(['a']))
    expect(rows).toContain('.')
    expect(rows).toContain('a')
    expect(rows).toContain('b')
    expect(rows).not.toContain('a.x')
  })

  test('the filter keeps matches and their ancestors', () => {
    const s = snap([node('.'), node('ops'), node('ops.action-queue'), node('ops.other'), node('solo')])
    const m = buildModel(s)
    const rows = visibleRows(m, 'QUEUE', new Set())
    expect([...rows].sort()).toEqual(['.', 'ops', 'ops.action-queue'])
  })

  test('the filter matches titles', () => {
    const s = snap([node('.'), node('a', { title: 'Refresh the annunciator' }), node('b', { title: 'Something else' })])
    const m = buildModel(s)
    const rows = visibleRows(m, 'annunciator', new Set())
    expect(rows).toContain('a')
    expect(rows).not.toContain('b')
  })

  test('filtering ignores collapse', () => {
    const s = snap([node('.'), node('a'), node('a.x')])
    const m = buildModel(s)
    const rows = visibleRows(m, 'x', new Set(['a']))
    expect(rows).toContain('a.x')
  })
})

describe('moveSelection', () => {
  test('selection moves through rows', () => {
    expect(moveSelection(['a', 'b', 'c'], 'a', 'down')).toBe('b')
    expect(moveSelection(['a', 'b', 'c'], 'c', 'up')).toBe('b')
  })

  test('selection stops at the ends', () => {
    expect(moveSelection(['a', 'b', 'c'], 'c', 'down')).toBe('c')
    expect(moveSelection(['a', 'b', 'c'], 'a', 'up')).toBe('a')
  })

  test('selection starts at an end', () => {
    expect(moveSelection(['a', 'b', 'c'], null, 'down')).toBe('a')
    expect(moveSelection(['a', 'b', 'c'], null, 'up')).toBe('c')
    expect(moveSelection(['a', 'b', 'c'], 'ghost', 'down')).toBe('a')
  })

  test('no rows, no selection', () => {
    expect(moveSelection([], null, 'down')).toBeNull()
    expect(moveSelection([], 'a', 'up')).toBeNull()
  })
})

describe('subtreeDone', () => {
  test('a finished folder is done', () => {
    const s = snap([node('.', { kind: 'composite' }), node('a', { kind: 'composite' }), node('a.x', { status: 'merged' }), node('a.y', { status: 'landed' })])
    const m = buildModel(s)
    expect(subtreeDone(m, 'a')).toBe(true)
  })

  test('one unfinished leaf keeps a folder live', () => {
    const s = snap([node('.', { kind: 'composite' }), node('a', { kind: 'composite' }), node('a.x', { status: 'merged' }), node('a.y', { status: 'active' })])
    const m = buildModel(s)
    expect(subtreeDone(m, 'a')).toBe(false)
  })

  test('an empty folder is not done', () => {
    const s = snap([node('.', { kind: 'composite' }), node('a', { kind: 'composite' })])
    const m = buildModel(s)
    expect(subtreeDone(m, 'a')).toBe(false)
  })
})

describe('ago', () => {
  test('ago buckets', () => {
    const now = Date.UTC(2026, 0, 1, 12, 0, 0)
    expect(ago(new Date(now - 30_000).toISOString(), now)).toBe('just now')
    expect(ago(new Date(now - 5 * 60_000).toISOString(), now)).toBe('5 min ago')
    expect(ago(new Date(now - 3 * 3_600_000).toISOString(), now)).toBe('3 h ago')
    expect(ago(new Date(now - 2 * 86_400_000).toISOString(), now)).toBe('2 d ago')
  })

  test('a future commit time reads just now', () => {
    // 10 minutes ahead is well past the 60 s "just now" window if it were in
    // the past, so this isolates the future-clock-skew rule from that bucket.
    const now = Date.UTC(2026, 0, 1, 12, 0, 0)
    expect(ago(new Date(now + 10 * 60_000).toISOString(), now)).toBe('just now')
  })
})

describe('vscodeLink', () => {
  test('vscode links encode spaces and keep the drive', () => {
    expect(vscodeLink('C:\\My Work\\a b\\DESIGN.md', 12)).toBe('vscode://file/C:/My%20Work/a%20b/DESIGN.md:12')
  })

  test('no line, no suffix', () => {
    expect(vscodeLink('C:\\My Work\\a b\\DESIGN.md', null)).toBe('vscode://file/C:/My%20Work/a%20b/DESIGN.md')
  })
})

describe('cost text', () => {
  test('cost in thousands', () => {
    expect(costText({ dispatches: 23, tokens: 412345, tokens_unreported: 0, per_leaf: {} })).toBe('412k tokens over 23 dispatches')
  })

  test('small cost and one dispatch', () => {
    expect(costText({ dispatches: 1, tokens: 800, tokens_unreported: 0, per_leaf: {} })).toBe('800 tokens over 1 dispatch')
  })

  test('unreported dispatches are named', () => {
    expect(costText({ dispatches: 5, tokens: 2000, tokens_unreported: 2, per_leaf: {} })).toBe('2k tokens over 5 dispatches, and 2 unreported')
  })

  test('no spend for unmeasured nodes', () => {
    const c = {
      dispatches: 5,
      tokens: 2000,
      tokens_unreported: 0,
      per_leaf: { present: { dispatches: 2, tokens: 900, tokens_unreported: 0 } },
    }
    expect(spendText(c, 'missing')).toBeNull()
    expect(spendText(c, 'present')).toBe('900 tokens over 2 dispatches')
  })
})

describe('tabTitle and tileKey', () => {
  test('tab title counts tiles', () => {
    expect(tabTitle([])).toBe('agentics viewer')
    const tiles: Tile[] = [
      { node: 'a', kind: 'stop', seq: 1, title: 't', why: 'w' },
      { node: 'b', kind: 'hold', seq: 2, title: 't', why: 'w' },
    ]
    expect(tabTitle(tiles)).toBe('(2) agentics viewer')
  })

  test('tile key', () => {
    const t: Tile = { node: 'n1', kind: 'hold', seq: 4, title: 't', why: 'w' }
    expect(tileKey('proj', 'eff', t)).toBe('proj|eff|n1|4')
  })
})
