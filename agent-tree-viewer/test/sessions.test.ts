import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { projectDirName } from '../server/runs.ts'
import { SessionIndex, groupSessions, pickTitle, readHints } from '../server/sessions.ts'
import type { SessionRow } from '../server/sessions.ts'

describe('the session list', () => {
  let dir: string
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('hangs the sessions an agentics run dispatched under the session that started it, and keeps those of a run that names none', () => {
    dir = mkdtempSync(join(tmpdir(), 'atv-list-'))
    const repo = join(dir, 'repo')
    const projects = join(dir, 'projects')
    const now = Date.now()
    const session = (id: string, ageS: number) => {
      const file = join(projects, projectDirName(repo), `${id}.jsonl`)
      writeFileSync(file, JSON.stringify({ type: 'user', cwd: repo, message: { content: `prompt ${id}` } }) + '\n')
      utimesSync(file, (now - ageS * 1000) / 1000, (now - ageS * 1000) / 1000)
    }
    const run = (name: string, meta: object, sessions: string[]) => {
      const home = join(repo, '.agentics', '.state', 'runs', name)
      mkdirSync(home, { recursive: true })
      writeFileSync(join(home, 'run.json'), JSON.stringify({ run: name, program: 'survey', started_at: new Date(now).toISOString(), heartbeat_at: new Date(now).toISOString(), ...meta }))
      writeFileSync(join(home, 'state.jsonl'), sessions.map(s => JSON.stringify({ kind: 'dispatched', session: s, role: 'analyst', thread: s, cwd: repo }) + '\n').join(''))
    }
    mkdirSync(join(projects, projectDirName(repo)), { recursive: true })
    const [parent, child, child2, orphan, plain] = [1, 2, 3, 4, 5].map(n => `aaaaaaaa-0000-0000-0000-00000000000${n}`) as [string, string, string, string, string]
    // The parent went quiet a minute ago; its run's first session wrote 5 seconds ago.
    session(parent, 60)
    session(child, 5)
    session(child2, 30)
    session(orphan, 40)
    session(plain, 50)
    run('r1', { session: parent }, [child, child2])
    run('old', {}, [orphan])

    const index = new SessionIndex({ projectsDir: projects, desktopDir: join(dir, 'none'), maxAgeMs: 3_600_000, presence: () => new Map() })
    const listed = index.list(now).flatMap(g => g.sessions)
    expect(listed.map(s => s.id).sort()).toEqual([parent, orphan, plain].sort())
    const top = listed.find(s => s.id === parent)
    expect(top?.runs).toEqual([{ node: 'run:r1', run: 'r1', program: 'survey', agents: 2 }])
    expect(top?.lastAt).toBeGreaterThan(now - 6000)
    const known = index.known()
    expect(known.parents.get(child)).toBe(parent)
    expect(known.parents.get(orphan)).toBeUndefined()
    expect(known.rows.get(child)).toBeUndefined()
  })
})

describe('pickTitle', () => {
  it('prefers the desktop title, then a given title, the agent name, the AI title, the first prompt', () => {
    const all = { desktop: 'D', custom: 'C', agentName: 'N', ai: 'A', prompt: 'P' }
    const order = ['desktop', 'custom', 'agentName', 'ai', 'prompt'] as const
    order.forEach((key, i) => {
      const rest = Object.fromEntries(order.slice(i).map(k => [k, all[k]]))
      expect(pickTitle({ ...rest, ...(i > 0 ? { [order[i - 1]!]: '  ' } : {}) })).toBe(all[key])
    })
    expect(pickTitle({})).toBe('Untitled session')
  })
})

describe('readHints', () => {
  it('keeps the latest title and the first prompt a person typed', () => {
    const hints = readHints([
      { type: 'user', cwd: 'C:\\work\\a', isMeta: true, message: { content: 'meta note' } },
      { type: 'user', cwd: 'C:\\work\\b', message: { content: '<command-name>/x</command-name>' } },
      { type: 'user', message: { content: [{ type: 'text', text: 'Fix   the\nbug' }] } },
      { type: 'custom-title', customTitle: 'Old' },
      { type: 'user', message: { content: 'later prompt' } },
      { type: 'custom-title', customTitle: 'New' },
      { type: 'ai-title', aiTitle: 'AI' },
    ])
    expect(hints).toMatchObject({ cwd: 'C:\\work\\a', prompt: 'Fix the bug', custom: 'New', ai: 'AI' })
  })
})

describe('groupSessions', () => {
  const row = (id: string, path: string, lastAt: number): SessionRow => ({ id, path, lastAt, title: id, live: false })

  it('puts one folder written two ways in one group, newest session and group first', () => {
    const groups = groupSessions([row('a', 'C:\\work\\x', 1), row('b', 'C:/work/x/', 5), row('c', 'C:\\work\\y', 3)])
    expect(groups.map(g => [g.name, g.sessions.map(s => s.id)])).toEqual([
      ['x', ['b', 'a']],
      ['y', ['c']],
    ])
  })

  it('tells apart two folders of the same name by their parent folder', () => {
    const names = groupSessions([row('a', 'C:\\one\\app', 2), row('b', 'D:\\two\\app', 1)]).map(g => g.name)
    expect(names).toEqual(['app (one)', 'app (two)'])
  })
})
