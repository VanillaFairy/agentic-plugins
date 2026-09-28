import type { JSX } from 'preact'
import type { BoardModel } from './model.ts'

export function Outline(props: {
  model: BoardModel
  selected: string | null
  onSelect: (id: string) => void
}): JSX.Element {
  return <div class="rail">outline placeholder</div>
}
