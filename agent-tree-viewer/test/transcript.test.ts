import { describe, expect, it } from 'vitest'
import { buildSnapshot, emptyFacts, ingest, nodeDetail, toolName } from '../server/transcript.ts'
import type { AgentMeta, AgentSource, FileFacts } from '../server/transcript.ts'

const T0 = Date.parse('2026-10-09T10:00:00.000Z')
const at = (s: number) => new Date(T0 + s * 1000).toISOString()

const call = (s: number, id: string, name = 'Agent', input: object = {}) => ({
  type: 'assistant',
  timestamp: at(s),
  message: { content: [{ type: 'tool_use', id, name, input }] },
})
const result = (s: number, id: string, text = 'ok', isError = false) => ({
  type: 'user',
  timestamp: at(s),
  message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content: [{ type: 'text', text }] }] },
})
const said = (s: number, stop = 'tool_use') => ({ type: 'assistant', timestamp: at(s), message: { stop_reason: stop, content: [{ type: 'text', text: 'hi' }] } })
const notification = (s: number, id: string, status: string) => ({
  type: 'queue-operation',
  operation: 'enqueue',
  timestamp: at(s),
  content: `<task-notification>\n<task-id>${id}</task-id>\n<status>${status}</status>\n</task-notification>`,
})
const launched = 'Async agent launched successfully.\nagentId: x'

function facts(...entries: object[]): FileFacts {
  const f = emptyFacts()
  for (const e of entries) ingest(f, e)
  return f
}

function agent(id: string, meta: AgentMeta, ...entries: object[]): AgentSource {
  const f = facts(...entries)
  return { id, meta, facts: f, mtime: f.lastAt ?? T0 }
}

function snap(main: FileFacts, agents: AgentSource[], nowS = 60, staleS = 600) {
  return buildSnapshot({ id: 's', title: 't', project: { path: 'p', name: 'p' }, main, agents, now: T0 + nowS * 1000, staleMs: staleS * 1000 })
}

describe('parents', () => {
  it('hangs an agent under whoever made the call that spawned it', () => {
    const main = facts(call(0, 'spawnA'), result(1, 'spawnA', launched))
    const a = agent('A', { toolUseId: 'spawnA' }, said(1), call(2, 'spawnB'))
    const b = agent('B', { toolUseId: 'spawnB' }, said(3))
    const tree = snap(main, [a, b])
    expect(tree.agents.A?.parentId).toBeUndefined()
    expect(tree.agents.B?.parentId).toBe('A')
  })

  it('hangs a workflow agent under the call whose result names its run', () => {
    const main = facts(said(0))
    const a = agent('A', { toolUseId: 'spawnA' }, call(1, 'wf'), result(2, 'wf', 'Started.\nRun ID: wf_abc-12\nMore'))
    const w = agent('W', { workflow: 'wf_abc-12' }, said(3))
    expect(snap(main, [a, w]).agents.W?.parentId).toBe('A')
  })
})

describe('status', () => {
  const main = (...extra: object[]) => facts(call(0, 'spawnA'), result(1, 'spawnA', launched), ...extra)

  it('runs while a background agent is busy and nothing says it ended', () => {
    const tree = snap(main(), [agent('A', { toolUseId: 'spawnA' }, said(1), call(30, 'x', 'Bash'))])
    expect(tree.agents.A?.status).toBe('running')
    expect(tree.agents.A?.endedAt).toBeUndefined()
  })

  it('ends a background agent the way its notification says', () => {
    for (const [word, status] of [['completed', 'completed'], ['failed', 'failed'], ['killed', 'killed']] as const) {
      const tree = snap(main(notification(20, 'A', word)), [agent('A', { toolUseId: 'spawnA' }, said(1), call(19, 'x', 'Bash'))])
      expect(tree.agents.A?.status).toBe(status)
      expect(tree.agents.A?.endedAt).toBe(T0 + 20_000)
    }
  })

  it('runs again once a finished agent is sent more work', () => {
    const tree = snap(main(notification(20, 'A', 'completed')), [agent('A', { toolUseId: 'spawnA' }, said(1), result(40, 'resume'), call(41, 'y', 'Read'))])
    expect(tree.agents.A?.status).toBe('running')
  })

  it('ignores a notification that only appears quoted inside a tool result', () => {
    const quoted = notification(20, 'A', 'completed').content
    const tree = snap(main(call(19, 'grep', 'Bash'), result(20, 'grep', quoted)), [agent('A', { toolUseId: 'spawnA' }, said(1), call(30, 'x', 'Bash'))])
    expect(tree.agents.A?.status).toBe('running')
  })

  it('ends a foreground agent with the result of the call that spawned it', () => {
    const ok = snap(facts(call(0, 'spawnA'), result(9, 'spawnA', 'report')), [agent('A', { toolUseId: 'spawnA' }, call(1, 'x', 'Bash'))])
    expect(ok.agents.A).toMatchObject({ status: 'completed', endedAt: T0 + 9000 })
    const bad = snap(facts(call(0, 'spawnA'), result(9, 'spawnA', 'boom', true)), [agent('A', { toolUseId: 'spawnA' }, call(1, 'x', 'Bash'))])
    expect(bad.agents.A?.status).toBe('failed')
  })

  it('counts an agent whose last turn ended with nothing asked of a tool as done', () => {
    const tree = snap(facts(said(0)), [agent('W', { workflow: 'wf_x' }, call(1, 'x', 'Bash'), result(2, 'x'), said(3, 'end_turn'))])
    expect(tree.agents.W).toMatchObject({ status: 'completed', endedAt: T0 + 3000 })
  })

  it('takes an agent silent for longer than the stale limit as stopped', () => {
    const quiet = agent('A', { toolUseId: 'spawnA' }, said(1), call(2, 'x', 'Bash'))
    expect(snap(main(), [quiet], 100, 60).agents.A).toMatchObject({ status: 'killed', endedAt: T0 + 2000 })
    expect(snap(main(), [quiet], 30, 60).agents.A?.status).toBe('running')
  })
})

describe('activity', () => {
  it('marks each call ended when its result arrives, and an error result as an error', () => {
    const f = facts(call(0, 'a', 'Read', { file_path: 'C:/x.ts' }), call(1, 'b', 'Bash', { command: 'ls  -la' }), result(2, 'a'), result(3, 'b', 'no', true), call(4, 'c', 'Grep'))
    expect(f.calls.map(c => [c.tool, c.arg, c.endedAt !== undefined, c.isError === true])).toEqual([
      ['Read', 'C:/x.ts', true, false],
      ['Bash', 'ls -la', true, true],
      ['Grep', '', false, false],
    ])
  })

  it('names an MCP tool by its own name, without the server prefix', () => {
    expect(toolName('mcp__Claude_Browser__browser_batch')).toBe('browser_batch')
    expect(toolName('Read')).toBe('Read')
  })

  it('keeps only the latest calls but counts them all', () => {
    const many = Array.from({ length: 40 }, (_, i) => call(i, `c${i}`, 'Read'))
    const tree = snap(facts(...many), [])
    expect(tree.main.toolCount).toBe(40)
    expect(tree.main.activity.at(-1)?.id).toBe('c39')
    expect(tree.main.activity.length).toBeLessThan(40)
  })
})

describe('nodeDetail', () => {
  it('gives the prompt, the handback as the report, and every call newest first with its output', () => {
    const f = facts(
      { type: 'user', timestamp: at(0), message: { content: 'Find the clock' } },
      call(1, 'a', 'Grep', { pattern: 'now(' }),
      result(2, 'a', 'src/clock.ts:3'),
      { type: 'assistant', timestamp: at(3), message: { content: [{ type: 'text', text: 'thinking aloud' }] } },
      call(4, 'h', 'SubagentHandback', { message: 'It is in src/clock.ts' }),
    )
    const d = nodeDetail('A', f)
    expect(d).toMatchObject({ id: 'A', prompt: 'Find the clock', report: 'It is in src/clock.ts' })
    expect(d.calls.map(c => c.id)).toEqual(['h', 'a'])
    expect(d.calls[1]).toMatchObject({ output: 'src/clock.ts:3' })
    expect(JSON.parse(d.calls[1]!.input)).toEqual({ pattern: 'now(' })
  })

  it('falls back to the latest text the model wrote when there is no handback', () => {
    const f = facts({ type: 'assistant', timestamp: at(0), message: { content: [{ type: 'text', text: 'first' }] } }, { type: 'assistant', timestamp: at(1), message: { content: [{ type: 'text', text: 'second' }] } })
    expect(nodeDetail('main', f).report).toBe('second')
  })
})
