import { useEffect, useRef, useState } from 'preact/hooks'
import type { ProjectGroup, SessionSnapshot } from '../shared/model.ts'
import { Detail } from './Detail.tsx'
import { Sidebar } from './Sidebar.tsx'
import { TreeView } from './tree-view.ts'

const LIST_EVERY_MS = 4000
const HIDE_DONE_KEY = 'agent-tree-viewer:hide-done'
const AUTOCOMPACT_KEY = 'agent-tree-viewer:autocompact-done'
const STACK_KEY = 'agent-tree-viewer:stack-done'
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

type DoneOption = { label: string; hint: string; key: string; on: boolean; disabled?: boolean; toggle: () => void }

// What the tree does with finished agents, behind one toolbar button. The menu stays open while
// options change, and closes on Escape or a click outside it.
// `hidden` counts the agents Hide leaves out.
function DoneMenu({ options, hidden }: { options: DoneOption[]; hidden: number }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector<HTMLElement>('[role="menuitemcheckbox"]:not([aria-disabled="true"])')?.focus()
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    addEventListener('pointerdown', onDown)
    return () => removeEventListener('pointerdown', onDown)
  }, [open])

  const onKeyDown = (e: KeyboardEvent) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]') ?? [])]
    const at = items.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'Escape') {
      setOpen(false)
      buttonRef.current?.focus()
    } else if (e.key === 'ArrowDown') items[(at + 1) % items.length]?.focus()
    else if (e.key === 'ArrowUp') items[(at - 1 + items.length) % items.length]?.focus()
    else return
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <div class="menu-wrap" ref={wrapRef} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        class="text menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        title="What the tree does with finished agents"
      >
        Done
        {hidden > 0 && <span class="menu-count" aria-label={`${hidden} hidden`} title={`${hidden} finished agents left out`}>{hidden}</span>}
        <svg class="chevron" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
      {open && (
        <div class="menu" role="menu" aria-label="Finished agents" ref={menuRef}>
          {options.map(o => (
            <div
              key={o.key}
              class="menu-item"
              role="menuitemcheckbox"
              tabIndex={-1}
              aria-checked={o.on}
              aria-disabled={o.disabled}
              onClick={() => !o.disabled && o.toggle()}
              onKeyDown={e => {
                if ((e.key === 'Enter' || e.key === ' ') && !o.disabled) {
                  o.toggle()
                  e.preventDefault()
                }
              }}
            >
              <span class="switch" aria-hidden="true" />
              <span class="menu-text">
                <span class="menu-label">
                  {o.label}
                </span>
                <span class="menu-hint">{o.hint}</span>
              </span>
              <kbd>{o.key}</kbd>
            </div>
          ))}
        </div>
      )}
    </div>
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
  const [autocompact, setAutocompact] = useState(() => recall(AUTOCOMPACT_KEY) === 'true')
  const [stack, setStack] = useState(() => recall(STACK_KEY) !== 'false')
  const [selected, setSelected] = useState<string>()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [following, setFollowing] = useState(true)
  const [detailWidth, setDetailWidth] = useState(recallWidth)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dockRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<TreeView | undefined>(undefined)
  // The card to select once the session about to open has loaded.
  const selectNext = useRef<string | undefined>(undefined)
  const detailOpen = snap !== undefined && selected !== undefined

  useEffect(() => {
    let stop = false
    let seen: string | undefined
    const load = () =>
      fetch('/api/sessions')
        .then(res => res.text())
        .then(body => {
          if (stop || body === seen) return
          seen = body
          const list = JSON.parse(body) as ProjectGroup[]
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
    if (sessionId === undefined) return
    const url = new URL(location.href)
    url.searchParams.set('session', sessionId)
    history.replaceState(null, '', url)
    setSnap(undefined)
    setSelected(selectNext.current)
    selectNext.current = undefined
    const source = new EventSource(`/api/sessions/${encodeURIComponent(sessionId)}/stream`)
    source.addEventListener('snapshot', e => {
      const data = JSON.parse((e as MessageEvent<string>).data) as SessionSnapshot
      // The server sent the stream of the session whose agentics run dispatched this one: open
      // that session, with this one's card selected.
      if (data.id !== sessionId) {
        source.close()
        selectNext.current = sessionId
        setSessionId(data.id)
        return
      }
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
    if (snap !== undefined) viewRef.current?.update({ snap: snap.data, skew: snap.skew, hideDone, stack, autocompact, selected })
  }, [snap, hideDone, stack, autocompact, selected])

  const resizeDetail = (width: number | undefined) => {
    remember(DETAIL_WIDTH_KEY, width === undefined ? '' : String(width))
    setDetailWidth(width)
  }

  const toggleDone = () => {
    remember(HIDE_DONE_KEY, String(!hideDone))
    setHideDone(!hideDone)
  }

  const toggleCompact = () => {
    remember(AUTOCOMPACT_KEY, String(!autocompact))
    setAutocompact(!autocompact)
  }

  const toggleStack = () => {
    remember(STACK_KEY, String(!stack))
    setStack(!stack)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === '+' || e.key === '=') viewRef.current?.zoomIn()
      else if (e.key === '-') viewRef.current?.zoomOut()
      else if (e.key === '0' || e.key === 'f') viewRef.current?.fit()
      else if (e.key === 'l') viewRef.current?.followSession()
      else if (e.key === 'h') toggleDone()
      else if (e.key === 's' && !hideDone) toggleStack()
      else if (e.key === 'c' && !hideDone) toggleCompact()
      else if (e.key === 'Escape') setSelected(undefined)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  const pick = (id: string, node?: string) => {
    if (id === sessionId) {
      if (node !== undefined) setSelected(node)
    } else {
      selectNext.current = node
      setSessionId(id)
    }
    setPickerOpen(false)
  }

  const data = snap?.data
  const agents = data === undefined ? [] : Object.values(data.agents).filter(a => a.kind !== 'run' && a.kind !== 'group')
  const title = data?.title
  useEffect(() => {
    document.title = title === undefined ? `Agent Tree Viewer ${__VIEWER_VERSION__}` : `Agent Tree Viewer ${__VIEWER_VERSION__} : ${title}`
  }, [title])
  const running = agents.filter(a => a.status === 'running').length

  return (
    <div class={`shell${pickerOpen ? ' picker-open' : ''}`}>
      <Sidebar groups={groups} selected={sessionId} onPick={pick} />
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
            <DoneMenu
              hidden={hiddenDone}
              options={[
                { label: 'Hide them', hint: 'Leave finished agents out of the tree', key: 'H', on: hideDone, toggle: toggleDone },
                { label: 'Stack them', hint: 'Pile finished agents in a row into decks', key: 'S', on: stack, disabled: hideDone, toggle: toggleStack },
                { label: 'Fold done branches', hint: 'Fold every agent whose agents are all done', key: 'C', on: autocompact, disabled: hideDone, toggle: toggleCompact },
              ]}
            />
          </div>
        </header>
        <div class="work">
          <div class="board">
            <canvas ref={canvasRef} aria-label="Agent tree" role="img" />
          </div>
          {data !== undefined && selected !== undefined && (
            <div class="detail-dock" ref={dockRef} style={detailWidth === undefined ? undefined : { '--detail-width': `${detailWidth}px` }}>
              <Splitter width={detailWidth} onWidth={resizeDetail} />
              <Detail snap={data} id={selected} skew={snap?.skew ?? 0} onPick={setSelected} />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
