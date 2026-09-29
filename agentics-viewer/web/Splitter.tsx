import type { JSX } from 'preact'
import { useRef } from 'preact/hooks'
import { RAIL_WIDTH, clampRailWidth } from './rail-width.ts'

// The drag handle on the outline's right edge. `onChange` fires on every move; `onCommit` once the
// drag or key press is done, so the width is stored once rather than on every pointer event.
export function Splitter(props: {
  width: number
  onChange: (px: number) => void
  onCommit: (px: number) => void
}): JSX.Element {
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
    d.last = clampRailWidth(d.width + e.clientX - d.x)
    props.onChange(d.last)
  }

  function up(): void {
    const d = drag.current
    if (d === null) return
    drag.current = null
    props.onCommit(d.last)
  }

  function key(e: KeyboardEvent): void {
    const by = e.key === 'ArrowLeft' ? -RAIL_WIDTH.step : e.key === 'ArrowRight' ? RAIL_WIDTH.step : 0
    const next = e.key === 'Home' ? RAIL_WIDTH.initial : by !== 0 ? clampRailWidth(props.width + by) : null
    if (next === null) return
    e.preventDefault()
    props.onChange(next)
    props.onCommit(next)
  }

  function reset(): void {
    props.onChange(RAIL_WIDTH.initial)
    props.onCommit(RAIL_WIDTH.initial)
  }

  return (
    <div
      class="splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the outline"
      aria-valuenow={props.width}
      aria-valuemin={RAIL_WIDTH.min}
      aria-valuemax={RAIL_WIDTH.max}
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
