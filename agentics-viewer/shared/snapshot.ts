export const FORMAT = 4

export type Approval = 'none' | 'approved' | 'prepared' | 'edited'

export interface SnapshotEvent {
  kind: string
  seq: number
  reason?: string
  detail?: string
  return?: string
  question?: string
  said?: string                   // the dispatch whose stored return holds its text; empty when there is none
}

// What a session needs to move a node on, computed by agentics on every read.
export interface NodeCard {
  next: { action: string; why: string } | null   // an unmerged leaf's next action on a relaunch
  behind: number | null                          // commits of its folder's branch the leaf's lacks
  report: { dispatch: string; lead: string } | null   // the latest stored return that carries text
  notes: Array<{ seq: number; by: string; text: string }>   // newest first
  relaunch: { execution: string; root: string; retry: string[] } | null
  checkout_changed: { dispatch: string; paths: string[] } | null   // a call that wrote into the checkout outside its paths
}

// The call running on a node, from the file agentics' runner rewrites while it runs. A view:
// agentics derives nothing from it.
export interface LiveActivity {
  dispatch: string
  turns: number
  tool: { name: string; target: string }   // the latest tool call
  at: string                               // when that call was made, ISO
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
  live: LiveActivity | null
  files: { spec: { path: string; line: number | null }; returns: string[] }
  card: NodeCard
}

export interface Spend {
  dispatches: number
  tokens: number
  usd: number         // the host's own figure
  unmeasured: number  // calls with no cost figure, or that never returned once their run ended
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
  cost: Spend & {
    by_model: Record<string, Spend>     // the whole effort's calls, per model
    per_leaf: Record<string, Spend>
    per_folder: Record<string, Spend>   // a folder's own calls and every call below it
  }
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
