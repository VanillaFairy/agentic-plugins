export const FORMAT = 3

export type Approval = 'none' | 'approved' | 'prepared' | 'edited'

export interface SnapshotEvent {
  kind: string
  seq: number
  reason?: string
  detail?: string
  return?: string
  question?: string
  said?: string                   // the file its author wrote in full; empty when there is none
}

// What a session needs to move a node on, computed by agentics on every read.
export interface NodeCard {
  next: { action: string; why: string } | null   // an unmerged leaf's next action on a relaunch
  behind: number | null                          // commits of its folder's branch the leaf's lacks
  report: { path: string; lead: string } | null
  notes: Array<{ seq: number; by: string; text: string }>   // newest first
  relaunch: { execution: string; root: string; retry_escalated: string[] } | null
}

export type ProgressState = 'pending' | 'working' | 'done'

// The executor's own account of the pieces its leaf splits into, rewritten as it works. A view:
// agentics derives nothing from it. `items` is null when the file could not be read, `error` says why.
export interface Progress {
  path: string
  items: Array<{ name: string; state: ProgressState }> | null
  error: string | null
}

export interface SnapshotFolder {
  id: string                      // '.' for the root folder
  title: string
  approval: Approval
  blocking: number
  spec: { path: string }
}

export interface SnapshotNode {
  id: string
  label?: string                  // the visible name; absent from agentics before 4.7.1
  parent: string | null           // null only for the root '.'
  kind: string                    // 'design' | 'composite' | 'group' | 'leaf', or 'review': a folder's integration review
  author?: string                 // 'you' | 'planner'; absent from agentics before 4.16.0, read as 'you'
  title: string
  intent: string
  context: string
  rigor: string
  role: string
  locus: string[]
  deps: string[]
  acceptance: Array<{ text: string; check: string }>
  status: string
  event: SnapshotEvent | null
  stage: string | null
  branch: string
  worktree: string | null
  commits: { count: number; last_subject: string; last_at: string } | null
  progress?: Progress | null      // an unfinished leaf's; absent from agentics before 4.17.0
  files: { spec: { path: string; line: number | null }; briefs: string[]; reports: string[] }
  card: NodeCard
}

export interface ModelUsage {
  input: number
  cache_write: number
  cache_read: number
  output: number
  usd: number | null // null when agentics has no price for the model
}

export interface Spend {
  dispatches: number
  tokens: number
  usd: number
  tokens_unreported: number // dispatches with no usage recorded
  usage: Record<string, ModelUsage>
}

export interface Snapshot {
  format: number
  store: string
  effort: string
  about: string
  seq_max: number
  malformed: number
  folders: SnapshotFolder[]
  nodes: SnapshotNode[]
  cost: Spend & { per_leaf: Record<string, Spend> }
}

export interface EffortListing {
  effort: string
  about: string
  root_status: string
  seq_max: number
  malformed: number
}

export interface EffortsList {
  repo: string
  store: string                   // present whether or not the store exists
  store_present: boolean
  efforts: EffortListing[]        // agentics sends more fields; the viewer reads these
  notes: string
}

export type ProblemCode =
  | 'agentics_missing' | 'agentics_too_old' | 'format_mismatch' | 'snapshot_failed' | 'project_gone'

export interface Problem {
  code: ProblemCode
  path?: string                   // agentics path, or the project path for project_gone
  version?: string                // agentics version, when known
  format?: number                 // the format agentics wrote, for format_mismatch
  detail?: string                 // the error text, for snapshot_failed
}
