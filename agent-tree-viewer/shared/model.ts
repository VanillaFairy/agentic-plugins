// What the server sends the page: the session picker's tree, and one session's live agent tree.

export type AgentStatus = 'running' | 'completed' | 'failed' | 'killed'

export type ToolEvent = {
  id: string
  tool: string
  arg: string
  startedAt: number
  endedAt?: number
  isError?: boolean
}

export type AgentNode = {
  id: string
  // Absent for an agent the session's main loop spawned.
  parentId?: string
  type: string
  description: string
  status: AgentStatus
  startedAt: number
  endedAt?: number
  toolCount: number
  // Newest last, at most the last few calls.
  activity: ToolEvent[]
}

export type SessionSnapshot = {
  id: string
  title: string
  project: Project
  // The server's clock when it built the snapshot, so the page can count run times on its own.
  now: number
  main: { toolCount: number; activity: ToolEvent[] }
  agents: Record<string, AgentNode>
}

export type Project = {
  // The folder the session runs in.
  path: string
  // Its folder name, as Claude shows it.
  name: string
}

export type SessionSummary = {
  id: string
  title: string
  lastAt: number
  // Something in the session wrote to its transcript in the last couple of minutes.
  live: boolean
}

export type ProjectGroup = Project & { sessions: SessionSummary[] }

// One tool call in full, for the details pane: its whole input, and the start of what it returned.
export type CallDetail = ToolEvent & { input: string; output?: string }

// Everything one card's transcript says, for the details pane. `id` is an agent id or 'main'.
export type NodeDetail = {
  id: string
  // What the agent was asked to do; for the main loop, the session's first prompt.
  prompt?: string
  // The agent's report back, or the latest thing the main loop said.
  report?: string
  // Every tool call, newest first.
  calls: CallDetail[]
  // Tokens this transcript spent, one row per model and speed, costliest first.
  usage: ModelUsage[]
  // For the main loop only: the whole session, every agent included.
  sessionUsage?: ModelUsage[]
}

export type ModelUsage = {
  model: string
  fast: boolean
  // API calls made.
  messages: number
  // Input tokens read without the cache.
  input: number
  output: number
  cacheWrite5m: number
  cacheWrite1h: number
  cacheRead: number
  // Estimated dollars at list prices; absent for a model with no known price.
  cost?: number
}
