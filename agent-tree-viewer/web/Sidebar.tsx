import { useEffect, useState } from 'preact/hooks'
import type { ProjectGroup } from '../shared/model.ts'
import { ago } from './time.ts'

const FOLDS_KEY = 'agent-tree-viewer:closed-projects'
const LIVE_ONLY_KEY = 'agent-tree-viewer:live-only'

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

function loadLiveOnly(): boolean {
  try {
    return localStorage.getItem(LIVE_ONLY_KEY) === 'true'
  } catch {
    return false
  }
}

function saveLiveOnly(on: boolean): void {
  try {
    localStorage.setItem(LIVE_ONLY_KEY, String(on))
  } catch {
    // Storage blocked: the choice lasts until the page reloads.
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
  const [liveOnly, setLiveOnly] = useState(loadLiveOnly)

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

  const switchLiveOnly = (on: boolean) => {
    saveLiveOnly(on)
    setLiveOnly(on)
  }

  const words = filter.toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (text: string) => words.every(w => text.toLowerCase().includes(w))
  // The open session stays listed even when it has gone quiet.
  const kept = (groups ?? []).map(g => (liveOnly ? { ...g, sessions: g.sessions.filter(s => s.live || s.id === selected) } : g))
  const shown = kept
    .map(g => (matches(g.name) ? g : { ...g, sessions: g.sessions.filter(s => matches(s.title)) }))
    .filter(g => g.sessions.length > 0)

  return (
    <nav class="sidebar" aria-label="Sessions">
      <div class="brand">
        Agent Tree Viewer<span class="version">{__VIEWER_VERSION__}</span>
      </div>
      <label class="filter">
        <span class="visually-hidden">Filter sessions</span>
        <input type="search" placeholder="Filter projects and sessions" value={filter} onInput={e => setFilter(e.currentTarget.value)} />
      </label>
      <label class="live-only">
        <input type="checkbox" checked={liveOnly} onChange={e => switchLiveOnly(e.currentTarget.checked)} />
        Hide inactive sessions
      </label>
      <div class="projects">
        {groups === undefined && <p class="quiet">Looking for sessions…</p>}
        {groups !== undefined && groups.length === 0 && (
          <p class="quiet">No Claude Code sessions in the last two weeks. Start one, and it shows up here.</p>
        )}
        {groups !== undefined && groups.length > 0 && shown.length === 0 && (
          <p class="quiet">{words.length > 0 ? <>Nothing matches “{filter}”.</> : 'No live sessions right now.'}</p>
        )}
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
                          {s.waitingFor !== undefined ? (
                            <span class="live-dot waiting" role="img" aria-label={`waiting: ${s.waitingFor}`} title={`Waiting: ${s.waitingFor}`} />
                          ) : (
                            s.live && <span class="live-dot" role="img" aria-label="working" title="Working" />
                          )}
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
