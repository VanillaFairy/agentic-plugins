import type { JSX } from 'preact'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import { subtreeDone } from './model.ts'
import type { BoardModel, NodeView } from './model.ts'
import type { Snapshot } from '../shared/snapshot.ts'
import { layoutTree, routeDeps, BLOCK } from './layout.ts'
import type { DepRoute, Placed } from './layout.ts'
import { attachZoom } from './zoom.ts'
import type { ZoomControl } from './zoom.ts'
import { sysFont, textWidth, wrapLines } from './wrap-text.ts'
import { Hourglass } from './Hourglass.tsx'
import './board.css'

const NARROW_VISIBLE_FRACTION = 0.48
const TITLE_LEFT = 12
const SUBTITLE_LEFT = 12
const RIGHT_MARGIN = 10
const TITLE_LINE_HEIGHT = 17
const TITLE_TOP = 24
const STATUS_TOP = 46
const STATUS_H = 18
const STATUS_PAD_X = 8
const FACTS_TOP = 82
const FACT_LINE_HEIGHT = 15
const BOTTOM_PAD = 14
const BADGE_H = 18
const BADGE_INSET = 8
const CORNER_R = 10

interface BlockText {
  title: string[]
  statusW: number
  factsTop: number // the first fact's baseline: under the badge, or in its place when there is none
  facts: string[] // every fact's wrapped lines, in order
}

// The waits-on badge: an hourglass and the count, the same size whatever the blockers' names.
function badgeWidth(count: number): number {
  return 26 + 7 * String(count).length
}

function textFor(view: NodeView): BlockText {
  const waitsOn = view.blockedBy.length
  const badgeRoom = waitsOn > 0 ? badgeWidth(waitsOn) + 4 : 0
  const titleWidth = BLOCK.w - TITLE_LEFT - RIGHT_MARGIN - badgeRoom
  const factWidth = BLOCK.w - SUBTITLE_LEFT - RIGHT_MARGIN
  return {
    title: wrapLines(view.name, titleWidth, sysFont(view.children.length > 0 ? 15 : 14, 600), 2),
    statusW: textWidth(view.status, sysFont(12, 600)) + 2 * STATUS_PAD_X,
    factsTop: view.status === '' ? STATUS_TOP + 13 : FACTS_TOP,
    // Facts are never trimmed: each wraps to as many lines as it needs.
    facts: view.facts.flatMap((f) => wrapLines(f, factWidth, sysFont(12, 400), Infinity)),
  }
}

/** The block height this node's facts need, never below BLOCK.h. */
function neededHeight(t: BlockText): number {
  const bottom = t.facts.length === 0 ? STATUS_TOP + STATUS_H : t.factsTop + (t.facts.length - 1) * FACT_LINE_HEIGHT
  return Math.max(BLOCK.h, bottom + BOTTOM_PAD)
}

// An orthogonal polyline, each corner rounded with a quadratic bezier whose control point sits at
// the sharp corner it replaces, so the curve is tangent to both legs. A corner's radius shrinks
// to fit the legs beside it, half of a leg it shares with another corner; zero-length legs and
// straight-through points are dropped.
function roundedPath(points: [number, number][], r: number): string {
  const pts = points.filter(([x, y], i) => {
    if (i === 0) return true
    const [px, py] = points[i - 1]
    return x !== px || y !== py
  })
  const corners = pts.filter(([x, y], i) => {
    if (i === 0 || i === pts.length - 1) return true
    const [px, py] = pts[i - 1]
    const [nx, ny] = pts[i + 1]
    return !((px === x && x === nx) || (py === y && y === ny))
  })
  let d = `M${corners[0][0]} ${corners[0][1]}`
  for (let i = 1; i < corners.length - 1; i++) {
    const [px, py] = corners[i - 1]
    const [x, y] = corners[i]
    const [nx, ny] = corners[i + 1]
    const inLen = Math.abs(x - px) + Math.abs(y - py)
    const outLen = Math.abs(nx - x) + Math.abs(ny - y)
    const rr = Math.min(r, i === 1 ? inLen : inLen / 2, i === corners.length - 2 ? outLen : outLen / 2)
    const ux = Math.sign(x - px)
    const uy = Math.sign(y - py)
    const vx = Math.sign(nx - x)
    const vy = Math.sign(ny - y)
    d += ` L${x - ux * rr} ${y - uy * rr} Q${x} ${y} ${x + vx * rr} ${y + vy * rr}`
  }
  const [lx, ly] = corners[corners.length - 1]
  return `${d} L${lx} ${ly}`
}

function afterPath(from: Placed, to: Placed, r: DepRoute): string {
  return roundedPath(
    [
      [from.x + BLOCK.w, r.fromY],
      [r.railX, r.fromY],
      [r.railX, r.toY],
      [to.x + BLOCK.w + 2, r.toY],
    ],
    CORNER_R,
  )
}

export function Board(props: {
  model: BoardModel
  snapshot: Snapshot
  selected: string | null
  onSelect: (id: string) => void
  highlight: string[]
  onHighlight: (ids: string[]) => void
  narrow: boolean
}): JSX.Element {
  const { model, snapshot, selected, onSelect, highlight, onHighlight, narrow } = props

  const texts = useMemo(() => {
    const m = new Map<string, BlockText>()
    for (const id of model.order) {
      const view = model.nodes.get(id)!
      m.set(id, textFor(view))
    }
    return m
  }, [model])

  const blockH = useMemo(() => {
    let h = BLOCK.h
    for (const t of texts.values()) h = Math.max(h, neededHeight(t))
    return h
  }, [texts])

  const wrapRef = useRef<HTMLDivElement>(null)
  const [aspect, setAspect] = useState(16 / 10)
  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (wrap === null) return
    const measure = (): void => {
      const { width, height } = wrap.getBoundingClientRect()
      if (width > 0 && height > 0) setAspect(width / height)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [])

  const layout = useMemo(() => layoutTree(model, blockH, aspect), [model, blockH, aspect])
  const [hovered, setHovered] = useState<string | null>(null)

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
    // Keep the blocking arrows' rails, in the gap right of the block, in view too.
    zoomRef.current.panTo(placed.x + BLOCK.w / 2, placed.y + blockH / 2, visible, BLOCK.colGap)
  }, [selected, narrow])

  const tracks = layout.links.map((l) => (
    <path
      key={`t:${l.parent}>${l.child}`}
      class={subtreeDone(model, l.parent) ? 'track q' : 'track'}
      d={roundedPath(l.points, CORNER_R)}
    />
  ))

  // Only the selected and the hovered node's edges are drawn, so they route among themselves.
  const routes = useMemo(() => {
    const focus = new Set([selected, hovered].filter((id) => id !== null))
    const edges = snapshot.nodes.flatMap((n) => n.deps.map((d) => ({ from: d, to: n.id })))
    return routeDeps(
      edges.filter((e) => focus.has(e.from) || focus.has(e.to)),
      layout.placed,
      blockH,
    )
  }, [snapshot, layout, blockH, selected, hovered])
  // The selected node's edges go last, so they draw over the rest.
  const touchesSelected = (r: DepRoute): boolean => r.from === selected || r.to === selected
  const afterPaths = [...routes.filter((r) => !touchesSelected(r)), ...routes.filter(touchesSelected)].map((r) => {
    const variant = touchesSelected(r) ? 'sel' : model.nodes.get(r.from)?.lamp === 'done' ? 'q' : ''
    return (
      <path
        key={`a:${r.from}>${r.to}`}
        class={`after ${variant}`}
        marker-end={`url(#ah${variant === '' ? '' : `-${variant}`})`}
        d={afterPath(layout.placed.get(r.from)!, layout.placed.get(r.to)!, r)}
      />
    )
  })

  const blocks = model.order.map((id) => {
    const view = model.nodes.get(id)!
    const p = layout.placed.get(id)!
    const isComp = view.children.length > 0
    const cls = ['blk', view.lamp]
    if (isComp) cls.push('comp')
    if (id === selected) cls.push('sel')
    if (view.alertBelow !== null) cls.push(`${view.alertBelow}-below`)
    if (highlight.includes(id)) cls.push('hl')

    const { title: titleLines, statusW, factsTop, facts: factLines } = texts.get(id)!
    const titleTop = p.y + TITLE_TOP
    const waitsOn = view.blockedBy.length
    const badgeW = badgeWidth(waitsOn)
    const badgeX = p.x + BLOCK.w - BADGE_INSET - badgeW
    const badgeY = p.y + BADGE_INSET

    return (
      <g
        key={id}
        class={cls.join(' ')}
        tabIndex={0}
        role="button"
        aria-label={
          view.blockedBy.length > 0
            ? `${view.name}, ${view.wording}, waits on ${view.blockedBy.map((d) => model.nodes.get(d)?.name ?? d).join(', ')}`
            : `${view.name}, ${view.wording}`
        }
        onClick={() => onSelect(id)}
        onMouseEnter={() => setHovered(id)}
        onMouseLeave={() => setHovered((h) => (h === id ? null : h))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSelect(id)
        }}
      >
        <rect class="b" x={p.x} y={p.y} width={BLOCK.w} height={blockH} rx={8} />
        <text class="n" x={p.x + TITLE_LEFT} y={titleTop}>
          {titleLines.map((line, i) => (
            <tspan key={i} x={p.x + TITLE_LEFT} dy={i === 0 ? 0 : TITLE_LINE_HEIGHT}>
              {line}
            </tspan>
          ))}
        </text>
        {view.status !== '' && (
          <g class={`status t-${view.lamp}`}>
            <rect x={p.x + SUBTITLE_LEFT} y={p.y + STATUS_TOP} width={statusW} height={STATUS_H} rx={4} />
            <text x={p.x + SUBTITLE_LEFT + STATUS_PAD_X} y={p.y + STATUS_TOP + 13}>
              {view.status}
            </text>
          </g>
        )}
        {factLines.length > 0 && (
          <text class="s" x={p.x + SUBTITLE_LEFT} y={p.y + factsTop}>
            {factLines.map((line, i) => (
              <tspan key={i} x={p.x + SUBTITLE_LEFT} dy={i === 0 ? 0 : FACT_LINE_HEIGHT}>
                {line}
              </tspan>
            ))}
          </text>
        )}
        {waitsOn > 0 && (
          <g class="wait" onMouseEnter={() => onHighlight(view.blockedBy)} onMouseLeave={() => onHighlight([])}>
            <rect x={badgeX} y={badgeY} width={badgeW} height={BADGE_H} rx={BADGE_H / 2} />
            <Hourglass size={12} x={badgeX + 7} y={badgeY + 3} />
            <text x={badgeX + 22} y={badgeY + 13}>
              {waitsOn}
            </text>
          </g>
        )}
      </g>
    )
  })

  return (
    <div class="boardwrap" ref={wrapRef}>
      <svg ref={svgRef} width="100%" height="100%" role="img" aria-label="Effort tree">
        <defs>
          {['', '-q', '-sel'].map((suffix) => (
            <marker
              key={suffix}
              id={`ah${suffix}`}
              viewBox="0 0 10 10"
              refX={9}
              refY={5}
              markerWidth={9}
              markerHeight={9}
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path class={`ah${suffix}`} d="M1 1L9 5L1 9Z" />
            </marker>
          ))}
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
