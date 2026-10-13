import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readPresence } from '../server/presence.ts'
import type { ProcessCheck } from '../server/presence.ts'

describe('readPresence', () => {
  let dir: string | undefined
  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true })
  })

  const write = (files: Record<string, unknown>) => {
    dir = mkdtempSync(join(tmpdir(), 'presence-'))
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), typeof body === 'string' ? body : JSON.stringify(body))
    return dir
  }
  const pidFile = (pid: number, sessionId: string, status: string, at: number, extra: object = {}) => ({
    pid,
    sessionId,
    procStart: `start-${pid}`,
    status,
    statusUpdatedAt: at,
    ...extra,
  })
  const running = (...pids: number[]): ProcessCheck => records => records.map(r => pids.includes(r.pid) && r.procStart === `start-${r.pid}`)

  it('keeps only files whose process still runs, and passes on what a waiting session waits for', () => {
    const d = write({
      '1.json': pidFile(1, 'a', 'waiting', 10, { waitingFor: 'permission prompt' }),
      '2.json': pidFile(2, 'b', 'busy', 10),
      '3.json': pidFile(3, 'c', 'shell', 10),
    })
    const p = readPresence(d, running(1, 3))
    expect(p.get('a')).toMatchObject({ status: 'waiting', waitingFor: 'permission prompt' })
    expect(p.has('b')).toBe(false)
    expect(p.get('c')?.status).toBe('shell')
  })

  it('takes the newest status when two running processes hold one session', () => {
    const d = write({ '1.json': pidFile(1, 'a', 'idle', 20), '2.json': pidFile(2, 'a', 'busy', 10) })
    expect(readPresence(d, running(1, 2)).get('a')?.status).toBe('idle')
  })

  it('skips files it cannot read as a session record', () => {
    const d = write({ '1.json': '{"pid":', '2.json': pidFile(2, 'b', 'dreaming', 10), '3.key': 'x', '4.json': pidFile(4, 'd', 'busy', 10) })
    expect([...readPresence(d, running(1, 2, 4)).keys()]).toEqual(['d'])
  })

  it('finds nothing when the folder is missing', () => {
    expect(readPresence(join(tmpdir(), 'no-such-presence-dir'), running()).size).toBe(0)
  })
})
