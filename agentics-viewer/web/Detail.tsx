import type { JSX } from 'preact'
import type { NodeView } from './model.ts'
import type { Snapshot } from '../shared/snapshot.ts'

export function Detail(props: {
  view: NodeView
  snapshot: Snapshot
  now: number
}): JSX.Element {
  return <div class="detail">detail placeholder</div>
}
