import { select } from 'd3-selection'
import { zoom, zoomIdentity, zoomTransform, type D3ZoomEvent, type ZoomTransform } from 'd3-zoom'
import 'd3-transition'
import { BLOCK } from './layout.ts'

export interface ZoomControl {
  zoomIn(): void
  zoomOut(): void
  fit(): void
  panTo(x: number, y: number, visible: DOMRect, padRight?: number): void
  dispose(): void
}

const SCALE_EXTENT: [number, number] = [0.25, 2]
const PAN_DURATION = 250

export function attachZoom(
  svg: SVGSVGElement,
  layer: SVGGElement,
  content: () => { width: number; height: number },
  reducedMotion: boolean,
): ZoomControl {
  const svgSel = select<SVGSVGElement, unknown>(svg)
  const layerSel = select<SVGGElement, unknown>(layer)
  const behavior = zoom<SVGSVGElement, unknown>()
    .scaleExtent(SCALE_EXTENT)
    .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
      layerSel.attr('transform', event.transform.toString())
    })

  svgSel.call(behavior)

  // Centre the content at scale 1 on attach.
  const box = svg.getBoundingClientRect()
  const start = content()
  svgSel.call(behavior.transform, zoomIdentity.translate((box.width - start.width) / 2, (box.height - start.height) / 2))

  function moveTo(transform: ZoomTransform): void {
    const target = reducedMotion ? svgSel : svgSel.transition().duration(PAN_DURATION)
    target.call(behavior.transform, transform)
  }

  return {
    zoomIn() {
      svgSel.transition().duration(PAN_DURATION).call(behavior.scaleBy, 2)
    },
    zoomOut() {
      svgSel.transition().duration(PAN_DURATION).call(behavior.scaleBy, 0.5)
    },
    fit() {
      const box = svg.getBoundingClientRect()
      const { width, height } = content()
      if (width === 0 || height === 0 || box.width === 0 || box.height === 0) return
      const scale = Math.min(1, box.width / width, box.height / height)
      const tx = (box.width - width * scale) / 2
      const ty = (box.height - height * scale) / 2
      moveTo(zoomIdentity.translate(tx, ty).scale(scale))
    },
    panTo(x, y, visible, padRight = 0) {
      // x, y is the block's centre in content coordinates. Clamp the whole
      // block's screen box, plus padRight content px beside it, into `visible`.
      const t = zoomTransform(svg)
      const box = svg.getBoundingClientRect()
      const halfW = (BLOCK.w / 2) * t.k
      const halfH = (BLOCK.h / 2) * t.k
      const screenX = box.left + t.applyX(x)
      const screenY = box.top + t.applyY(y)
      const left = screenX - halfW
      const right = screenX + halfW + padRight * t.k
      const top = screenY - halfH
      const bottom = screenY + halfH
      let dx = 0
      let dy = 0
      if (left < visible.left) dx = visible.left - left
      else if (right > visible.right) dx = visible.right - right
      if (top < visible.top) dy = visible.top - top
      else if (bottom > visible.bottom) dy = visible.bottom - bottom
      if (dx === 0 && dy === 0) return
      moveTo(t.translate(dx / t.k, dy / t.k))
    },
    dispose() {
      svgSel.on('.zoom', null)
    },
  }
}
