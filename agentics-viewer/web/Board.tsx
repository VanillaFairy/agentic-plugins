import type { JSX } from 'preact'
import { useEffect, useMemo, useRef } from 'preact/hooks'
import { afterEdges, subtreeDone } from './model.ts'
import type { BoardModel, NodeView } from './model.ts'
import type { Snapshot } from '../shared/snapshot.ts'
import { layoutTree, BLOCK } from './layout.ts'
import type { Placed } from './layout.ts'
import { attachZoom } from './zoom.ts'
import type { ZoomControl } from './zoom.ts'
import './board.css'

const AFTER_MARGIN = 24
const AFTER_STEP = 14
const NARROW_VISIBLE_FRACTION = 0.48

function trackPath(parent: Placed, child: Placed): string {
  const midX = parent.x + BLOCK.w + BLOCK.depthGap / 2
  const parentY = parent.y + BLOCK.h / 2
  const childY = child.y + BLOCK.h / 2
  return `M${parent.x + BLOCK.w} ${parentY} H${midX} V${childY} H${child.x}`
}

// After edges route to the right of every block, on a rail past the widest
// column, so they never cross a track.
function afterPath(from: Placed, to: Placed, railX: number): string {
  const fromY = from.y + BLOCK.h / 2
  const toY = to.y + BLOCK.h / 2
  return `M${from.x + BLOCK.w} ${fromY} H${railX} V${toY} H${to.x + BLOCK.w + 4}`
}

function lampGlyph(view: NodeView, cx: number, cy: number): JSX.Element {
  switch (view.lamp) {
    case 'work':
      return <circle cx={cx} cy={cy} r={5} fill="var(--work)" />
    case 'hold':
      return <circle cx={cx} cy={cy} r={5} fill="var(--hold)" />
    case 'stop':
      return <circle cx={cx} cy={cy} r={5} fill="var(--stop)" />
    case 'done':
      return <circle cx={cx} cy={cy} r={5} fill="var(--quiet)" />
    case 'open':
      return <circle cx={cx} cy={cy} r={4.5} fill="none" stroke="var(--quiet)" strokeDasharray="2 2" />
    default:
      return <circle cx={cx} cy={cy} r={4.5} fill="none" stroke="var(--quiet)" strokeWidth={1.5} />
  }
}

export function Board(props: {
  model: BoardModel
  snapshot: Snapshot
  selected: string | null
  onSelect: (id: string) => void
  narrow: boolean
}): JSX.Element {
  const { model, snapshot, selected, onSelect, narrow } = props
  const layout = useMemo(() => layoutTree(model), [model])

  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const layerRef = useRef<SVGGElement>(null)
  const zoomRef = useRef<ZoomControl | null>(null)
  const layoutRef = useRef(layout)
  layoutRef.current = layout

  useEffect(() => {
    if (svgRef.current === null || layerRef.current === null) return
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
    const control = attachZoom(svgRef.current, layerRef.current, () => layoutRef.current, reducedMotion)
    zoomRef.current = control
    return () => {
      control.dispose()
      zoomRef.current = null
    }
    // Attach once: the zoom transform must survive later re-renders.
  }, [])

  const pannedRef = useRef<{ id: string | null; narrow: boolean } | null>(null)

  useEffect(() => {
    if (pannedRef.current !== null && pannedRef.current.id === selected && pannedRef.current.narrow === narrow) return
    pannedRef.current = { id: selected, narrow }
    if (selected === null || wrapRef.current === null || zoomRef.current === null) return
    const placed = layoutRef.current.placed.get(selected)
    if (!placed) return
    const box = wrapRef.current.getBoundingClientRect()
    const visible = narrow ? new DOMRect(box.left, box.top, box.width, box.height * NARROW_VISIBLE_FRACTION) : box
    zoomRef.current.panTo(placed.x + BLOCK.w / 2, placed.y + BLOCK.h / 2, visible)
  }, [selected, narrow])

  const tracks: JSX.Element[] = []
  for (const id of model.order) {
    const view = model.nodes.get(id)!
    if (view.children.length === 0) continue
    const parent = layout.placed.get(id)!
    const cls = subtreeDone(model, id) ? 'track q' : 'track'
    for (const childId of view.children) {
      const child = layout.placed.get(childId)!
      tracks.push(<path key={`t:${id}>${childId}`} class={cls} d={trackPath(parent, child)} />)
    }
  }

  const afterPaths: JSX.Element[] = []
  const selPlaced = selected !== null ? layout.placed.get(selected) : undefined
  if (selected !== null && selPlaced) {
    const { incoming, outgoing } = afterEdges(snapshot, selected)
    let rail = layout.width + AFTER_MARGIN
    for (const from of incoming) {
      const p = layout.placed.get(from)
      if (!p) continue
      afterPaths.push(<path key={`a:in:${from}`} class="after" markerEnd="url(#ah)" d={afterPath(p, selPlaced, rail)} />)
      rail += AFTER_STEP
    }
    for (const to of outgoing) {
      const p = layout.placed.get(to)
      if (!p) continue
      afterPaths.push(<path key={`a:out:${to}`} class="after" markerEnd="url(#ah)" d={afterPath(selPlaced, p, rail)} />)
      rail += AFTER_STEP
    }
  }

  const blocks = model.order.map((id) => {
    const view = model.nodes.get(id)!
    const p = layout.placed.get(id)!
    const cls = ['blk', view.lamp]
    if (view.children.length > 0) cls.push('comp')
    if (id === selected) cls.push('sel')
    return (
      <g
        key={id}
        class={cls.join(' ')}
        tabIndex={0}
        role="button"
        aria-label={`${view.name}, ${view.wording}`}
        onClick={() => onSelect(id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSelect(id)
        }}
      >
        <rect class="b" x={p.x} y={p.y} width={BLOCK.w} height={BLOCK.h} rx={3} />
        {lampGlyph(view, p.x + 16, p.y + 15)}
        <text class="n" x={p.x + 28} y={p.y + 20}>
          {view.name}
        </text>
        <text class="s" x={p.x + 12} y={p.y + 39}>
          {view.wording}
        </text>
      </g>
    )
  })

  return (
    <div class="boardwrap" ref={wrapRef}>
      <svg ref={svgRef} width="100%" height="100%" role="img" aria-label="Effort tree">
        <defs>
          <marker id="ah" viewBox="0 0 10 10" refX={8} refY={5} markerWidth={7} markerHeight={7} orient="auto">
            <path d="M1 1L9 5L1 9" fill="none" stroke="context-stroke" strokeWidth={1.6} />
          </marker>
        </defs>
        <g ref={layerRef}>
          {tracks}
          {afterPaths}
          {blocks}
        </g>
      </svg>
      <div class="zoom">
        <button aria-label="Zoom in" onClick={() => zoomRef.current?.zoomIn()}>
          +
        </button>
        <button aria-label="Zoom out" onClick={() => zoomRef.current?.zoomOut()}>
          −
        </button>
        <button aria-label="Fit the tree" onClick={() => zoomRef.current?.fit()}>
          ⤢
        </button>
      </div>
    </div>
  )
}
