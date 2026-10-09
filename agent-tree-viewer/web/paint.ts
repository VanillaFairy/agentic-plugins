// Paints the tree on a canvas: wires, cards, fold marks. Knows nothing of zoom or input; the
// caller sets the transform and says where every card is this frame.

import type { AgentNode, AgentStatus, SessionSnapshot } from '../shared/model.ts'
import { FOLD_R, NODE_H, NODE_W, ROOT, STATUS_WORD, current, elapsed, foldCentre } from './layout.ts'
import type { Placed } from './layout.ts'

export type Palette = {
  card: string
  cardEdge: string
  ink: string
  muted: string
  line: string
  select: string
  status: Record<AgentStatus, string>
}

const TOKENS = ['card', 'card-edge', 'ink', 'muted', 'line', 'select', 'live', 'ok', 'bad', 'off'] as const

export function readPalette(el: Element): Palette {
  const style = getComputedStyle(el)
  const t = Object.fromEntries(TOKENS.map(k => [k, style.getPropertyValue(`--${k}`).trim()])) as Record<(typeof TOKENS)[number], string>
  return {
    card: t.card,
    cardEdge: t['card-edge'],
    ink: t.ink,
    muted: t.muted,
    line: t.line,
    select: t.select,
    status: { running: t.live, completed: t.ok, failed: t.bad, killed: t.off },
  }
}

const SANS = '"Sofia Sans Semi Condensed", "Segoe UI", system-ui, sans-serif'
const MONO = '"JetBrains Mono", "Cascadia Mono", Consolas, monospace'
const FONT = {
  title: `600 15px ${SANS}`,
  meta: `400 13px ${SANS}`,
  time: `500 13px ${SANS}`,
  doing: `400 12px ${MONO}`,
  rootTitle: `700 18px ${SANS}`,
  fold: `600 12px ${SANS}`,
}
const RADIUS = 9
const INSET = 16
// The dash a running agent's wire carries: a short bright stroke, then a long gap.
const PULSE = [10, 90]
const PULSE_SPEED = 0.07

const fitted = new Map<string, string>()

// Widths measured before the web fonts arrived are wrong once they have.
export function forgetMeasurements(): void {
  fitted.clear()
}

// `text` shortened with an ellipsis until it fits `max` pixels in the current font.
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const key = `${ctx.font}|${max}|${flat}`
  const hit = fitted.get(key)
  if (hit !== undefined) return hit
  let out = flat
  if (ctx.measureText(flat).width > max) {
    let lo = 0
    let hi = flat.length
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      if (ctx.measureText(flat.slice(0, mid) + '…').width <= max) lo = mid
      else hi = mid - 1
    }
    out = flat.slice(0, lo).trimEnd() + '…'
  }
  if (fitted.size > 4000) fitted.clear()
  fitted.set(key, out)
  return out
}

// Two facts on one line, a fixed gap apart; the first gives way when they don't fit.
function pair(ctx: CanvasRenderingContext2D, first: string, second: string, x: number, y: number, max: number): void {
  const gap = 12
  const secondW = ctx.measureText(second).width
  const head = fit(ctx, first, Math.max(20, max - secondW - gap))
  ctx.fillText(head, x, y)
  ctx.fillText(second, x + ctx.measureText(head).width + gap, y)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

// Right out of the parent's fold mark, down or up, and right into the child, soft at the corners.
function wirePath(from: { x: number; y: number }, to: { x: number; y: number }): Path2D {
  const x0 = from.x + NODE_W + FOLD_R
  const y0 = from.y + NODE_H / 2
  const x1 = to.x
  const y1 = to.y + NODE_H / 2
  const mid = x0 + (x1 - x0) / 2
  const path = new Path2D()
  path.moveTo(x0, y0)
  if (Math.abs(y1 - y0) < 1 || x1 <= x0) {
    path.lineTo(x1, y1)
    return path
  }
  const r = Math.min(12, Math.abs(y1 - y0) / 2, (x1 - x0) / 4)
  const dir = y1 > y0 ? 1 : -1
  path.lineTo(mid - r, y0)
  path.quadraticCurveTo(mid, y0, mid, y0 + dir * r)
  path.lineTo(mid, y1 - dir * r)
  path.quadraticCurveTo(mid, y1, mid + r, y1)
  path.lineTo(x1, y1)
  return path
}

export type Frame = {
  ctx: CanvasRenderingContext2D
  palette: Palette
  snap: SessionSnapshot
  placed: Placed[]
  // Where each card is drawn this frame, and how opaque, while it eases to its place.
  at: Map<string, { x: number; y: number; alpha: number }>
  // The page's clock, already corrected to the server's.
  now: number
  // Milliseconds since the page loaded, for the pulses.
  t: number
  selected: string | undefined
  hovered: string | undefined
  motion: boolean
}

function agentCard(f: Frame, p: Placed, n: AgentNode, x: number, y: number): void {
  const { ctx, palette } = f
  const colour = palette.status[n.status]
  roundRect(ctx, x, y, NODE_W, NODE_H, RADIUS)
  ctx.fillStyle = palette.card
  ctx.fill()
  ctx.lineWidth = f.selected === p.id ? 2 : 1
  ctx.strokeStyle = f.selected === p.id ? palette.select : f.hovered === p.id ? palette.muted : palette.cardEdge
  ctx.stroke()

  // The status stripe down the card's left edge.
  ctx.save()
  roundRect(ctx, x, y, NODE_W, NODE_H, RADIUS)
  ctx.clip()
  ctx.fillStyle = colour
  ctx.fillRect(x, y, 4, NODE_H)
  ctx.restore()

  const left = x + INSET
  const room = NODE_W - INSET * 2
  ctx.textBaseline = 'alphabetic'

  ctx.font = FONT.time
  const time = elapsed((n.endedAt ?? f.now) - n.startedAt)
  const timeW = ctx.measureText(time).width
  ctx.fillStyle = n.status === 'running' ? colour : palette.muted
  ctx.textAlign = 'right'
  ctx.fillText(time, x + NODE_W - INSET + 2, y + 24)
  ctx.textAlign = 'left'

  ctx.font = FONT.title
  ctx.fillStyle = palette.ink
  ctx.fillText(fit(ctx, n.description, room - timeW - 10), left, y + 24)

  ctx.font = FONT.meta
  ctx.fillStyle = palette.muted
  pair(ctx, n.type, `${n.toolCount} ${n.toolCount === 1 ? 'tool' : 'tools'}`, left, y + 45, room - FOLD_R - 4)

  if (n.status === 'running') {
    const doing = current(n.activity)
    ctx.font = FONT.doing
    ctx.fillStyle = colour
    ctx.fillText(fit(ctx, doing ? `${doing.tool} ${doing.arg}` : 'thinking…', room), left, y + 66)
  } else {
    ctx.font = FONT.meta
    ctx.fillStyle = colour
    ctx.fillText(STATUS_WORD[n.status], left, y + 66)
  }
}

// The session's own card: an agent card without a status stripe, set apart by a heavier edge
// and a larger title.
function rootCard(f: Frame, p: Placed, x: number, y: number): void {
  const { ctx, palette, snap } = f
  roundRect(ctx, x, y, NODE_W, NODE_H, RADIUS)
  ctx.fillStyle = palette.card
  ctx.fill()
  ctx.lineWidth = f.selected === ROOT ? 2.5 : 2
  ctx.strokeStyle = f.selected === ROOT ? palette.select : palette.muted
  ctx.stroke()
  const left = x + INSET
  const room = NODE_W - INSET * 2
  const agents = Object.values(snap.agents)
  const running = agents.filter(a => a.status === 'running').length
  ctx.textAlign = 'left'
  ctx.font = FONT.rootTitle
  ctx.fillStyle = palette.ink
  ctx.fillText(fit(ctx, snap.project.name, room), left, y + 26)
  ctx.font = FONT.meta
  ctx.fillStyle = palette.muted
  if (agents.length === 0) pair(ctx, 'main loop', `${snap.main.toolCount} tools`, left, y + 46, room - FOLD_R - 4)
  else pair(ctx, `${agents.length} agents`, `${running} running`, left, y + 46, room - FOLD_R - 4)
  const doing = current(snap.main.activity)
  if (doing) {
    ctx.font = FONT.doing
    ctx.fillStyle = palette.status.running
    ctx.fillText(fit(ctx, `${doing.tool} ${doing.arg}`, room), left, y + 66)
  }
}

function foldMark(f: Frame, p: Placed, x: number, y: number): void {
  if (p.fold === undefined) return
  const { ctx, palette } = f
  const c = foldCentre({ ...p, x, y })
  const live = p.fold !== 'open' && p.fold.running
  const ink = live ? palette.status.running : palette.muted
  ctx.beginPath()
  ctx.arc(c.x, c.y, FOLD_R, 0, Math.PI * 2)
  ctx.fillStyle = palette.card
  ctx.fill()
  ctx.lineWidth = f.hovered === `fold:${p.id}` ? 2 : 1.3
  ctx.strokeStyle = ink
  ctx.stroke()
  const arm = FOLD_R - 3.5
  ctx.beginPath()
  ctx.moveTo(c.x - arm, c.y)
  ctx.lineTo(c.x + arm, c.y)
  if (p.fold !== 'open') {
    ctx.moveTo(c.x, c.y - arm)
    ctx.lineTo(c.x, c.y + arm)
  }
  ctx.lineCap = 'round'
  ctx.lineWidth = 1.6
  ctx.stroke()
  if (p.fold !== 'open') {
    ctx.font = FONT.fold
    ctx.fillStyle = ink
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(p.fold.hidden), c.x + FOLD_R + 6, c.y + 1)
    ctx.textBaseline = 'alphabetic'
  }
}

export function paint(f: Frame): void {
  const { ctx, palette } = f
  const pos = (p: Placed) => f.at.get(p.id) ?? { x: p.x, y: p.y, alpha: 1 }

  for (const p of f.placed) {
    if (p.parent === undefined) continue
    const parent = f.placed.find(q => q.id === p.parent)
    if (parent === undefined) continue
    const to = pos(p)
    const path = wirePath(pos(parent), to)
    ctx.globalAlpha = to.alpha
    ctx.setLineDash([])
    ctx.lineWidth = 1.4
    ctx.strokeStyle = palette.line
    ctx.stroke(path)
    if (p.node?.status === 'running') {
      ctx.strokeStyle = palette.status.running
      ctx.lineWidth = 2.4
      ctx.lineCap = 'round'
      if (f.motion) {
        ctx.setLineDash(PULSE)
        ctx.lineDashOffset = -((f.t * PULSE_SPEED) % (PULSE[0]! + PULSE[1]!))
      } else {
        ctx.globalAlpha = to.alpha * 0.55
      }
      ctx.stroke(path)
      ctx.setLineDash([])
    }
  }
  for (const p of f.placed) {
    const { x, y, alpha } = pos(p)
    ctx.globalAlpha = alpha
    if (p.node) agentCard(f, p, p.node, x, y)
    else rootCard(f, p, x, y)
  }
  for (const p of f.placed) {
    const { x, y, alpha } = pos(p)
    ctx.globalAlpha = alpha
    foldMark(f, p, x, y)
  }
  ctx.globalAlpha = 1
}
