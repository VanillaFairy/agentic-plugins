import type { JSX } from 'preact'
import type { BoardModel } from './model.ts'
import type { Snapshot } from '../shared/snapshot.ts'

export function Board(props: {
  model: BoardModel
  snapshot: Snapshot
  selected: string | null
  onSelect: (id: string) => void
  narrow: boolean
}): JSX.Element {
  return <div class="boardwrap">board placeholder</div>
}
