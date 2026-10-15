import { useEffect, useRef, useState } from 'preact/hooks'
import type { ProjectGroup, SessionSnapshot } from '../shared/model.ts'
import { Detail } from './Detail.tsx'
import { Sidebar } from './Sidebar.tsx'
import { TreeView } from './tree-view.ts'

const LIST_EVERY_MS = 4000
const HIDE_DONE_KEY = 'agent-tree-viewer:hide-done'
const DETAIL_WIDTH_KEY = 'agent-tree-viewer:detail-width'
const DETAIL_MIN_PX = 300
const BOARD_MIN_PX = 240
const SPLITTER_STEP_PX = 24

function sessionFromUrl(): string | undefined {
  return new URLSearchParams(location.search).get('session') ?? undefined
}

function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage blocked: the setting lasts until the page reloads.
  }
}

function recall(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function recallWidth(): number | undefined {
  const width = Number(recall(DETAIL_WIDTH_KEY))
  return width > 0 ? width : undefined
}

// The left edge of the floating details dock, which it sits in. The width it sets is the dock's;
// double-click returns to the default.
function Splitter({ width, onWidth }: { width: number | undefined; onWidth: (w: number | undefined) => void }) {
  const clamp = (handle: HTMLElement, w: number) =>
    Math.round(Math.max(DETAIL_MIN_PX, Math.min(w, (handle.parentElement?.parentElement?.clientWidth ?? Infinity) - BOARD_MIN_PX)))

  const onPointerDown = (e: PointerEvent) => {
    const handle = e.currentTarget as HTMLElement
    const dock = handle.parentElement
    if (dock === null || e.button !== 0) return
    handle.setPointerCapture(e.pointerId)
    const move = (m: PointerEvent) => onWidth(clamp(handle, dock.getBoundingClientRect().right - m.clientX + handle.offsetWidth / 2))
    const up = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', up)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
    handle.addEventListener('pointercancel', up)
    e.preventDefault()
  }

  const onKeyDown = (e: KeyboardEvent) => {
    const handle = e.currentTarget as HTMLElement
    const current = width ?? handle.parentElement?.offsetWidth ?? DETAIL_MIN_PX
    if (e.key === 'ArrowLeft') onWidth(clamp(handle, current + SPLITTER_STEP_PX))
    else if (e.key === 'ArrowRight') onWidth(clamp(handle, current - SPLITTER_STEP_PX))
    else return
    e.preventDefault()
  }

  return (
    <div
      class="splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize details"
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize, double-click to reset"
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDblClick={() => onWidth(undefined)}
    />
  )
}

// The session to open when none is named: the newest live one, else the newest.
function defaultSession(groups: ProjectGroup[]): string | undefined {
  const all = groups.flatMap(g => g.sessions).sort((a, b) => b.lastAt - a.lastAt)
  return (all.find(s => s.live) ?? all[0])?.id
}

export function App() {
  const [groups, setGroups] = useState<ProjectGroup[]>()
  const [sessionId, setSessionId] = useState(sessionFromUrl)
  const [snap, setSnap] = useState<{ data: SessionSnapshot; skew: number }>()
  const [lost, setLost] = useState(false)
  const [hideDone, setHideDone] = useState(() => recall(HIDE_DONE_KEY) === 'true')
  const [hiddenDone, setHiddenDone] = useState(0)
  const [selected, setSelected] = useState<string>()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [following, setFollowing] = useState(true)
  const [now, setNow] = useState(Date.now)
  const [detailWidth, setDetailWidth] = useState(recallWidth)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dockRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<TreeView | undefined>(undefined)
  const detailOpen = snap !== undefined && selected !== undefined

  useEffect(() => {
    let stop = false
    const load = () =>
      fetch('/api/sessions')
        .then(res => res.json() as Promise<ProjectGroup[]>)
        .then(list => {
          if (stop) return
          setGroups(list)
          setSessionId(id => id ?? defaultSession(list))
        })
        .catch(() => undefined)
    void load()
    const timer = setInterval(load, LIST_EVERY_MS)
    return () => {
      stop = true
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (sessionId === undefined) return
    const url = new URL(location.href)
    url.searchParams.set('session', sessionId)
    history.replaceState(null, '', url)
    setSnap(undefined)
    setSelected(undefined)
    const source = new EventSource(`/api/sessions/${encodeURIComponent(sessionId)}/stream`)
    source.addEventListener('snapshot', e => {
      const data = JSON.parse((e as MessageEvent<string>).data) as SessionSnapshot
      setSnap({ data, skew: data.now - Date.now() })
      setLost(false)
    })
    source.onerror = () => setLost(true)
    return () => source.close()
  }, [sessionId])

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const view = new TreeView(canvas, { select: setSelected, hiddenDone: setHiddenDone, following: setFollowing })
    viewRef.current = view
    return () => view.dispose()
  }, [])

  // Tell the tree how much of its right side the details hide. A dock as wide as the board is
  // the narrow-screen bottom sheet, which hides no side.
  useEffect(() => {
    const dock = dockRef.current
    const board = canvasRef.current?.parentElement
    if (dock === null || board == null) return
    const measure = () => {
      const b = board.getBoundingClientRect()
      const covered = b.right - dock.getBoundingClientRect().left
      viewRef.current?.cover(covered > 0 && covered < b.width ? covered : 0)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(dock)
    observer.observe(board)
    return () => {
      observer.disconnect()
      viewRef.current?.cover(0)
    }
  }, [detailOpen])

  useEffect(() => {
    if (snap !== undefined) viewRef.current?.update({ snap: snap.data, skew: snap.skew, hideDone, selected })
  }, [snap, hideDone, selected])

  const resizeDetail = (width: number | undefined) => {
    remember(DETAIL_WIDTH_KEY, width === undefined ? '' : String(width))
    setDetailWidth(width)
  }

  const toggleDone = () => {
    remember(HIDE_DONE_KEY, String(!hideDone))
    setHideDone(!hideDone)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === '+' || e.key === '=') viewRef.current?.zoomIn()
      else if (e.key === '-') viewRef.current?.zoomOut()
      else if (e.key === '0' || e.key === 'f') viewRef.current?.fit()
      else if (e.key === 'l') viewRef.current?.followSession()
      else if (e.key === 'h') toggleDone()
      else if (e.key === 'Escape') setSelected(undefined)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  const pick = (id: string) => {
    setSessionId(id)
    setPickerOpen(false)
  }

  const data = snap?.data
  const agents = data === undefined ? [] : Object.values(data.agents)
  const title = data?.title
  useEffect(() => {
    document.title = title === undefined ? `Agent Tree Viewer ${__VIEWER_VERSION__}` : `Agent Tree Viewer ${__VIEWER_VERSION__} : ${title}`
  }, [title])
  const running = agents.filter(a => a.status === 'running').length
  const serverNow = now + (snap?.skew ?? 0)

  return (
    <div class={`shell${pickerOpen ? ' picker-open' : ''}`}>
      <Sidebar groups={groups} selected={sessionId} now={now} onPick={pick} />
      <div class="scrim" onClick={() => setPickerOpen(false)} />
      <main class="stage">
        <header class="head">
          <button class="picker-toggle" onClick={() => setPickerOpen(true)} aria-label="Choose a session">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2 4h12M2 8h12M2 12h12" />
            </svg>
          </button>
          <div class="heading">
            <h1>{data?.title ?? (sessionId === undefined ? 'No session open' : 'Opening the session…')}</h1>
            {data !== undefined && (
              <p class="subhead">
                <span title={data.project.path}>{data.project.path}</span>
                <span class="tally">
                  {agents.length === 0 ? 'no agents yet' : `${agents.length} ${agents.length === 1 ? 'agent' : 'agents'}`}
                  {running > 0 && <strong class="running-tally">{running} running</strong>}
                </span>
                {lost && <span class="lost">Lost the server. Reconnecting…</span>}
              </p>
            )}
          </div>
          <div class="tools" role="toolbar" aria-label="Tree view">
            <button onClick={() => viewRef.current?.zoomOut()} aria-label="Zoom out" title="Zoom out (−)">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 8h10" />
              </svg>
            </button>
            <button onClick={() => viewRef.current?.zoomIn()} aria-label="Zoom in" title="Zoom in (+)">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 8h10M8 3v10" />
              </svg>
            </button>
            <button class="text" onClick={() => viewRef.current?.fit()} title="Show the whole tree (F)">
              Fit
            </button>
            <button class="text" aria-pressed={following} onClick={() => viewRef.current?.followSession()} title="Keep the newest running agent in sight (L)">
              Follow
            </button>
            <button class="text" aria-pressed={hideDone} onClick={toggleDone} title="Leave out finished agents (H)">
              {hideDone ? `Show done${hiddenDone > 0 ? ` (${hiddenDone})` : ''}` : 'Hide done'}
            </button>
          </div>
        </header>
        <div class="work">
          <div class="board">
            <canvas ref={canvasRef} aria-label="Agent tree" role="img" />
          </div>
          {data !== undefined && selected !== undefined && (
            <div class="detail-dock" ref={dockRef} style={detailWidth === undefined ? undefined : { '--detail-width': `${detailWidth}px` }}>
              <Splitter width={detailWidth} onWidth={resizeDetail} />
              <Detail snap={data} id={selected} now={serverNow} onPick={setSelected} />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
