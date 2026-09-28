import { select } from 'd3-selection'
import { zoom, zoomIdentity, zoomTransform, type D3ZoomEvent, type ZoomTransform } from 'd3-zoom'
import 'd3-transition'

export interface ZoomControl {
  zoomIn(): void
  zoomOut(): void
  fit(): void
  panTo(x: number, y: number, visible: DOMRect): void
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
    panTo(x, y, visible) {
      const t = zoomTransform(svg)
      const box = svg.getBoundingClientRect()
      const screenX = box.left + t.applyX(x)
      const screenY = box.top + t.applyY(y)
      let dx = 0
      let dy = 0
      if (screenX < visible.left) dx = visible.left - screenX
      else if (screenX > visible.right) dx = visible.right - screenX
      if (screenY < visible.top) dy = visible.top - screenY
      else if (screenY > visible.bottom) dy = visible.bottom - screenY
      if (dx === 0 && dy === 0) return
      moveTo(t.translate(dx / t.k, dy / t.k))
    },
    dispose() {
      svgSel.on('.zoom', null)
    },
  }
}
