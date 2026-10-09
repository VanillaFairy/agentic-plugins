import type { LiveActivity, Snapshot, SnapshotNode, SnapshotFolder, Spend, Problem } from '../shared/snapshot.ts'
import { FORMAT } from '../shared/snapshot.ts'

export type Lamp = 'work' | 'hold' | 'stop' | 'done' | 'idle' | 'open' | 'unknown' | 'orphan'

export interface NodeView {
  id: string
  name: string // the node's label; else its last id segment, or the effort name for '.'
  parent: string | null // the drawn parent ('.' for an orphan)
  depth: number
  children: string[] // blocking order: a dependency before its dependant, ties by id
  lamp: Lamp
  status: string
  facts: string[]
  wording: string
  orphan: boolean
  blockedBy: string[] // sibling or ancestor-subtree ids this node's deps name that aren't done yet
  holdsUp: string[] // ids whose blockedBy names this node
  alertBelow: 'hold' | 'stop' | null // a descendant needs you; the worst of them
  node: SnapshotNode
  folder: SnapshotFolder | null // the folder whose id equals the node id, if any
}

export interface Tile {
  node: string
  kind: 'hold' | 'stop'
  seq: number
  title: string
  why: string
}

export interface Counts {
  working: number
  merged: number
  queued: number
  needDesign: number
}

export interface BoardModel {
  root: string // '.'
  nodes: Map<string, NodeView>
  order: string[] // depth-first, parents before children, siblings by id
  tiles: Tile[]
  counts: Counts
}

const MERGED_STATUSES = new Set(['merged', 'integrated', 'landed'])

function mergedCount(statuses: string[]): { merged: number; total: number } {
  let merged = 0
  for (const s of statuses) if (MERGED_STATUSES.has(s)) merged++
  return { merged, total: statuses.length }
}

// A design node needs you to design it. agentics also marks a composite parked or escalated
// when only a descendant is; the node that is itself waiting carries the event that says why,
// and only that node needs you.
export function needsYou(n: SnapshotNode): 'hold' | 'stop' | null {
  if (n.status === 'open') return 'hold'
  if (n.event === null) return null
  if (n.status === 'parked') return 'hold'
  if (n.status === 'escalated') return 'stop'
  return null
}

export interface Below {
  waiting: number
  escalated: number
  needDesign: number
}

const NOTHING_BELOW: Below = { waiting: 0, escalated: 0, needDesign: 0 }

function alertOf(b: Below): 'hold' | 'stop' | null {
  if (b.escalated > 0) return 'stop'
  return b.waiting > 0 || b.needDesign > 0 ? 'hold' : null
}

function belowFacts(b: Below): string[] {
  const facts: string[] = []
  if (b.escalated > 0) facts.push(`${b.escalated} escalated`)
  if (b.waiting > 0) facts.push(`${b.waiting} waiting on you`)
  if (b.needDesign > 0) facts.push(`${b.needDesign} need design`)
  return facts
}

export interface Wording {
  lamp: Lamp
  status: string // the state, shown as a badge; empty when the node only summarizes what is below it
  facts: string[] // what else is true of the node, one line each
  wording: string // status and facts in one phrase, for tooltips and screen readers
}

function worded(lamp: Lamp, status: string, facts: string[] = []): Wording {
  return { lamp, status, facts, wording: [status, ...facts].filter((s) => s !== '').join(', ') }
}

function mergedFact(childStatuses: string[]): string {
  const { merged, total } = mergedCount(childStatuses)
  return `${merged} of ${total} merged`
}

export function lampAndWording(
  n: SnapshotNode,
  folder: SnapshotFolder | null,
  childStatuses: string[],
  below: Below = NOTHING_BELOW,
): Wording {
  if (n.kind === 'review') {
    // A folder's integration review: its own step after the folder's children have merged.
    if (n.status === 'done') return worded('done', 'reviewed')
    if (n.status === 'not_earned') return worded('done', 'not earned')
    return n.stage !== null ? worded('work', n.stage) : worded('idle', 'queued')
  }
  if ((n.status === 'parked' || n.status === 'escalated') && needsYou(n) === null) {
    // No status of its own: its border says something below needs you, its facts say what.
    return worded('idle', '', belowFacts(below))
  }
  switch (n.status) {
    case 'active': {
      if (n.kind === 'leaf') {
        const count = n.commits?.count ?? 0
        const facts = count === 0 ? [] : [count === 1 ? '1 commit' : `${count} commits`]
        if (n.live !== null) facts.push(turnWord(n.live.turns))
        return worded('work', n.stage ?? 'working', facts)
      }
      return worded('work', 'working', [mergedFact(childStatuses)])
    }
    case 'approved':
      return worded('work', n.stage ?? 'awaiting merge')
    case 'reviewing':
      return worded('work', 'awaiting review', [mergedFact(childStatuses)])
    case 'parked':
      return worded('hold', 'waiting on you')
    case 'escalated':
      return worded('stop', 'escalated')
    case 'merged':
    case 'integrated':
    case 'landed':
      return worded('done', n.status)
    case 'planned': {
      if (n.kind === 'leaf' || childStatuses.length === 0) return worded('idle', 'queued')
      return worded('idle', 'queued', [mergedFact(childStatuses)])
    }
    case 'open': {
      // Without a folder of its own the node has no DESIGN.md yet: only its parent's spec names it.
      if (folder === null) return worded('open', 'needs design', ['design not started'])
      const facts: string[] = []
      if (folder.blocking > 0) facts.push(folder.blocking === 1 ? '1 blocking question' : `${folder.blocking} blocking questions`)
      if (folder.approval === 'none') facts.push('not approved')
      else if (folder.approval === 'edited') facts.push('edited since approval')
      return worded('open', 'needs design', facts)
    }
    default:
      return worded('unknown', n.status)
  }
}

/**
 * One parent's children, ordered so a sibling it depends on always comes before it — a
 * topological sort scoped to this sibling list, siblings with no dependency between them kept
 * in id order. A dependency cycle (never expected, never trusted) places whatever's left in id
 * order rather than looping, so this always terminates and never reorders on its own between
 * calls with the same input.
 */
function blockingOrder(ids: string[], byId: Map<string, SnapshotNode>): string[] {
  const siblings = new Set(ids)
  const prereqs = new Map(ids.map((id) => [id, new Set((byId.get(id)?.deps ?? []).filter((d) => siblings.has(d) && d !== id))]))
  const placed = new Set<string>()
  const result: string[] = []
  while (result.length < ids.length) {
    // Nothing in one ready batch depends on anything else in it — placing the whole batch,
    // in id order, is as valid as placing one at a time and needs fewer rounds.
    const ready = ids.filter((id) => !placed.has(id) && [...prereqs.get(id)!].every((d) => placed.has(d))).sort()
    const batch = ready.length > 0 ? ready : ids.filter((id) => !placed.has(id)).sort()
    for (const id of batch) {
      result.push(id)
      placed.add(id)
    }
  }
  return result
}

// agentics cuts green from red's approved branch and audit from green's, so within a cycle
// approval meets the dependency; everywhere else only a merge does.
function depMet(n: SnapshotNode, dep: SnapshotNode, depLamp: Lamp | undefined): boolean {
  if (depLamp === 'done') return true
  const cyclePredecessor = n.rigor === dep.rigor &&
    ((n.role === 'green' && dep.role === 'red') || (n.role === 'audit' && dep.role === 'green'))
  return cyclePredecessor && dep.status === 'approved'
}

export function buildModel(s: Snapshot): BoardModel {
  const byId = new Map<string, SnapshotNode>()
  for (const n of s.nodes) byId.set(n.id, n)
  const foldersById = new Map<string, SnapshotFolder>()
  for (const f of s.folders) foldersById.set(f.id, f)

  // Determine the drawn parent for every node: an orphan (non-null parent
  // absent from the snapshot) is drawn under the root.
  const drawnParent = new Map<string, string | null>()
  const orphan = new Map<string, boolean>()
  for (const n of s.nodes) {
    if (n.parent !== null && !byId.has(n.parent)) {
      drawnParent.set(n.id, '.')
      orphan.set(n.id, true)
    } else {
      drawnParent.set(n.id, n.parent)
      orphan.set(n.id, false)
    }
  }

  const childrenOf = new Map<string, string[]>()
  for (const n of s.nodes) {
    const p = drawnParent.get(n.id)!
    if (p === null) continue
    const list = childrenOf.get(p) ?? []
    list.push(n.id)
    childrenOf.set(p, list)
  }

  // Lamp, wording and what each node is still waiting on, computed before siblings are
  // ordered: the order below reads a dependency's lamp to decide what blocks what.
  const belowOf = new Map<string, Below>()
  function countBelow(id: string): Below {
    const cached = belowOf.get(id)
    if (cached) return cached
    const b = { waiting: 0, escalated: 0, needDesign: 0 }
    for (const c of childrenOf.get(id) ?? []) {
      const child = byId.get(c)!
      const need = needsYou(child)
      if (child.status === 'open') b.needDesign++
      else if (need === 'hold') b.waiting++
      else if (need === 'stop') b.escalated++
      const sub = countBelow(c)
      b.waiting += sub.waiting
      b.escalated += sub.escalated
      b.needDesign += sub.needDesign
    }
    belowOf.set(id, b)
    return b
  }

  const lampWordingOf = new Map<string, Wording>()
  for (const n of s.nodes) {
    const isOrphan = orphan.get(n.id)!
    const children = childrenOf.get(n.id) ?? []
    const childStatuses = children.filter((c) => byId.get(c)!.kind !== 'review').map((c) => byId.get(c)!.status)
    const folder = foldersById.get(n.id) ?? null
    lampWordingOf.set(
      n.id,
      isOrphan
        ? worded('orphan', `parent missing: ${n.parent}`)
        : lampAndWording(n, folder, childStatuses, countBelow(n.id)),
    )
  }
  const blockedByOf = new Map<string, string[]>()
  for (const n of s.nodes) {
    const unmet = n.deps.filter((d) => byId.has(d) && !depMet(n, byId.get(d)!, lampWordingOf.get(d)?.lamp)).sort()
    if (unmet.length > 0) blockedByOf.set(n.id, unmet)
  }
  const holdsUpOf = new Map<string, string[]>()
  for (const [id, unmet] of blockedByOf) {
    for (const d of unmet) holdsUpOf.set(d, [...(holdsUpOf.get(d) ?? []), id])
  }

  // Siblings sort by blocking order, not by name: an id a sibling depends on comes first,
  // and among siblings with no dependency on each other the order falls back to the id, so a
  // fresh session with the same tree computes the same order every time.
  // A folder's integration review comes after the work it reviews.
  for (const [parent, list] of childrenOf) {
    const ordered = blockingOrder(list, byId)
    const isReview = (id: string) => byId.get(id)!.kind === 'review'
    childrenOf.set(parent, [...ordered.filter((id) => !isReview(id)), ...ordered.filter(isReview)])
  }

  const depth = new Map<string, number>()
  const order: string[] = []
  function visit(id: string, d: number): void {
    depth.set(id, d)
    order.push(id)
    for (const c of childrenOf.get(id) ?? []) visit(c, d + 1)
  }
  // An effort still in design has no nodes at all, so no root to walk from.
  if (byId.has('.')) visit('.', 0)

  const nodes = new Map<string, NodeView>()
  for (const id of order) {
    const n = byId.get(id)!
    const isOrphan = orphan.get(id)!
    const children = childrenOf.get(id) ?? []
    const { lamp, status, facts, wording } = lampWordingOf.get(id)!
    nodes.set(id, {
      id,
      name: shownName(n, s.effort),
      parent: drawnParent.get(id)!,
      depth: depth.get(id)!,
      children,
      lamp,
      status,
      facts,
      wording,
      orphan: isOrphan,
      blockedBy: blockedByOf.get(id) ?? [],
      holdsUp: (holdsUpOf.get(id) ?? []).sort(),
      alertBelow: alertOf(countBelow(id)),
      node: n,
      folder: foldersById.get(id) ?? null,
    })
  }

  const tiles: Tile[] = []
  for (const n of s.nodes) {
    if (n.event === null) continue
    if (n.status === 'parked') {
      const why = n.event.question ?? returnInWords(n.event.return ?? '')
      tiles.push({ node: n.id, kind: 'hold', seq: n.event.seq, title: `${shownName(n, s.effort)} is waiting on you`, why })
    } else if (n.status === 'escalated') {
      const why = n.event.reason ?? n.event.detail ?? ''
      tiles.push({ node: n.id, kind: 'stop', seq: n.event.seq, title: `${shownName(n, s.effort)} escalated`, why })
    }
  }
  tiles.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'stop' ? -1 : 1
    return b.seq - a.seq
  })

  const counts: Counts = { working: 0, merged: 0, queued: 0, needDesign: 0 }
  for (const n of s.nodes) {
    if (n.kind !== 'leaf' && n.kind !== 'design') continue
    if (n.kind === 'leaf') {
      if (n.status === 'active' || n.status === 'approved') counts.working++
      else if (MERGED_STATUSES.has(n.status)) counts.merged++
      else if (n.status === 'planned') counts.queued++
    } else if (n.kind === 'design') {
      if (n.status === 'open') counts.needDesign++
    }
  }

  return { root: '.', nodes, order, tiles, counts }
}

// agentics names each node with a label; one too old to send it gets the last id segment.
function shownName(n: SnapshotNode, effort: string): string {
  if (n.label) return n.label
  if (n.id === '.') return effort
  return n.id.slice(n.id.lastIndexOf('/') + 1)
}

export function returnInWords(ret: string): string {
  switch (ret) {
    case 'needs_decision':
      return 'needs a decision'
    case 'needs_design':
      return 'needs design'
    case 'needs_respec':
    case 'spec_defect':
    case 'premise_mismatch':
    case 'contract_changed':
    case 'contract_drift':
      return 'needs the spec fixed'
    case 'cant_tell':
      return "can't tell from the evidence"
    case 'integration_critical':
      return 'needs a decision on the merged work'
    default:
      return ret.replace(/_/g, ' ')
  }
}

function waitingBelow(s: Snapshot, id: string): SnapshotNode[] {
  const byId = new Map(s.nodes.map((n) => [n.id, n]))
  const isBelow = (n: SnapshotNode): boolean => {
    for (let p = n.parent; p !== null; p = byId.get(p)?.parent ?? null) if (p === id) return true
    return false
  }
  return s.nodes.filter((n) => needsYou(n) !== null && isBelow(n))
}

export interface CardFact {
  label: string
  text: string
}

// The node's card in plain words, one fact each: what a relaunch would do next, how far its
// branch trails its folder's, what its last agent led with, where a call wrote into the checkout
// outside its paths, and what earlier sessions noted.
export function cardFacts(n: SnapshotNode): CardFact[] {
  const c = n.card
  const facts: CardFact[] = []
  if (c.next !== null) facts.push({ label: 'Next', text: `${c.next.action}: ${c.next.why}` })
  if (c.behind !== null && c.behind > 0) {
    facts.push({ label: 'Behind', text: `its branch lacks ${c.behind} ${c.behind === 1 ? 'commit' : 'commits'} of its folder's branch` })
  }
  if (c.report !== null && c.report.lead !== '') facts.push({ label: 'Last report', text: c.report.lead })
  if (c.checkout_changed !== null) {
    facts.push({ label: 'Checkout changed', text: `${c.checkout_changed.dispatch} wrote outside its paths: ${c.checkout_changed.paths.join(', ')}` })
  }
  for (const note of c.notes) facts.push({ label: 'Note', text: note.text })
  return facts
}

function relaunchLine(n: SnapshotNode): string | null {
  const r = n.card.relaunch
  if (r === null) return null
  const retry = r.retry.length > 0 ? `, retry ${JSON.stringify(r.retry)}` : ''
  return `Relaunch: execution \`${r.execution}\`, root \`${r.root}\`${retry}`
}

function turnWord(turns: number): string {
  return turns === 1 ? '1 turn' : `${turns} turns`
}

// What the running call on a node is doing: its latest tool and target, its turns, and how long ago.
export function liveLine(live: LiveActivity, now: number): string {
  const tool = live.tool.target !== '' ? `${live.tool.name} ${live.tool.target}` : live.tool.name
  return `Running ${tool}, ${turnWord(live.turns)}, last ${ago(live.at, now)}`
}

export function projectPath(s: Snapshot): string {
  return s.store.replace(/\/\.agentics\/?$/, '')
}

// What to paste into a Claude Code session opened in the project to move an unfinished node
// on; null for a finished one. The viewer is read-only, so this is its only hand-off. An
// integrated node is finished unless it is the root, which still waits for the go to land.
export function claudePrompt(s: Snapshot, n: SnapshotNode): string | null {
  const landable = n.id === '.' && n.status === 'integrated'
  if ((MERGED_STATUSES.has(n.status) || n.kind === 'review') && !landable) return null
  const need = needsYou(n)
  const where = `the agentics effort \`${s.effort}\` in \`${projectPath(s)}\``
  const lines: string[] = []
  if (landable) {
    lines.push(`Use agentics:develop on ${where}: it is integrated, so walk me through its result and land it on my go.`)
  } else if (need === null) {
    const waiting = n.status === 'parked' || n.status === 'escalated' ? waitingBelow(s, n.id) : []
    if (waiting.length > 0) {
      lines.push(`Use agentics:develop to ask me about what waits on me under \`${n.id}\` of ${where}; relaunch only once I've answered.`)
      lines.push(`Waiting: ${waiting.map((w) => `\`${w.id}\` (${w.status})`).join(', ')}`)
    } else {
      const stage = n.stage !== null ? `, stage \`${n.stage}\`` : ''
      lines.push(`Use agentics:develop to resume ${where} from where it stopped.`)
      lines.push(`Unfinished: \`${n.id}\` (${n.status}${stage})`)
    }
  } else if (n.status === 'open') {
    lines.push(`Use agentics:design on the folder \`${n.id}\` of ${where}.`)
  } else if (need === 'hold') {
    const ret = n.event?.return ?? ''
    lines.push(`Use agentics:develop to ask me about the parked node \`${n.id}\` of ${where}; relaunch only once I've answered.`)
    if (ret !== '') lines.push(`Return: \`${ret}\` (${returnInWords(ret)})`)
    if (n.event?.question) lines.push(`Question: ${n.event.question}`)
  } else {
    lines.push(`Use agentics:develop to ask me about the escalated node \`${n.id}\` of ${where}; relaunch only once I've answered.`)
    if (n.event?.reason) lines.push(`Reason: ${n.event.reason}`)
    if (n.event?.detail) lines.push(`Detail: ${n.event.detail}`)
  }
  if (n.files.spec.path !== '') {
    const line = n.files.spec.line !== null ? `:${n.files.spec.line}` : ''
    lines.push(`Spec: \`${n.files.spec.path}${line}\``)
  }
  for (const fact of cardFacts(n)) lines.push(`${fact.label}: ${fact.text}`)
  const relaunch = relaunchLine(n)
  if (relaunch !== null) lines.push(relaunch)
  return lines.join('\n')
}

// The desktop app cuts a longer prompt short.
export const CLAUDE_LINK_PROMPT_MAX = 14_000

// Opens a new Claude Code session of the desktop app in the project with the prompt in its
// composer; the app asks before it uses the folder, and the prompt is sent by hand. Null when
// the prompt would not arrive whole.
export function claudeCodeLink(repo: string, prompt: string): string | null {
  if (prompt.length > CLAUDE_LINK_PROMPT_MAX) return null
  return `claude://code/new?q=${encodeURIComponent(prompt)}&folder=${encodeURIComponent(repo)}`
}

export function problemText(p: Problem): string {
  switch (p.code) {
    case 'agentics_missing':
      return `The viewer can't find agentics. It looked at ${p.path}. Install agentics, or set agentics_path in ~/.agentics-viewer/state.json.`
    case 'agentics_too_old':
      return `agentics ${p.version} at ${p.path} has no snapshot command. It arrives in agentics 4.0.0.`
    case 'format_mismatch':
      return `This viewer reads snapshot format ${FORMAT}. agentics at ${p.path} writes format ${p.format}. Update ${(p.format ?? 0) < FORMAT ? 'agentics' : 'agentics-viewer'}.`
    case 'snapshot_failed':
      return `The first refresh failed: ${p.detail}.`
    case 'project_gone':
      return `This project folder is gone: ${p.path}.`
    default:
      return ''
  }
}

export function ago(iso: string, now: number): string {
  const then = new Date(iso).getTime()
  const diffMs = now - then
  if (diffMs < 60_000) return 'just now'
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 60) return `${diffMin} min ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH} h ago`
  const diffD = Math.floor(diffH / 24)
  return `${diffD} d ago`
}

export function vscodeLink(path: string, line?: number | null): string {
  const slashed = path.replace(/\\/g, '/')
  const segments = slashed.split('/')
  const encoded = segments.map((seg, i) => {
    if (i === 0 && /^[A-Za-z]:$/.test(seg)) return seg
    return encodeURIComponent(seg)
  })
  let out = 'vscode://file/' + encoded.join('/')
  if (typeof line === 'number') out += `:${line}`
  return out
}

export interface SpendRow { model: string; dispatches: string; tokens: string; cost: string }

export interface SpendView {
  cost: string | null // null, with tokens, when nothing was measured
  tokens: string | null
  dispatches: string
  rows: SpendRow[] // per model, dearest first; agentics splits by model for the whole effort only
}

export function compactCount(n: number): string {
  if (n >= 999_500) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

function dollars(usd: number): string {
  return usd > 0 && usd < 0.005 ? '<$0.01' : '$' + usd.toFixed(2)
}

// A "+" says some calls were not measured, so the true cost is higher than the figure.
function costText(s: Spend): string {
  return dollars(s.usd) + (s.unmeasured > 0 ? '+' : '')
}

export function spendView(s: Spend & { by_model?: Record<string, Spend> }): SpendView {
  const count = s.dispatches === 1 ? '1 dispatch' : `${s.dispatches} dispatches`
  if (s.tokens === 0 && s.usd === 0) {
    return { cost: null, tokens: null, dispatches: s.dispatches > 0 ? `${count}, nothing measured` : count, rows: [] }
  }
  const models = Object.entries(s.by_model ?? {}).sort(([, a], [, b]) => b.usd - a.usd)
  return {
    cost: costText(s),
    tokens: `${compactCount(s.tokens)} tokens`,
    dispatches: s.unmeasured > 0 ? `${count} (${s.unmeasured} unmeasured)` : count,
    rows: models.map(([model, m]) => ({
      model: model.replace(/^claude-/, ''),
      dispatches: String(m.dispatches),
      tokens: compactCount(m.tokens),
      cost: costText(m),
    })),
  }
}

/** A node's spend as agentics sums it: a leaf's own, a folder's with every call below it; null when it has none. */
export function nodeSpend(c: Snapshot['cost'], n: SnapshotNode): Spend | null {
  return (n.kind === 'leaf' ? c.per_leaf[n.id] : c.per_folder[n.id]) ?? null
}

export function tileKey(project: string, effort: string, t: Tile): string {
  return `${project}|${effort}|${t.node}|${t.seq}`
}

export function tabTitle(tiles: Tile[], effort: string | null, version: string): string {
  const app = `Agentics Viewer ${version}`
  const name = effort ? `${app}: ${effort}` : app
  return tiles.length === 0 ? name : `(${tiles.length}) ${name}`
}

export function staleText(p: Problem, since: Date): string {
  const hh = String(since.getHours()).padStart(2, '0')
  const mm = String(since.getMinutes()).padStart(2, '0')
  const detail = p.detail ?? ''
  const tail = detail === '' ? 'The last refresh failed.' : `The last refresh failed: ${detail}.`
  return `Showing the board from ${hh}:${mm}. ${tail}`
}

export function malformedText(n: number): string {
  const line = n === 1 ? '1 line' : `${n} lines`
  return `${line} in the logs couldn't be read, so the board may be missing nodes.`
}

export function noEffortsText(projectName: string): string {
  return `No efforts in ${projectName} yet. Start one with /agentics:design.`
}

export function browseErrorText(error: string): string {
  return `Couldn't open the folder dialog: ${error}.`
}

export const TEXT = {
  noProject: 'Open a project to watch its efforts.',
  noTree: 'This effort has no tasks yet. They appear once its design is approved.',
  lostServer: 'Lost the viewer server. Reconnecting.',
  browseWaiting: 'The folder dialog is open. It may be behind this window.',
}

export function kindWord(kind: string): string {
  switch (kind) {
    case 'leaf':
      return 'task'
    case 'composite':
      return 'folder'
    case 'design':
      return 'design'
    default:
      return kind
  }
}

// A stored return is `<execution>/returns/<dispatch>.json`: its dispatch names whose call it was.
export function returnLabel(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path
  return `Return, ${base.replace(/\.json$/, '')}`
}

export function addAck(acks: string[], key: string, cap = 200): string[] {
  const filtered = acks.filter((a) => a !== key)
  filtered.push(key)
  return filtered.slice(-cap)
}

export function visibleRows(model: BoardModel, filter: string, collapsed: Set<string>): string[] {
  const trimmed = filter.trim()
  if (trimmed === '') {
    return model.order.filter((id) => {
      let cur = model.nodes.get(id)!.parent
      while (cur !== null) {
        if (collapsed.has(cur)) return false
        cur = model.nodes.get(cur)!.parent
      }
      return true
    })
  }
  const needle = trimmed.toLowerCase()
  const matched = new Set<string>()
  for (const id of model.order) {
    const view = model.nodes.get(id)!
    if (view.name.toLowerCase().includes(needle) || view.node.title.toLowerCase().includes(needle)) {
      let cur: string | null = id
      while (cur !== null) {
        matched.add(cur)
        cur = model.nodes.get(cur)!.parent
      }
    }
  }
  return model.order.filter((id) => matched.has(id))
}

export function moveSelection(rows: string[], current: string | null, dir: 'up' | 'down'): string | null {
  if (rows.length === 0) return null
  const idx = current === null ? -1 : rows.indexOf(current)
  if (idx === -1) return dir === 'down' ? rows[0] : rows[rows.length - 1]
  if (dir === 'down') return rows[Math.min(idx + 1, rows.length - 1)]
  return rows[Math.max(idx - 1, 0)]
}

export function subtreeDone(model: BoardModel, id: string): boolean {
  const view = model.nodes.get(id)
  if (!view) return false
  let leafCount = 0
  let allDone = true
  function visit(nodeId: string): void {
    const v = model.nodes.get(nodeId)!
    if (v.children.length === 0) {
      leafCount++
      if (v.lamp !== 'done') allDone = false
    } else {
      for (const c of v.children) visit(c)
    }
  }
  for (const c of view.children) visit(c)
  return leafCount > 0 && allDone
}
