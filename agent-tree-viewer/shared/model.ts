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

// A card of the tree: a subagent inside the session's process, an agentics run (a Node program,
// not a model, so it makes no tool calls of its own), or a headless session that run dispatched.
export type AgentNode = NodeBase & (SubagentNode | RunNode | DispatchedNode)

export type SubagentNode = { kind: 'subagent' }

export type RunNode = {
  kind: 'run'
  program: string
  run: string
  // The program's last sign of life; a live run beats every few seconds.
  heartbeatAt: number
  pid?: number
}

export type DispatchedNode = {
  kind: 'dispatched'
  role: string
  thread: string
  // The plan node the dispatch works on; empty for a dispatch outside any node.
  node: string
  model: string
  effort: string
}

type NodeBase = {
  id: string
  // Absent for an agent the session's main loop spawned.
  parentId?: string
  // The tool call that spawned it, when one did; a Workflow's agents have none of their own.
  callId?: string
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
  // `live` and `waitingFor` as the session's own process reports them, the same as its SessionSummary.
  main: { toolCount: number; activity: ToolEvent[]; live: boolean; waitingFor?: string }
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
  // A running Claude Code process works on the session, or waits on the person.
  live: boolean
  // What it waits on: a permission prompt, an MCP input, an open dialog.
  waitingFor?: string
  // The agentics runs it started, newest first. The sessions they dispatched are not listed apart.
  runs?: RunLine[]
}

export type RunLine = {
  // The run's card in the session's tree.
  node: string
  run: string
  program: string
  // Sessions the run dispatched.
  agents: number
}

export type ProjectGroup = Project & { sessions: SessionSummary[] }

// One tool call for the details pane: its input and what it returned. In a node's detail both are
// cut short, with `clipped` set; the call's own address gives them whole.
export type CallDetail = ToolEvent & { input: InputField[]; output?: string; clipped?: boolean }

// One field of a call's input, named as a person reads it: `command`, `file path`, `old string`.
export type InputField = { name: string; text: string }

// One step of a transcript, in the order it happened.
export type Step =
  // What a person or a spawning agent asked.
  | { kind: 'prompt'; at: number; text: string }
  // What the model wrote.
  | { kind: 'words'; at: number; text: string }
  // `text` is empty when the transcript keeps the thinking hidden, which it mostly does.
  | { kind: 'thought'; at: number; text: string }
  // A subagent's SubagentHandback message.
  | { kind: 'handback'; at: number; text: string }
  | { kind: 'call'; at: number; call: CallDetail }

// Everything one card's transcript says, for the details pane. `id` is an agent id or 'main'.
export type NodeDetail = {
  id: string
  // Oldest first.
  steps: Step[]
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
