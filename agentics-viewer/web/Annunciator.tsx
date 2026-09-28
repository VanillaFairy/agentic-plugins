import type { JSX } from 'preact'
import type { Tile, Counts } from './model.ts'

export function Annunciator(props: {
  tiles: Tile[]
  counts: Counts
  project: string
  effort: string
  onSelect: (id: string) => void
  selected: string | null
}): JSX.Element {
  return <div class="ann">annunciator placeholder</div>
}
