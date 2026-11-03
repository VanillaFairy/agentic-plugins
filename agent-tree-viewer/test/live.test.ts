import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SessionWatch } from '../server/live.ts'

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
