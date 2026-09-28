import type { JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { browseErrorText, TEXT } from './model.ts'

interface ProjectRef {
  path: string
  name: string
}

interface ProjectsResponse {
  found: ProjectRef[]
  recent: ProjectRef[]
  last: { project: string; effort: string | null } | null
}

type FolderPick = { path: string } | { cancelled: true } | { error: string }

export interface OpenProjectProps {
  open: boolean
  onClose: () => void
  onChoose: (path: string) => void
}

export function OpenProject(props: OpenProjectProps): JSX.Element {
  const ref = useRef<HTMLDialogElement>(null)
  const [found, setFound] = useState<ProjectRef[]>([])
  const [recent, setRecent] = useState<ProjectRef[]>([])
  const [browsing, setBrowsing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (props.open && !dialog.open) {
      dialog.showModal()
      setError(null)
      fetch('/api/projects')
        .then((r) => r.json())
        .then((data: ProjectsResponse) => {
          setFound(data.found)
          setRecent(data.recent)
        })
    } else if (!props.open && dialog.open) {
      dialog.close()
    }
  }, [props.open])

  function browse(): void {
    setBrowsing(true)
    setError(null)
    fetch('/api/browse', { method: 'POST' })
      .then((r) => r.json())
      .then((pick: FolderPick) => {
        setBrowsing(false)
        if ('path' in pick) {
          props.onChoose(pick.path)
        } else if ('error' in pick) {
          setError(pick.error)
        }
      })
  }

  return (
    <dialog class="openproject" ref={ref} onClose={props.onClose}>
      <div class="op-body">
        <div class="op-group">
          <h3>Found</h3>
          {found.map((p) => (
            <button key={p.path} class="op-row" onClick={() => props.onChoose(p.path)}>
              {p.name}
              <span class="path">{p.path}</span>
            </button>
          ))}
        </div>
        <div class="op-group">
          <h3>Recent</h3>
          {recent.map((p) => (
            <button key={p.path} class="op-row" onClick={() => props.onChoose(p.path)}>
              {p.name}
              <span class="path">{p.path}</span>
            </button>
          ))}
        </div>
        <button class="pick" onClick={browse}>
          Browse…
        </button>
        {browsing && <p class="op-waiting">{TEXT.browseWaiting}</p>}
        {error !== null && <p class="op-error">{browseErrorText(error)}</p>}
      </div>
    </dialog>
  )
}
