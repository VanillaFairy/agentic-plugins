import type { JSX } from 'preact'
import { useEffect, useMemo, useState } from 'preact/hooks'
import { readUrlState, urlFor, openStream } from './stream.ts'
import type { UrlState } from './stream.ts'
import { buildModel, problemText, staleText, malformedText, noEffortsText, tabTitle, TEXT } from './model.ts'
import type { EffortsList, Snapshot, Problem } from '../shared/snapshot.ts'
import { applyTheme, loadTheme, saveTheme, systemTheme } from './theme.ts'
import type { Theme } from './theme.ts'
import { Header } from './Header.tsx'
import { OpenProject } from './OpenProject.tsx'
import { Annunciator } from './Annunciator.tsx'
import { Outline } from './Outline.tsx'
import { Board } from './Board.tsx'
import { Detail } from './Detail.tsx'

function projectDisplayName(project: string | null): string {
  if (project === null) return ''
  const parts = project.split(/[\\/]/)
  return parts[parts.length - 1] || project
}

export function App(): JSX.Element {
  const [url, setUrl] = useState<UrlState>(() => readUrlState(location.search))
  const [resolving, setResolving] = useState(() => url.project === null)
  const [list, setList] = useState<EffortsList | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [stale, setStale] = useState<Problem | null>(null)
  const [connected, setConnected] = useState(true)
  const [receivedAt, setReceivedAt] = useState<Date | null>(null)
  const [selected, setSelected] = useState<string | null>(() => url.node)
  const [highlight, setHighlight] = useState<string[]>([])
  const [narrow, setNarrow] = useState(() => matchMedia('(max-width: 899px)').matches)
  const [listOpen, setListOpen] = useState(false)
  const [openProjectOpen, setOpenProjectOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>(() => loadTheme() ?? systemTheme())

  function toggleTheme(): void {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    saveTheme(next)
    applyTheme(next)
  }

  useEffect(() => {
    const mq = matchMedia('(max-width: 899px)')
    const onChange = (): void => setNarrow(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Resolve the project from /api/projects' last-opened project when the URL has none.
  useEffect(() => {
    if (url.project !== null) {
      setResolving(false)
      return
    }
    setResolving(true)
    fetch('/api/projects')
      .then((r) => r.json())
      .then((data: { last: { project: string; effort: string | null } | null }) => {
        if (data.last === null) {
          setResolving(false)
          return
        }
        const last = data.last
        setUrl((prev) => {
          const next: UrlState = { ...prev, project: last.project, effort: last.effort }
          history.replaceState(null, '', urlFor(next))
          return next
        })
      })
  }, [url.project])

  // Open the SSE stream for the current project and effort.
  useEffect(() => {
    if (url.project === null) return
    setSnapshot(null)
    setProblem(null)
    setStale(null)
    setList(null)
    const close = openStream(url.project, url.effort, {
      efforts(e) {
        setList(e.list)
        setUrl((prev) => {
          const next: UrlState = { ...prev, effort: e.selected }
          history.replaceState(null, '', urlFor(next))
          return next
        })
      },
      snapshot(s) {
        setSnapshot(s)
        setReceivedAt(new Date())
        setProblem(null)
        setStale(null)
      },
      problem(p) {
        setProblem(p)
      },
      stale(p) {
        setStale(p)
      },
      connection(up) {
        setConnected(up)
      },
    })
    return close
  }, [url.project, url.effort])

  const model = useMemo(() => (snapshot ? buildModel(snapshot) : null), [snapshot])

  useEffect(() => {
    document.title = tabTitle(model?.tiles ?? [])
  }, [model])

  const projectName = useMemo(() => projectDisplayName(url.project), [url.project])

  function selectNode(id: string): void {
    setSelected(id)
    if (narrow) setListOpen(false)
    setUrl((prev) => {
      const next: UrlState = { ...prev, node: id }
      history.replaceState(null, '', urlFor(next))
      return next
    })
  }

  function changeEffort(effort: string): void {
    setSelected(null)
    setUrl((prev) => {
      const next: UrlState = { ...prev, effort, node: null }
      history.replaceState(null, '', urlFor(next))
      return next
    })
  }

  function chooseProject(path: string): void {
    setOpenProjectOpen(false)
    setSelected(null)
    const next: UrlState = { project: path, effort: null, node: null }
    history.replaceState(null, '', urlFor(next))
    setUrl(next)
  }

  const selectedView = selected !== null && model ? (model.nodes.get(selected) ?? null) : null

  const bars: JSX.Element[] = []
  if (stale !== null && receivedAt !== null) {
    bars.push(
      <div key="stale" class="bar stale">
        {staleText(stale, receivedAt)}
      </div>,
    )
  }
  if (snapshot !== null && snapshot.malformed > 0) {
    bars.push(
      <div key="malformed" class="bar malformed">
        {malformedText(snapshot.malformed)}
      </div>,
    )
  }
  if (!connected) {
    bars.push(
      <div key="lost" class="bar lost">
        {TEXT.lostServer}
      </div>,
    )
  }

  let boardContent: JSX.Element | null = null
  if (resolving) {
    boardContent = null
  } else if (problem !== null && snapshot === null) {
    boardContent = (
      <div class="msg">
        <p>{problemText(problem)}</p>
        {problem.code === 'project_gone' && (
          <button class="open" onClick={() => setOpenProjectOpen(true)}>
            Open project
          </button>
        )}
      </div>
    )
  } else if (url.project === null) {
    boardContent = (
      <div class="msg">
        <p>{TEXT.noProject}</p>
        <button class="open" onClick={() => setOpenProjectOpen(true)}>
          Open project
        </button>
      </div>
    )
  } else if (list !== null && list.efforts.length === 0) {
    boardContent = <p class="msg">{noEffortsText(projectName)}</p>
  } else if (model !== null && snapshot !== null) {
    boardContent = (
      <Board
        model={model}
        snapshot={snapshot}
        selected={selected}
        onSelect={selectNode}
        highlight={highlight}
        onHighlight={setHighlight}
        narrow={narrow}
      />
    )
  }

  return (
    <div class="app">
      <Header
        projectName={projectName}
        efforts={list?.efforts ?? []}
        effort={url.effort}
        onEffortChange={changeEffort}
        cost={snapshot?.cost ?? null}
        onOpenProject={() => setOpenProjectOpen(true)}
        onToggleList={() => setListOpen((v) => !v)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      {model !== null && (
        <Annunciator
          tiles={model.tiles}
          counts={model.counts}
          project={projectName}
          effort={url.effort ?? ''}
          onSelect={selectNode}
          selected={selected}
        />
      )}
      <div class="main">
        {model !== null && (!narrow || listOpen) && <Outline model={model} selected={selected} onSelect={selectNode} />}
        <div class="board-col">
          {bars}
          {boardContent}
        </div>
        {selectedView !== null && snapshot !== null && model !== null && (
          <Detail
            view={selectedView}
            model={model}
            snapshot={snapshot}
            now={Date.now()}
            onSelect={selectNode}
            onHighlight={setHighlight}
          />
        )}
      </div>
      <OpenProject open={openProjectOpen} onClose={() => setOpenProjectOpen(false)} onChoose={chooseProject} />
    </div>
  )
}
