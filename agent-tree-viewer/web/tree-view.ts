// The live canvas: drags to pan, zooms with the wheel or a pinch, folds a subtree when its mark
// is clicked, selects a card when it is clicked, and eases cards to their new
// places as the tree grows.
//
// Until someone pans or zooms by hand, it follows the session: the tree at a readable size,
// with the newest running agent in sight.

import { select } from 'd3-selection'
import 'd3-transition'
import { zoom, zoomIdentity } from 'd3-zoom'
import type { ZoomBehavior, ZoomTransform } from 'd3-zoom'
import type { SessionSnapshot } from '../shared/model.ts'
import { NODE_H, NODE_W, PAD, ROOT, hitAt, layout, withoutDone } from './layout.ts'
import type { Layout, Placed } from './layout.ts'
import { loadFolds, saveFolds } from './folds.ts'
import { forgetMeasurements, paint, readPalette } from './paint.ts'
import type { Palette } from './paint.ts'

const SCALE_EXTENT: [number, number] = [0.12, 3]
const FIT_MARGIN = 28
// Fitting never magnifies past this, so a small tree stays card-sized.
const MAX_FIT_SCALE = 1.15
// Following never shrinks the cards past where their text stays readable.
const MIN_FOLLOW_SCALE = 0.6
const MOVE_MS = 320
// How quickly a card closes on its new place: the gap shrinks by e every this many ms.
const EASE_MS = 110
const ZOOM_STEP = 1.4

export type ViewInput = {
  snap: SessionSnapshot
  // Server clock minus page clock.
  skew: number
  hideDone: boolean
  selected: string | undefined
}

export type ViewEvents = {
  select: (id: string | undefined) => void
  // How many done agents the tree leaves out right now.
  hiddenDone: (count: number) => void
  following: (on: boolean) => void
}

export class TreeView {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly events: ViewEvents
  private readonly behavior: ZoomBehavior<HTMLCanvasElement, unknown>
  private readonly observer: ResizeObserver
  private readonly media = matchMedia('(prefers-color-scheme: dark)')
  private readonly reduced = matchMedia('(prefers-reduced-motion: reduce)')

  private input: ViewInput | undefined
  private lay: Layout = { placed: [], width: 0, height: 0 }
  private collapsed = new Set<string>()
  private sessionId: string | undefined
  private at = new Map<string, { x: number; y: number; alpha: number }>()
  private transform: ZoomTransform = zoomIdentity
  private following = true
  private hovered: string | undefined
  private palette: Palette
  private width = 0
  private height = 0
  private frame = 0
  private lastTick = 0
  private disposed = false

  constructor(canvas: HTMLCanvasElement, events: ViewEvents) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (ctx === null) throw new Error('This browser cannot draw on a canvas')
    this.ctx = ctx
    this.events = events
    this.palette = readPalette(document.documentElement)

    this.behavior = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent(SCALE_EXTENT)
      .on('zoom', e => {
        this.transform = e.transform
        if (e.sourceEvent) this.follow(false)
        this.request()
      })
    select(canvas).call(this.behavior).on('dblclick.zoom', null)

    canvas.addEventListener('click', this.onClick)
    canvas.addEventListener('pointermove', this.onHover)
    canvas.addEventListener('pointerleave', this.onLeave)
    this.media.addEventListener('change', this.onTheme)
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(canvas.parentElement ?? canvas)
    void document.fonts.ready.then(() => {
      forgetMeasurements()
      this.request()
    })
    this.resize()
  }

  update(input: ViewInput): void {
    if (input.snap.id !== this.sessionId) {
      this.sessionId = input.snap.id
      this.collapsed = loadFolds(input.snap.id)
      this.at.clear()
      this.follow(true)
    }
    this.input = input
    this.relayout()
  }

  zoomIn(): void {
    this.zoomBy(ZOOM_STEP)
  }

  zoomOut(): void {
    this.zoomBy(1 / ZOOM_STEP)
  }

  // The whole tree, however small that makes it.
  fit(): void {
    this.follow(false)
    this.move(this.fitTransform(), true)
  }

  followSession(): void {
    this.follow(true)
    this.move(this.followTransform(), true)
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.frame)
    this.observer.disconnect()
    this.media.removeEventListener('change', this.onTheme)
    this.canvas.removeEventListener('click', this.onClick)
    this.canvas.removeEventListener('pointermove', this.onHover)
    this.canvas.removeEventListener('pointerleave', this.onLeave)
    select(this.canvas).interrupt().on('.zoom', null)
  }

  private relayout(): void {
    if (this.input === undefined) return
    const all = this.input.snap.agents
    const shown = this.input.hideDone ? withoutDone(all) : all
    this.events.hiddenDone(Object.keys(all).length - Object.keys(shown).length)
    // A fold on an agent left out by Hide done stays, so showing done agents finds it folded.
    this.lay = layout(shown, this.collapsed)

    const animate = !this.reduced.matches && this.at.size > 0
    const ids = new Set(this.lay.placed.map(p => p.id))
    for (const id of this.at.keys()) if (!ids.has(id)) this.at.delete(id)
    for (const p of this.lay.placed) {
      if (this.at.has(p.id)) continue
      // A new card grows out of its parent, unless it is the first drawing of this tree.
      const from = p.parent === undefined ? undefined : this.at.get(p.parent)
      this.at.set(p.id, animate && from !== undefined ? { x: from.x, y: from.y, alpha: 0 } : { x: p.x, y: p.y, alpha: 1 })
    }
    if (this.following) this.move(this.followTransform(), animate)
    this.request()
  }

  private follow(on: boolean): void {
    if (on === this.following) return
    this.following = on
    this.events.following(on)
  }

  private fitScale(): number {
    return Math.min(MAX_FIT_SCALE, (this.width - FIT_MARGIN * 2) / this.lay.width, (this.height - FIT_MARGIN * 2) / this.lay.height)
  }

  // The tree reads from the session's card at the left edge, centred top to bottom.
  private fitTransform(): ZoomTransform {
    if (this.width === 0 || this.height === 0 || this.lay.width === 0) return zoomIdentity
    const scale = Math.max(SCALE_EXTENT[0], this.fitScale())
    return zoomIdentity.translate(FIT_MARGIN, (this.height - this.lay.height * scale) / 2).scale(scale)
  }

  // The whole tree when it fits at a readable size; otherwise a readable piece of it around the
  // agent that started last among those still running, or the session's own card when none runs.
  private followTransform(): ZoomTransform {
    if (this.width === 0 || this.height === 0 || this.lay.width === 0) return zoomIdentity
    const k = Math.max(MIN_FOLLOW_SCALE, this.fitScale())
    const focus =
      this.lay.placed
        .filter(p => p.node?.status === 'running')
        .reduce<Placed | undefined>((best, p) => (best === undefined || (p.node?.startedAt ?? 0) > (best.node?.startedAt ?? 0) ? p : best), undefined) ??
      this.lay.placed.find(p => p.id === ROOT)
    const tallerThanView = this.lay.height * k > this.height - FIT_MARGIN * 2
    const y = !tallerThanView || focus === undefined ? (this.height - this.lay.height * k) / 2 : this.height / 2 - (focus.y + NODE_H / 2) * k
    const x = focus === undefined ? FIT_MARGIN : Math.min(FIT_MARGIN, this.width - FIT_MARGIN - (focus.x + NODE_W + PAD) * k)
    return zoomIdentity.translate(x, y).scale(k)
  }

  private move(target: ZoomTransform, animate: boolean): void {
    const sel = select(this.canvas)
    if (animate && !this.reduced.matches) sel.transition().duration(MOVE_MS).call(this.behavior.transform, target)
    else sel.interrupt().call(this.behavior.transform, target)
  }

  private zoomBy(factor: number): void {
    this.follow(false)
    const sel = select(this.canvas)
    if (this.reduced.matches) sel.call(this.behavior.scaleBy, factor)
    else sel.transition().duration(MOVE_MS / 1.5).call(this.behavior.scaleBy, factor)
  }

  private resize(): void {
    const box = (this.canvas.parentElement ?? this.canvas).getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    this.width = box.width
    this.height = box.height
    this.canvas.width = Math.round(box.width * dpr)
    this.canvas.height = Math.round(box.height * dpr)
    this.canvas.style.width = `${box.width}px`
    this.canvas.style.height = `${box.height}px`
    if (this.following) this.move(this.followTransform(), false)
    this.request()
  }

  private graphPoint(e: MouseEvent): [number, number] {
    const box = this.canvas.getBoundingClientRect()
    return this.transform.invert([e.clientX - box.left, e.clientY - box.top])
  }

  private readonly onClick = (e: MouseEvent): void => {
    const [gx, gy] = this.graphPoint(e)
    const hit = hitAt(this.lay, gx, gy, 4 / this.transform.k)
    if (hit?.kind === 'fold') {
      if (this.collapsed.has(hit.id)) this.collapsed.delete(hit.id)
      else this.collapsed.add(hit.id)
      if (this.sessionId !== undefined) saveFolds(this.sessionId, this.collapsed)
      this.relayout()
    } else {
      this.events.select(hit?.id === this.input?.selected ? undefined : hit?.id)
    }
  }

  private readonly onHover = (e: PointerEvent): void => {
    const [gx, gy] = this.graphPoint(e)
    const hit = hitAt(this.lay, gx, gy, 4 / this.transform.k)
    const key = hit === undefined ? undefined : hit.kind === 'fold' ? `fold:${hit.id}` : hit.id
    this.canvas.style.cursor = hit === undefined ? 'grab' : 'pointer'
    if (key !== this.hovered) {
      this.hovered = key
      this.request()
    }
  }

  private readonly onLeave = (): void => {
    this.hovered = undefined
    this.request()
  }

  private readonly onTheme = (): void => {
    this.palette = readPalette(document.documentElement)
    this.request()
  }

  private request(): void {
    if (this.frame === 0 && !this.disposed) this.frame = requestAnimationFrame(this.draw)
  }

  private readonly draw = (time: number): void => {
    this.frame = 0
    const dt = this.lastTick === 0 ? 16 : Math.min(100, time - this.lastTick)
    this.lastTick = time
    const k = 1 - Math.exp(-dt / EASE_MS)
    let moving = false
    for (const p of this.lay.placed) {
      const a = this.at.get(p.id)
      if (a === undefined) continue
      a.x += (p.x - a.x) * k
      a.y += (p.y - a.y) * k
      a.alpha += (1 - a.alpha) * k
      if (Math.abs(p.x - a.x) + Math.abs(p.y - a.y) < 0.3 && a.alpha > 0.995) {
        a.x = p.x
        a.y = p.y
        a.alpha = 1
      } else {
        moving = true
      }
    }

    const dpr = window.devicePixelRatio || 1
    const { ctx } = this
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    if (this.input !== undefined) {
      const t = this.transform
      ctx.setTransform(dpr * t.k, 0, 0, dpr * t.k, dpr * t.x, dpr * t.y)
      paint({
        ctx,
        palette: this.palette,
        snap: this.input.snap,
        placed: this.lay.placed,
        at: this.at,
        now: Date.now() + this.input.skew,
        t: time,
        selected: this.input.selected,
        hovered: this.hovered,
        motion: !this.reduced.matches,
      })
    }
    // Running agents keep their clocks and pulses going; otherwise the canvas rests.
    const running = this.input !== undefined && Object.values(this.input.snap.agents).some(a => a.status === 'running')
    if (moving || running) this.request()
    else this.lastTick = 0
  }
}
