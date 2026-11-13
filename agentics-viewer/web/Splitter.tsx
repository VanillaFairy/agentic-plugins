import type { JSX } from 'preact'
import { useRef } from 'preact/hooks'
import { clampWidth } from './pane-width.ts'
import type { PaneWidth } from './pane-width.ts'

// The drag handle on a side pane's inner edge. `edge` is the side of the pane the handle sits on:
// the outline's handle is on its right, so moving it right widens the pane; the detail panel's is
// on its left, so moving it left does. `onChange` fires on every move; `onCommit` once the drag or
// key press is done, so the width is stored once rather than on every pointer event.
export function Splitter(props: {
  pane: PaneWidth
  edge: 'left' | 'right'
  label: string
  class: string
  width: number
  onChange: (px: number) => void
  onCommit: (px: number) => void
}): JSX.Element {
  const { pane } = props
  const sign = props.edge === 'right' ? 1 : -1
  const drag = useRef<{ x: number; width: number; last: number } | null>(null)

  function down(e: PointerEvent): void {
    if (e.button !== 0) return
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, width: props.width, last: props.width }
  }

  function move(e: PointerEvent): void {
    const d = drag.current
    if (d === null) return
    d.last = clampWidth(pane, d.width + sign * (e.clientX - d.x))
    props.onChange(d.last)
  }

  function up(): void {
    const d = drag.current
    if (d === null) return
    drag.current = null
    props.onCommit(d.last)
  }

  function key(e: KeyboardEvent): void {
    const dx = e.key === 'ArrowLeft' ? -pane.step : e.key === 'ArrowRight' ? pane.step : 0
    const next = e.key === 'Home' ? pane.initial : dx !== 0 ? clampWidth(pane, props.width + sign * dx) : null
    if (next === null) return
    e.preventDefault()
    props.onChange(next)
    props.onCommit(next)
  }

  function reset(): void {
    props.onChange(pane.initial)
    props.onCommit(pane.initial)
  }

  return (
    <div
      class={`splitter ${props.class}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={props.label}
      aria-valuenow={props.width}
      aria-valuemin={pane.min}
      aria-valuemax={pane.max}
      tabIndex={0}
      title="Drag to resize, double-click to reset"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={key}
      onDblClick={reset}
    />
  )
}
