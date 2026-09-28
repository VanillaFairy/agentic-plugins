import type { Snapshot, SnapshotNode, SnapshotFolder, Problem } from '../shared/snapshot.ts'

export type Lamp = 'work' | 'hold' | 'stop' | 'done' | 'idle' | 'open' | 'unknown' | 'orphan'

export interface NodeView {
  id: string
  name: string // last id segment; the effort name for '.'
  parent: string | null // the drawn parent ('.' for an orphan)
  depth: number
  children: string[] // sorted by id
  lamp: Lamp
  wording: string
  orphan: boolean
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

export function lampAndWording(
  n: SnapshotNode,
  folder: SnapshotFolder | null,
  childStatuses: string[],
): { lamp: Lamp; wording: string } {
  switch (n.status) {
    case 'active': {
      if (n.kind === 'leaf') {
        let wording = n.stage ?? 'working'
        if (n.commits && n.commits.count > 0) {
          wording += n.commits.count === 1 ? ', 1 commit' : `, ${n.commits.count} commits`
        }
        return { lamp: 'work', wording }
      }
      const { merged, total } = mergedCount(childStatuses)
      return { lamp: 'work', wording: `${merged} of ${total} merged` }
    }
    case 'approved':
      return { lamp: 'work', wording: n.stage ?? 'awaiting merge' }
    case 'parked':
      return { lamp: 'hold', wording: 'waiting on you' }
    case 'escalated':
      return { lamp: 'stop', wording: 'escalated' }
    case 'merged':
    case 'integrated':
    case 'landed':
      return { lamp: 'done', wording: n.status }
    case 'planned': {
      if (n.kind === 'leaf') return { lamp: 'idle', wording: 'queued' }
      if (childStatuses.length === 0) return { lamp: 'idle', wording: 'queued' }
      const { merged, total } = mergedCount(childStatuses)
      return { lamp: 'idle', wording: `${merged} of ${total} merged` }
    }
    case 'open': {
      let wording = 'needs design'
      if (folder) {
        if (folder.blocking > 0) wording += `, ${folder.blocking} blocking`
        if (folder.approval === 'none') wording += ', not approved'
        else if (folder.approval === 'edited') wording += ', edited since approval'
      }
      return { lamp: 'open', wording }
    }
    default:
      return { lamp: 'unknown', wording: n.status }
  }
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
  for (const list of childrenOf.values()) list.sort()

  const depth = new Map<string, number>()
  const order: string[] = []
  function visit(id: string, d: number): void {
    depth.set(id, d)
    order.push(id)
    for (const c of childrenOf.get(id) ?? []) visit(c, d + 1)
  }
  visit('.', 0)

  const nodes = new Map<string, NodeView>()
  for (const id of order) {
    const n = byId.get(id)!
    const isOrphan = orphan.get(id)!
    const children = childrenOf.get(id) ?? []
    const childStatuses = children.map((c) => byId.get(c)!.status)
    const folder = foldersById.get(id) ?? null
    const { lamp, wording } = isOrphan
      ? { lamp: 'orphan' as Lamp, wording: `parent missing: ${n.parent}` }
      : lampAndWording(n, folder, childStatuses)
    nodes.set(id, {
      id,
      name: id === '.' ? s.effort : lastSegment(id),
      parent: drawnParent.get(id)!,
      depth: depth.get(id)!,
      children,
      lamp,
      wording,
      orphan: isOrphan,
      node: n,
      folder,
    })
  }

  const tiles: Tile[] = []
  for (const n of s.nodes) {
    if (n.event === null) continue
    if (n.status === 'parked') {
      const why = n.event.question ?? returnInWords(n.event.return ?? '')
      tiles.push({ node: n.id, kind: 'hold', seq: n.event.seq, title: `${lastSegment(n.id)} is waiting on you`, why })
    } else if (n.status === 'escalated') {
      const why = n.event.reason ?? n.event.detail ?? ''
      tiles.push({ node: n.id, kind: 'stop', seq: n.event.seq, title: `${lastSegment(n.id)} escalated`, why })
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

function lastSegment(id: string): string {
  const dot = id.lastIndexOf('.')
  return dot === -1 ? id : id.slice(dot + 1)
}

export function afterEdges(s: Snapshot, id: string): { incoming: string[]; outgoing: string[] } {
  const byId = new Set(s.nodes.map((n) => n.id))
  const self = s.nodes.find((n) => n.id === id)
  const incoming = (self?.deps ?? []).filter((d) => byId.has(d)).sort()
  const outgoing = s.nodes.filter((n) => n.deps.includes(id)).map((n) => n.id).sort()
  return { incoming, outgoing }
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

export function problemText(p: Problem): string {
  switch (p.code) {
    case 'agentics_missing':
      return `The viewer can't find agentics. It looked at ${p.path}. Install agentics, or set agentics_path in ~/.agentics-viewer/state.json.`
    case 'agentics_too_old':
      return `agentics ${p.version} at ${p.path} has no snapshot command. It arrives in agentics 4.0.0.`
    case 'format_mismatch':
      return `This viewer reads snapshot format 1. agentics at ${p.path} writes format ${p.format}. Update agentics-viewer.`
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

export function costText(c: Snapshot['cost']): string {
  const tokens = c.tokens >= 1000 ? `${Math.round(c.tokens / 1000)}k tokens` : `${c.tokens} tokens`
  const dispatches = c.dispatches === 1 ? '1 dispatch' : `${c.dispatches} dispatches`
  let out = `${tokens} over ${dispatches}`
  if (c.tokens_unreported > 0) out += `, and ${c.tokens_unreported} unreported`
  return out
}

export function spendText(c: Snapshot['cost'], id: string): string | null {
  const leaf = c.per_leaf[id]
  if (!leaf) return null
  return costText({ dispatches: leaf.dispatches, tokens: leaf.tokens, tokens_unreported: leaf.tokens_unreported, per_leaf: {} })
}

export function tileKey(project: string, effort: string, t: Tile): string {
  return `${project}|${effort}|${t.node}|${t.seq}`
}

export function tabTitle(tiles: Tile[]): string {
  return tiles.length === 0 ? 'agentics viewer' : `(${tiles.length}) agentics viewer`
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

const FILE_LABEL_RE = /-(implementer|test-author|auditor|reviewer|none)-r(\d+)\.md$/

export function fileLabel(path: string, kind: 'brief' | 'report'): string {
  const base = path.split(/[\\/]/).pop() ?? path
  const m = FILE_LABEL_RE.exec(base)
  const prefix = kind === 'brief' ? 'Brief' : 'Report'
  if (!m) return `${prefix}, ${base}`
  return `${prefix}, ${m[1]} round ${m[2]}`
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
