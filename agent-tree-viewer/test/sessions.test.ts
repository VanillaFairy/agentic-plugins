import { describe, expect, it } from 'vitest'
import { groupSessions, pickTitle, readHints } from '../server/sessions.ts'
import type { SessionRow } from '../server/sessions.ts'

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
