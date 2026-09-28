import type { JSX } from 'preact'
import { useEffect, useMemo, useRef } from 'preact/hooks'
import { afterEdges, subtreeDone } from './model.ts'
import type { BoardModel, NodeView } from './model.ts'
import type { Snapshot } from '../shared/snapshot.ts'
import { layoutTree, BLOCK } from './layout.ts'
import type { Placed } from './layout.ts'
import { attachZoom } from './zoom.ts'
import type { ZoomControl } from './zoom.ts'
import { sysFont, wrapLines } from './wrap-text.ts'
import './board.css'

const AFTER_MARGIN = 24
const AFTER_STEP = 14
const NARROW_VISIBLE_FRACTION = 0.48
const TITLE_LEFT = 28
const SUBTITLE_LEFT = 12
const RIGHT_MARGIN = 10
const TITLE_LINE_HEIGHT = 17
const TITLE_TOP = 24
const SUBTITLE_TOP = 58
const SUBTITLE_LINE_HEIGHT = 15
const BOTTOM_PAD = 14
const BLOCKED_GAP = 15
const CORNER_R = 10

interface BlockText {
  title: string[]
  subtitle: string[]
  blocked: string[]
}

function textFor(name: string, wording: string, isComp: boolean, blockedOn: string): BlockText {
  const titleWidth = BLOCK.w - TITLE_LEFT - RIGHT_MARGIN
  const subtitleWidth = BLOCK.w - SUBTITLE_LEFT - RIGHT_MARGIN
  const subFont = sysFont(12, 400)
  return {
    title: wrapLines(name, titleWidth, sysFont(isComp ? 15 : 14, 600), 2),
    // Status wording, and what a node is blocked on, are never trimmed: each wraps to as many
    // lines as it needs, never ellipsized.
    subtitle: wrapLines(wording, subtitleWidth, subFont, Infinity),
    blocked: blockedOn === '' ? [] : wrapLines(blockedOn, subtitleWidth, subFont, Infinity),
  }
}

/** The block height this node's subtitle and blocked line need, never below BLOCK.h. */
function neededHeight(subtitleLines: number, blockedLines: number): number {
  const afterSubtitle = SUBTITLE_TOP + (subtitleLines - 1) * SUBTITLE_LINE_HEIGHT
  const bottom = blockedLines === 0 ? afterSubtitle : afterSubtitle + BLOCKED_GAP + (blockedLines - 1) * SUBTITLE_LINE_HEIGHT
  return Math.max(BLOCK.h, bottom + BOTTOM_PAD)
}

// A horizontal-vertical-horizontal elbow, its two corners rounded with a quadratic bezier
// whose control point sits at the sharp corner it replaces — smooth, and tangent to both the
// horizontal and vertical legs on either side. Falls back to a straight line when the two
// points share a y, and to a plain sharp elbow when there's no room for a rounded one.
function roundedHVH(x1: number, y1: number, midX: number, y2: number, x2: number, r: number): string {
  if (y1 === y2) return `M${x1} ${y1} L${x2} ${y2}`
  const vDir = y2 > y1 ? 1 : -1
  const h1Dir = midX >= x1 ? 1 : -1
  const h2Dir = x2 >= midX ? 1 : -1
  const rr = Math.max(0, Math.min(r, Math.abs(y2 - y1) / 2, Math.abs(midX - x1), Math.abs(x2 - midX)))
  if (rr === 0) return `M${x1} ${y1} H${midX} V${y2} H${x2}`
  const turn1X = midX - rr * h1Dir
  const turn1Y = y1 + rr * vDir
  const turn2Y = y2 - rr * vDir
  const turn2X = midX + rr * h2Dir
  return `M${x1} ${y1} L${turn1X} ${y1} Q${midX} ${y1} ${midX} ${turn1Y} L${midX} ${turn2Y} Q${midX} ${y2} ${turn2X} ${y2} L${x2} ${y2}`
}

function trackPath(parent: Placed, child: Placed, blockH: number): string {
  const midX = parent.x + BLOCK.w + BLOCK.depthGap / 2
  const parentY = parent.y + blockH / 2
  const childY = child.y + blockH / 2
  return roundedHVH(parent.x + BLOCK.w, parentY, midX, childY, child.x, CORNER_R)
}

// After edges route to the right of every block, on a rail past the widest
// column, so they never cross a track.
function afterPath(from: Placed, to: Placed, railX: number, blockH: number): string {
  const fromY = from.y + blockH / 2
  const toY = to.y + blockH / 2
  return roundedHVH(from.x + BLOCK.w, fromY, railX, toY, to.x + BLOCK.w + 4, CORNER_R)
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

  const texts = useMemo(() => {
    const m = new Map<string, BlockText>()
    for (const id of model.order) {
      const view = model.nodes.get(id)!
      const blockedOn =
        view.blockedBy.length === 0
          ? ''
          : `blocked by ${view.blockedBy.map((d) => model.nodes.get(d)?.name ?? d).join(', ')}`
      m.set(id, textFor(view.name, view.wording, view.children.length > 0, blockedOn))
    }
    return m
  }, [model])

  const blockH = useMemo(() => {
    let h = BLOCK.h
    for (const t of texts.values()) h = Math.max(h, neededHeight(t.subtitle.length, t.blocked.length))
    return h
  }, [texts])

  const layout = useMemo(() => layoutTree(model, blockH), [model, blockH])

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
    zoomRef.current.panTo(placed.x + BLOCK.w / 2, placed.y + blockH / 2, visible)
  }, [selected, narrow])

  const tracks: JSX.Element[] = []
  for (const id of model.order) {
    const view = model.nodes.get(id)!
    if (view.children.length === 0) continue
    const parent = layout.placed.get(id)!
    const cls = subtreeDone(model, id) ? 'track q' : 'track'
    for (const childId of view.children) {
      const child = layout.placed.get(childId)!
      tracks.push(<path key={`t:${id}>${childId}`} class={cls} d={trackPath(parent, child, blockH)} />)
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
      afterPaths.push(<path key={`a:in:${from}`} class="after" markerEnd="url(#ah)" d={afterPath(p, selPlaced, rail, blockH)} />)
      rail += AFTER_STEP
    }
    for (const to of outgoing) {
      const p = layout.placed.get(to)
      if (!p) continue
      afterPaths.push(<path key={`a:out:${to}`} class="after" markerEnd="url(#ah)" d={afterPath(selPlaced, p, rail, blockH)} />)
      rail += AFTER_STEP
    }
  }

  const blocks = model.order.map((id) => {
    const view = model.nodes.get(id)!
    const p = layout.placed.get(id)!
    const isComp = view.children.length > 0
    const cls = ['blk', view.lamp]
    if (isComp) cls.push('comp')
    if (id === selected) cls.push('sel')

    const { title: titleLines, subtitle: subtitleLines, blocked: blockedLines } = texts.get(id)!
    const titleTop = p.y + TITLE_TOP
    const blockedTop = p.y + SUBTITLE_TOP + (subtitleLines.length - 1) * SUBTITLE_LINE_HEIGHT + BLOCKED_GAP

    return (
      <g
        key={id}
        class={cls.join(' ')}
        tabIndex={0}
        role="button"
        aria-label={
          view.blockedBy.length > 0
            ? `${view.name}, ${view.wording}, blocked by ${view.blockedBy.map((d) => model.nodes.get(d)?.name ?? d).join(', ')}`
            : `${view.name}, ${view.wording}`
        }
        onClick={() => onSelect(id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSelect(id)
        }}
      >
        <rect class="b" x={p.x} y={p.y} width={BLOCK.w} height={blockH} rx={8} />
        {lampGlyph(view, p.x + 16, p.y + 15)}
        <text class="n" x={p.x + TITLE_LEFT} y={titleTop}>
          {titleLines.map((line, i) => (
            <tspan key={i} x={p.x + TITLE_LEFT} dy={i === 0 ? 0 : TITLE_LINE_HEIGHT}>
              {line}
            </tspan>
          ))}
        </text>
        <text class="s" x={p.x + SUBTITLE_LEFT} y={p.y + SUBTITLE_TOP}>
          {subtitleLines.map((line, i) => (
            <tspan key={i} x={p.x + SUBTITLE_LEFT} dy={i === 0 ? 0 : SUBTITLE_LINE_HEIGHT}>
              {line}
            </tspan>
          ))}
        </text>
        {blockedLines.length > 0 && (
          <text class="s blocked" x={p.x + SUBTITLE_LEFT} y={blockedTop}>
            {blockedLines.map((line, i) => (
              <tspan key={i} x={p.x + SUBTITLE_LEFT} dy={i === 0 ? 0 : SUBTITLE_LINE_HEIGHT}>
                {line}
              </tspan>
            ))}
          </text>
        )}
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
