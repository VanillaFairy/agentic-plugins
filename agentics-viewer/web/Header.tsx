import type { JSX } from 'preact'
import type { EffortListing, Snapshot } from '../shared/snapshot.ts'
import { costText } from './model.ts'

export interface HeaderProps {
  projectName: string
  efforts: EffortListing[]
  effort: string | null
  onEffortChange: (name: string) => void
  cost: Snapshot['cost'] | null
  onOpenProject: () => void
  onToggleList: () => void
}

export function Header(props: HeaderProps): JSX.Element {
  return (
    <header class="top">
      <button class="pick listbtn" aria-label="Show the node list" onClick={props.onToggleList}>
        List
      </button>
      <button class="pick" onClick={props.onOpenProject}>
        <span class="k">Project</span> {props.projectName}
      </button>
      <select
        class="pick effort"
        value={props.effort ?? ''}
        onChange={(e) => props.onEffortChange((e.target as HTMLSelectElement).value)}
      >
        {props.efforts.map((e) => (
          <option key={e.effort} value={e.effort}>
            {e.about || e.effort}
          </option>
        ))}
      </select>
      <span class="spacer"></span>
      {props.cost && <span class="cost">{costText(props.cost)}</span>}
      <button class="open" onClick={props.onOpenProject}>
        Open project
      </button>
    </header>
  )
}
