import type { Snapshot, SnapshotNode } from '../shared/snapshot.ts'
import { FORMAT } from '../shared/snapshot.ts'

function parentOf(id: string): string | null {
  if (id === '.') return null
  const dot = id.lastIndexOf('.')
  return dot === -1 ? '.' : id.slice(0, dot)
}

export function node(id: string, partial: Partial<SnapshotNode> = {}): SnapshotNode {
  const base: SnapshotNode = {
    id,
    parent: parentOf(id),
    kind: 'leaf',
    title: id,
    intent: '',
    context: '',
    rigor: 'quick',
    role: 'implementer',
    locus: [],
    deps: [],
    acceptance: [],
    status: 'planned',
    event: null,
    stage: null,
    branch: '',
    worktree: null,
    commits: null,
    live: null,
    files: { spec: { path: '', line: null }, returns: [] },
    card: { next: null, behind: null, report: null, notes: [], relaunch: null, checkout_changed: null },
  }
  return { ...base, ...partial }
}

export function snap(nodes: SnapshotNode[], extra: Partial<Snapshot> = {}): Snapshot {
  const base: Snapshot = {
    format: FORMAT,
    store: '/store',
    effort: 'effort',
    about: '',
    seq_max: 0,
    malformed: 0,
    folders: [],
    nodes,
    cost: { dispatches: 0, tokens: 0, usd: 0, unmeasured: 0, by_model: {}, per_leaf: {}, per_folder: {} },
  }
  return { ...base, ...extra }
}
