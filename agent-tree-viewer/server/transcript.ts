// Turns a session's transcript entries into its agent tree. Pure: the files are read elsewhere.
//
// A session keeps its main transcript in `<session>.jsonl` and every subagent's in
// `<session>/subagents/agent-<id>.jsonl`, with `agent-<id>.meta.json` beside it naming the
// agent's type, description and the tool call that spawned it. That call sits in the
// transcript of whoever spawned the agent, which is how the tree finds a parent.

import type { AgentNode, AgentStatus, CallDetail, ModelUsage, NodeDetail, Project, SessionSnapshot, ToolEvent } from '../shared/model.ts'
import { estimateCost } from './pricing.ts'

const KEEP = 24
// How much of a call's input and output the details pane gets, and of a prompt or report.
const INPUT_CHARS = 4000
const OUTPUT_CHARS = 1500
const TEXT_CHARS = 40000
const ARG_KEYS = ['file_path', 'notebook_path', 'path', 'command', 'pattern', 'url', 'query', 'skill', 'description', 'prompt']
// A background agent's spawning call returns at once with this; it does not mean the agent ended.
const ASYNC_LAUNCH = /^Async agent launched/
// A transcript entry this soon after an agent's notification still belongs to the run that ended.
const RESUME_SLACK_MS = 5000
const NOTIFICATION = /<task-id>([^<]+)<\/task-id>[\s\S]*?<status>([^<]+)<\/status>/g
// A Workflow call's result names its run; the run's agents keep their transcripts in a folder of that name.
const WORKFLOW_RUN = /Run ID: (wf_[\w-]+)/g

type Result = { at: number; isError: boolean; async: boolean }

// What one transcript file says, folded entry by entry.
export type FileFacts = {
  firstAt?: number
  lastAt?: number
  // Every tool call in the order it was made; `endedAt` is set once its result is in.
  calls: CallDetail[]
  // The first thing a person or a spawning agent asked of this transcript.
  prompt?: string
  // A subagent's SubagentHandback message, else the latest text the model wrote.
  handback?: string
  lastText?: string
  results: Map<string, Result>
  // The latest notification heard for each background agent, by agent id.
  notes: Map<string, { status: string; at: number }>
  // The Workflow call that started each run, by run id.
  runs: Map<string, string>
  // The last turn ended with nothing asked of a tool, and nothing came after it.
  idle: boolean
  // Token usage by API message id. Claude Code writes one entry per content block of a
  // response, each carrying the whole response's usage, so the id keeps it counted once.
  usage: Map<string, MessageUsage>
}

type MessageUsage = Omit<ModelUsage, 'messages' | 'cost'>

export function emptyFacts(): FileFacts {
  return { calls: [], results: new Map(), notes: new Map(), runs: new Map(), idle: false, usage: new Map() }
}

// The one argument that says what a call is about: the file it touches, the command it runs,
// what it searches for.
export function argSummary(input: unknown): string {
  if (typeof input !== 'object' || input === null) return ''
  for (const key of ARG_KEYS) {
    const value = (input as Record<string, unknown>)[key]
    if (typeof value === 'string' && value.trim() !== '') return value.replace(/\s+/g, ' ').trim().slice(0, 160)
  }
  return ''
}

// An MCP tool's name without its `mcp__<server>__` prefix, which is long and the same for every
// tool of that server.
export function toolName(name: string): string {
  return name.startsWith('mcp__') ? (name.split('__').pop() ?? name) : name
}

const record = (v: unknown): Record<string, unknown> | undefined =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map(part => (typeof record(part)?.text === 'string' ? (record(part)?.text as string) : '')).join('')
}

const clipText = (text: string, max: number) => (text.length > max ? text.slice(0, max) + '…' : text)

function inputText(input: unknown): string {
  if (input === undefined) return ''
  try {
    return clipText(JSON.stringify(input, null, 2), INPUT_CHARS)
  } catch {
    return ''
  }
}

// A prompt is a user turn with words in it, not a tool result, a harness note or a meta entry.
function promptOf(entry: Record<string, unknown>, content: unknown): string | undefined {
  if (entry.type !== 'user' || entry.isMeta === true) return undefined
  const text = typeof content === 'string' ? content : Array.isArray(content) && content.every(p => record(p)?.type === 'text') ? textOf(content) : ''
  return text.trim() === '' || text.trimStart().startsWith('<') ? undefined : clipText(text.trim(), TEXT_CHARS)
}

const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

function usageOf(message: Record<string, unknown> | undefined): MessageUsage | undefined {
  const u = record(message?.usage)
  const model = message?.model
  // `<synthetic>` marks a message Claude Code wrote itself, which no model produced.
  if (u === undefined || typeof model !== 'string' || model.startsWith('<')) return undefined
  const written = count(u.cache_creation_input_tokens)
  const byTtl = record(u.cache_creation)
  const hour = count(byTtl?.ephemeral_1h_input_tokens)
  return {
    model,
    fast: u.speed === 'fast',
    input: count(u.input_tokens),
    output: count(u.output_tokens),
    // Without the breakdown, every write is taken as the default 5-minute kind.
    cacheWrite5m: byTtl === undefined ? written : count(byTtl.ephemeral_5m_input_tokens),
    cacheWrite1h: hour,
    cacheRead: count(u.cache_read_input_tokens),
  }
}

// One row per model and speed, costliest first.
export function sumUsage(all: readonly FileFacts[]): ModelUsage[] {
  const rows = new Map<string, ModelUsage>()
  for (const facts of all) {
    for (const u of facts.usage.values()) {
      const key = `${u.model}|${u.fast}`
      const row = rows.get(key) ?? { model: u.model, fast: u.fast, messages: 0, input: 0, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0 }
      row.messages += 1
      row.input += u.input
      row.output += u.output
      row.cacheWrite5m += u.cacheWrite5m
      row.cacheWrite1h += u.cacheWrite1h
      row.cacheRead += u.cacheRead
      rows.set(key, row)
    }
  }
  return [...rows.values()]
    .map(row => {
      const cost = estimateCost(row)
      return cost === undefined ? row : { ...row, cost }
    })
    .sort((a, b) => (b.cost ?? -1) - (a.cost ?? -1))
}

function hearNotifications(facts: FileFacts, text: string, at: number): void {
  for (const [, id, status] of text.matchAll(NOTIFICATION)) {
    if (id === undefined || status === undefined) continue
    const old = facts.notes.get(id)
    if (old === undefined || old.at <= at) facts.notes.set(id, { status: status.trim(), at })
  }
}

// Notifications reach a transcript queued (`queue-operation`, a `queued_command` attachment) or
// as a user turn of their own. Only those carry them: a tool result that quotes one does not.
function notificationText(entry: Record<string, unknown>): string {
  if (entry.type === 'queue-operation' && entry.operation === 'enqueue') return typeof entry.content === 'string' ? entry.content : ''
  const attachment = record(entry.attachment)
  if (entry.type === 'attachment' && attachment?.type === 'queued_command') return typeof attachment.prompt === 'string' ? attachment.prompt : ''
  const content = record(entry.message)?.content
  if (entry.type === 'user' && typeof content === 'string' && content.trimStart().startsWith('<task-notification>')) return content
  return ''
}

export function ingest(facts: FileFacts, raw: unknown): void {
  const entry = record(raw)
  if (entry === undefined) return
  const at = typeof entry.timestamp === 'string' ? Date.parse(entry.timestamp) : NaN
  if (!Number.isFinite(at)) return
  facts.firstAt ??= at
  facts.lastAt = Math.max(facts.lastAt ?? at, at)

  const note = notificationText(entry)
  if (note !== '') hearNotifications(facts, note, at)

  const message = record(entry.message)
  if (entry.type === 'assistant') facts.idle = message?.stop_reason === 'end_turn'
  const usage = entry.type === 'assistant' ? usageOf(message) : undefined
  if (usage !== undefined && typeof message?.id === 'string') facts.usage.set(message.id, usage)
  else if (entry.type === 'user') facts.idle = false

  const content = message?.content
  facts.prompt ??= promptOf(entry, content)
  if (!Array.isArray(content)) return
  for (const item of content) {
    const part = record(item)
    if (part === undefined) continue
    if (entry.type === 'assistant' && part.type === 'text' && typeof part.text === 'string' && part.text.trim() !== '') {
      facts.lastText = clipText(part.text.trim(), TEXT_CHARS)
    } else if (entry.type === 'assistant' && part.type === 'tool_use' && typeof part.id === 'string') {
      const tool = toolName(String(part.name ?? 'tool'))
      const handback = record(part.input)?.message
      if (tool === 'SubagentHandback' && typeof handback === 'string') facts.handback = clipText(handback, TEXT_CHARS)
      facts.calls.push({ id: part.id, tool, arg: argSummary(part.input), startedAt: at, input: inputText(part.input) })
    } else if (entry.type === 'user' && part.type === 'tool_result' && typeof part.tool_use_id === 'string') {
      const isError = part.is_error === true
      const text = textOf(part.content)
      facts.results.set(part.tool_use_id, { at, isError, async: ASYNC_LAUNCH.test(text) })
      for (const [, run] of text.matchAll(WORKFLOW_RUN)) if (run !== undefined) facts.runs.set(run, part.tool_use_id)
      const call = facts.calls.findLast(c => c.id === part.tool_use_id)
      if (call !== undefined) {
        call.endedAt = at
        if (isError) call.isError = true
        if (text.trim() !== '') call.output = clipText(text.trim(), OUTPUT_CHARS)
      }
    }
  }
}

// `workflow` is the run an agent belongs to, for an agent a Workflow started.
export type AgentMeta = { agentType?: string; description?: string; toolUseId?: string; workflow?: string }

export type AgentSource = {
  id: string
  meta: AgentMeta
  facts: FileFacts
  // When its transcript file last changed.
  mtime: number
}

export type SessionSource = {
  id: string
  title: string
  project: Project
  main: FileFacts
  agents: AgentSource[]
  now: number
  // A running agent whose transcript stays silent this long is taken as stopped.
  staleMs: number
}

function noteStatus(status: string): AgentStatus {
  if (status === 'completed') return 'completed'
  if (status === 'failed' || status === 'error') return 'failed'
  return 'killed'
}

// The stream carries only the latest calls, and none of their inputs or outputs.
const recent = (calls: readonly CallDetail[]): ToolEvent[] =>
  calls.slice(-KEEP).map(({ input: _input, output: _output, ...call }) => ({ ...call }))

// `everyone` is every transcript of the session, given for the main loop so its details can
// also total the whole session.
export function nodeDetail(id: string, facts: FileFacts, everyone?: readonly FileFacts[]): NodeDetail {
  const report = facts.handback ?? facts.lastText
  return {
    id,
    ...(facts.prompt !== undefined ? { prompt: facts.prompt } : {}),
    ...(report !== undefined ? { report } : {}),
    calls: [...facts.calls].reverse().map(c => ({ ...c })),
    usage: sumUsage([facts]),
    ...(everyone !== undefined ? { sessionUsage: sumUsage(everyone) } : {}),
  }
}

export function buildSnapshot(s: SessionSource): SessionSnapshot {
  // Who made each tool call: 'main' or an agent id.
  const owner = new Map<string, { id: string; facts: FileFacts }>()
  for (const call of s.main.calls) owner.set(call.id, { id: 'main', facts: s.main })
  for (const agent of s.agents) for (const call of agent.facts.calls) owner.set(call.id, { id: agent.id, facts: agent.facts })
  const allFacts = [s.main, ...s.agents.map(a => a.facts)]
  const runCall = (run: string) => allFacts.map(f => f.runs.get(run)).find(id => id !== undefined)

  const agents: Record<string, AgentNode> = {}
  for (const agent of s.agents) {
    const callId = agent.meta.toolUseId ?? (agent.meta.workflow === undefined ? undefined : runCall(agent.meta.workflow))
    const spawnedBy = callId === undefined ? undefined : owner.get(callId)
    const spawn = spawnedBy?.facts.calls.find(c => c.id === callId)
    // A Workflow call ends with its whole run, not with one of its agents.
    const result = callId === undefined || agent.meta.workflow !== undefined ? undefined : spawnedBy?.facts.results.get(callId)
    const note = allFacts
      .map(f => f.notes.get(agent.id))
      .reduce<{ status: string; at: number } | undefined>((best, n) => (n !== undefined && (best === undefined || n.at > best.at) ? n : best), undefined)
    const lastAt = agent.facts.lastAt ?? spawn?.startedAt ?? agent.mtime

    let status: AgentStatus = 'running'
    let endedAt: number | undefined
    if (note !== undefined && lastAt <= note.at + RESUME_SLACK_MS) {
      status = noteStatus(note.status)
      endedAt = note.at
    } else if (result !== undefined && !result.async) {
      status = result.isError ? 'failed' : 'completed'
      endedAt = result.at
    } else if (agent.facts.idle) {
      status = 'completed'
      endedAt = lastAt
    } else if (s.now - Math.max(lastAt, agent.mtime) > s.staleMs) {
      status = 'killed'
      endedAt = lastAt
    }

    agents[agent.id] = {
      id: agent.id,
      ...(spawnedBy !== undefined && spawnedBy.id !== 'main' ? { parentId: spawnedBy.id } : {}),
      type: agent.meta.agentType ?? 'agent',
      description: agent.meta.description || agent.meta.agentType || 'agent',
      status,
      startedAt: agent.facts.firstAt ?? spawn?.startedAt ?? agent.mtime,
      ...(endedAt !== undefined ? { endedAt } : {}),
      toolCount: agent.facts.calls.length,
      activity: recent(agent.facts.calls),
    }
  }

  return {
    id: s.id,
    title: s.title,
    project: s.project,
    now: s.now,
    main: { toolCount: s.main.calls.length, activity: recent(s.main.calls) },
    agents,
  }
}
