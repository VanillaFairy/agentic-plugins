export const FORMAT = 1

export type Approval = 'none' | 'approved' | 'prepared' | 'edited'

export interface SnapshotEvent {
  kind: string
  seq: number
  reason?: string
  detail?: string
  return?: string
  question?: string
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
  parent: string | null           // null only for the root '.'
  kind: string                    // 'design' | 'composite' | 'leaf', passed through
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
  files: { spec: { path: string; line: number | null }; briefs: string[]; reports: string[] }
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
  cost: {
    dispatches: number
    tokens: number
    tokens_unreported: number
    per_leaf: Record<string, { dispatches: number; tokens: number; tokens_unreported: number }>
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
