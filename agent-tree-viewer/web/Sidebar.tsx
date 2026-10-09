import { useEffect, useState } from 'preact/hooks'
import type { ProjectGroup } from '../shared/model.ts'
import { ago } from './time.ts'

const FOLDS_KEY = 'agent-tree-viewer:closed-projects'

function loadClosed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FOLDS_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

function saveClosed(closed: Set<string>): void {
  try {
    localStorage.setItem(FOLDS_KEY, JSON.stringify([...closed]))
  } catch {
    // Storage blocked: the folds last until the page reloads.
  }
}

type Props = {
  groups: ProjectGroup[] | undefined
  selected: string | undefined
  now: number
  onPick: (id: string) => void
}

export function Sidebar({ groups, selected, now, onPick }: Props) {
  const [closed, setClosed] = useState(loadClosed)
  const [filter, setFilter] = useState('')

  // The open session stays in sight in a long list, once the list has loaded.
  const loaded = groups !== undefined
  useEffect(() => {
    document.querySelector('.session.current')?.scrollIntoView({ block: 'nearest' })
  }, [selected, loaded])

  const toggle = (path: string) => {
    const next = new Set(closed)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    saveClosed(next)
    setClosed(next)
  }

  const words = filter.toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (text: string) => words.every(w => text.toLowerCase().includes(w))
  const shown = (groups ?? [])
    .map(g => (matches(g.name) ? g : { ...g, sessions: g.sessions.filter(s => matches(s.title)) }))
    .filter(g => g.sessions.length > 0)

  return (
    <nav class="sidebar" aria-label="Sessions">
      <div class="brand">Agent tree</div>
      <label class="filter">
        <span class="visually-hidden">Filter sessions</span>
        <input type="search" placeholder="Filter projects and sessions" value={filter} onInput={e => setFilter(e.currentTarget.value)} />
      </label>
      <div class="projects">
        {groups === undefined && <p class="quiet">Looking for sessions…</p>}
        {groups !== undefined && groups.length === 0 && (
          <p class="quiet">No Claude Code sessions in the last two weeks. Start one, and it shows up here.</p>
        )}
        {groups !== undefined && groups.length > 0 && shown.length === 0 && <p class="quiet">Nothing matches “{filter}”.</p>}
        {shown.map(g => {
          const live = g.sessions.filter(s => s.live).length
          // A filter opens every group it matches, so nothing it found stays hidden.
          const open = words.length > 0 || !closed.has(g.path) || g.sessions.some(s => s.id === selected)
          return (
            <section class="project" key={g.path}>
              <button class="project-head" aria-expanded={open} title={g.path} onClick={() => toggle(g.path)}>
                <svg class="chevron" viewBox="0 0 10 10" aria-hidden="true">
                  <path d="M3 2 L7 5 L3 8" />
                </svg>
                <span class="project-name">{g.name}</span>
                <span class="project-count">{live > 0 ? <span class="live-count">{live} live</span> : g.sessions.length}</span>
              </button>
              {open && (
                <ul class="sessions">
                  {g.sessions.map(s => (
                    <li key={s.id}>
                      <button class={`session${s.id === selected ? ' current' : ''}`} aria-current={s.id === selected ? 'true' : undefined} onClick={() => onPick(s.id)}>
                        <span class="session-title">{s.title}</span>
                        <span class="session-when">
                          {s.live && <span class="live-dot" aria-label="live" />}
                          {ago(now - s.lastAt)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </nav>
  )
}
