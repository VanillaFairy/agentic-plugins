import { describe, expect, it } from 'vitest'
import { buildSnapshot, emptyFacts, fullCall, ingest, inputFields, nodeDetail, toolName } from '../server/transcript.ts'
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

function snap(main: FileFacts, agents: AgentSource[], nowS = 60, staleS = 600, presence: { live: boolean; waitingFor?: string } = { live: false }) {
  return buildSnapshot({ id: 's', title: 't', project: { path: 'p', name: 'p' }, main, agents, presence, now: T0 + nowS * 1000, staleMs: staleS * 1000 })
}

describe('the main loop', () => {
  it('is live, or waits on the person, as the session’s process says', () => {
    const main = facts(said(0, 'end_turn'))
    expect(snap(main, [], 60, 600, { live: true, waitingFor: 'permission' }).main).toMatchObject({ live: true, waitingFor: 'permission' })
    expect(snap(main, []).main.live).toBe(false)
  })
})

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
  it('tells the steps in the order they happened, each call with its output', () => {
    const f = facts(
      { type: 'user', timestamp: at(0), message: { content: 'Find the clock' } },
      { type: 'assistant', timestamp: at(1), message: { content: [{ type: 'thinking', thinking: '', signature: 'x' }] } },
      call(2, 'a', 'Grep', { pattern: 'now(' }),
      result(3, 'a', 'src/clock.ts:3'),
      { type: 'assistant', timestamp: at(4), message: { content: [{ type: 'text', text: 'It is in one place.' }] } },
      call(5, 'h', 'SubagentHandback', { message: 'It is in src/clock.ts' }),
    )
    const d = nodeDetail('A', f)
    expect(d.steps.map(s => s.kind)).toEqual(['prompt', 'thought', 'call', 'words', 'handback'])
    expect(d.steps[0]).toMatchObject({ text: 'Find the clock' })
    expect(d.steps[1]).toMatchObject({ text: '' })
    const grep = d.steps[2]
    expect(grep?.kind === 'call' && grep.call).toMatchObject({ tool: 'Grep', output: 'src/clock.ts:3', endedAt: T0 + 3000 })
    expect(d.steps[4]).toMatchObject({ text: 'It is in src/clock.ts' })
  })

  it('cuts a long output short in the stream, marks it, and gives it whole by its call', () => {
    const long = 'x'.repeat(100_000)
    const f = facts(call(0, 'a', 'Bash', { command: 'ls' }), result(1, 'a', long), call(2, 'b', 'Bash', { command: 'pwd' }), result(3, 'b', 'short'))
    const [cut, small] = nodeDetail('A', f).steps.map(s => (s.kind === 'call' ? s.call : undefined))
    expect(cut?.clipped).toBe(true)
    expect(cut?.output?.length).toBeLessThan(long.length)
    expect(small?.clipped).toBeUndefined()
    expect(fullCall(f, 'a')?.output).toBe(long)
  })

  it('keeps every prompt of the main loop, not only the first', () => {
    const f = facts({ type: 'user', timestamp: at(0), message: { content: 'one' } }, said(1, 'end_turn'), { type: 'user', timestamp: at(2), message: { content: 'two' } })
    expect(nodeDetail('main', f).steps.filter(s => s.kind === 'prompt').map(s => s.kind === 'prompt' && s.text)).toEqual(['one', 'two'])
  })
})

describe('inputFields', () => {
  it('gives a shell call its command alone, as written', () => {
    const command = 'npm test\n  && echo "done"'
    expect(inputFields({ command, description: 'Run the tests', timeout: 60000 })).toEqual([{ name: 'command', text: command }])
  })

  it('names every other field and keeps its text as written', () => {
    const old = 'one\n"two"'
    const fields = inputFields({ file_path: 'a.ts', old_string: old, new_string: 'three', replace_all: false })
    expect(fields).toContainEqual({ name: 'old string', text: old })
    expect(fields).toContainEqual({ name: 'replace all', text: 'false' })
  })
})

describe('the plan', () => {
  const FILE = 'C:\plans\a.md'
  const entered = (s: number) => ({ type: 'attachment', timestamp: at(s), attachment: { type: 'plan_mode', planFilePath: FILE } })
  const left = (s: number) => ({ type: 'attachment', timestamp: at(s), attachment: { type: 'plan_mode_exit', planFilePath: FILE } })
  const written = (s: number, content: string) => call(s, `w${s}`, 'Write', { file_path: FILE, content })
  const asked = (s: number, plan: string) => call(s, `x${s}`, 'ExitPlanMode', { plan, planFilePath: FILE })
  const answered = (s: number, asking: number, edited?: string) => ({ ...result(s, `x${asking}`, 'User has approved your plan.'), toolUseResult: edited === undefined ? {} : { plan: edited } })

  it('is absent from a transcript that never entered plan mode', () => {
    expect(facts(said(0), written(1, 'not a plan')).plan).toBeUndefined()
  })

  it('is drafted in its file, then awaits approval with the text it was sent with', () => {
    const f = facts(entered(0), written(1, '# Draft'))
    expect(f.plan).toMatchObject({ state: 'drafting', text: '# Draft', file: FILE })
    ingest(f, asked(2, '# Sent'))
    expect(f.plan).toMatchObject({ state: 'awaiting', text: '# Sent' })
  })

  it('takes the text the person approved, edits made in the dialog included', () => {
    const f = facts(entered(0), asked(1, '# Sent'), answered(2, 1, '# Edited'), left(2))
    expect(f.plan).toMatchObject({ state: 'approved', text: '# Edited', at: T0 + 2000 })
  })

  it('goes back to drafting after a rejection, keeping its text', () => {
    const f = facts(entered(0), asked(1, '# Sent'), result(2, 'x1', 'The user doesn’t want to proceed', true))
    expect(f.plan?.state).toBe('rejected')
    ingest(f, entered(3))
    expect(f.plan).toMatchObject({ state: 'drafting', text: '# Sent' })
  })

  it('is exited when plan mode ends without an approval', () => {
    expect(facts(entered(0), written(1, '# Draft'), left(2)).plan?.state).toBe('exited')
  })

  it('applies edits to the file, new text taken as written', () => {
    const f = facts(entered(0), written(1, 'one two one'), call(2, 'e', 'Edit', { file_path: FILE, old_string: 'one', new_string: '$&!' }))
    expect(f.plan?.text).toBe('$&! two one')
    ingest(f, call(3, 'e2', 'Edit', { file_path: FILE, old_string: 'one', new_string: '1', replace_all: true }))
    expect(f.plan?.text).toBe('$&! two 1')
  })

  it('starts afresh when plan mode is entered again after an approval', () => {
    const f = facts(entered(0), asked(1, '# First'), answered(2, 1), left(2), entered(10))
    expect(f.plan).toMatchObject({ state: 'drafting', text: '' })
  })

  it('reaches the node’s details', () => {
    expect(nodeDetail('main', facts(entered(0), written(1, '# Draft'))).plan?.text).toBe('# Draft')
  })
})

describe('the checklist', () => {
  const PLAN = 'mcp__ccd_turn__update_plan'
  let n = 0
  // A checklist call and the app's answer to it.
  const change = (s: number, input: object, name = PLAN, refused = false) => {
    const id = `c${n++}`
    return [call(s, id, name, input), result(s, id, 'ok', refused)]
  }
  const items = (...statuses: string[]) => ({ items: statuses.map((status, i) => ({ content: `step ${i + 1}`, status })), scope: 'first_task' })
  const statuses = (f: FileFacts) => f.checklist?.steps.map(s => s.status)

  it('is the list the latest items call gave', () => {
    const f = facts(...change(0, items('in_progress', 'pending')), ...change(1, items('completed', 'in_progress', 'pending')))
    expect(f.checklist?.steps.map(s => s.text)).toEqual(['step 1', 'step 2', 'step 3'])
    expect(statuses(f)).toEqual(['completed', 'in_progress', 'pending'])
  })

  it('advances to the next pending step, and past the last one to every step done', () => {
    const f = facts(...change(0, items('in_progress', 'pending')), ...change(1, { advance: true }))
    expect(statuses(f)).toEqual(['completed', 'in_progress'])
    for (const e of change(2, { advance: true })) ingest(f, e)
    expect(statuses(f)).toEqual(['completed', 'completed'])
  })

  it('completes and starts steps by number, leaving another in progress as it is', () => {
    const f = facts(...change(0, items('in_progress', 'pending', 'pending', 'pending')), ...change(1, { done: [2, 3], start: 4 }))
    expect(statuses(f)).toEqual(['in_progress', 'completed', 'completed', 'in_progress'])
  })

  it('is left as it stands by wrap_up', () => {
    const f = facts(...change(0, items('completed', 'in_progress', 'pending')), ...change(1, { recap: 'r' }, 'mcp__ccd_turn__wrap_up'))
    expect(statuses(f)).toEqual(['completed', 'in_progress', 'pending'])
  })

  it('ignores a call the app refused', () => {
    const f = facts(...change(0, items('in_progress', 'pending')), ...change(1, { advance: true }, PLAN, true))
    expect(statuses(f)).toEqual(['in_progress', 'pending'])
  })

  it('reaches the node’s details', () => {
    expect(nodeDetail('main', facts(...change(0, items('in_progress')))).checklist?.steps).toEqual([{ text: 'step 1', status: 'in_progress' }])
  })
})
