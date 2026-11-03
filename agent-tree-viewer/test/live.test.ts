import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SessionWatch, readTasks } from '../server/live.ts'

describe('a session’s task list', () => {
  let home: string
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'tasks-'))
  })
  afterEach(() => rmSync(home, { recursive: true, force: true }))

  const task = (n: number, subject: string, status: string, extra: object = {}) => {
    const dir = join(home, 'tasks', 's')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${n}.json`), JSON.stringify({ id: String(n), subject, description: 'd', status, blocks: [], blockedBy: [], ...extra }))
  }

  it('lists the tasks in the order they were made', () => {
    task(10, 'tenth', 'pending')
    task(2, 'second', 'in_progress', { activeForm: 'Doing the second' })
    task(1, 'first', 'completed')
    expect(readTasks(join(home, 'projects'), 's')).toEqual([
      { id: '1', subject: 'first', status: 'completed' },
      { id: '2', subject: 'second', status: 'in_progress', activeForm: 'Doing the second' },
      { id: '10', subject: 'tenth', status: 'pending' },
    ])
  })

  it('skips a file still being written', () => {
    task(1, 'first', 'pending')
    writeFileSync(join(home, 'tasks', 's', '2.json'), '{"id": "2", "subj')
    expect(readTasks(join(home, 'projects'), 's').map(t => t.id)).toEqual(['1'])
  })

  it('is empty for a session that made no tasks', () => {
    expect(readTasks(join(home, 'projects'), 'none')).toEqual([])
  })
})

describe('a session’s plan', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'live-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const transcript = (planFile: string) => {
    const main = join(dir, 's.jsonl')
    const entries = [
      { type: 'attachment', timestamp: '2026-10-09T10:00:00.000Z', attachment: { type: 'plan_mode', planFilePath: planFile } },
      { type: 'assistant', timestamp: '2026-10-09T10:00:01.000Z', message: { content: [{ type: 'tool_use', id: 'x', name: 'ExitPlanMode', input: { plan: '# Sent', planFilePath: planFile } }] } },
    ]
    writeFileSync(main, entries.map(e => JSON.stringify(e)).join('\n') + '\n')
    return new SessionWatch({ id: 's', main, dir: join(dir, 's') }, 60000, dir)
  }

  it('reads the plan file, which holds edits made after the plan was sent', () => {
    const file = join(dir, 'plan.md')
    writeFileSync(file, '# Edited later')
    expect(transcript(file).detail('main')?.plan).toMatchObject({ text: '# Edited later', fromFile: true })
  })

  it('falls back to the transcript’s copy once the file is gone', () => {
    expect(transcript(join(dir, 'gone.md')).detail('main')?.plan).toMatchObject({ text: '# Sent', fromFile: false })
  })
})
