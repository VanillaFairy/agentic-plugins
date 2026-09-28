// Word-wrap for SVG <text>, which never wraps on its own. Node names are the segment-rule
// slugs agentics uses (lower-case, digits, single dashes — no spaces), so a break opportunity
// is a space or a dash, and the dash stays at the end of the line it closes, like a hyphenation.

let measureCtx: CanvasRenderingContext2D | null = null

function measurer(): CanvasRenderingContext2D {
  if (measureCtx === null) measureCtx = document.createElement('canvas').getContext('2d')!
  return measureCtx
}

/** The `--sys` CSS variable's font stack, for a canvas `font` string matching the rendered text. */
export function sysFont(px: number, weight: number): string {
  const family = getComputedStyle(document.documentElement).getPropertyValue('--sys').trim() || 'sans-serif'
  return `${weight} ${px}px ${family}`
}

/**
 * Greedy word-wrap into at most `maxLines` lines, each within `maxWidthPx` as measured by
 * `font` (a canvas font string). Breaks after a space or a dash. Ellipsizes the last line when
 * the text doesn't fit in `maxLines`.
 */
export function wrapLines(text: string, maxWidthPx: number, font: string, maxLines = 2): string[] {
  const m = measurer()
  m.font = font
  if (m.measureText(text).width <= maxWidthPx) return [text]

  const tokens = (text.match(/[^\s-]*[\s-]?/g) ?? []).filter((t) => t !== '')
  const lines: string[] = []
  let line = ''
  let i = 0
  while (i < tokens.length && lines.length < maxLines) {
    const candidate = line + tokens[i]
    if (line !== '' && m.measureText(candidate.trimEnd()).width > maxWidthPx) {
      lines.push(line.trimEnd())
      line = ''
      continue
    }
    line = candidate
    i++
  }
  if (line !== '' && lines.length < maxLines) lines.push(line.trimEnd())

  if (i < tokens.length || lines.length > maxLines) {
    lines.length = Math.min(lines.length, maxLines)
    let last = lines[lines.length - 1] ?? ''
    while (last.length > 0 && m.measureText(last + '…').width > maxWidthPx) last = last.slice(0, -1)
    lines[lines.length - 1] = last.replace(/[\s-]+$/, '') + '…'
  }
  return lines
}

/** The rendered width of `text` under `font`. */
export function textWidth(text: string, font: string): number {
  const m = measurer()
  m.font = font
  return m.measureText(text).width
}

/** Truncates to one line with an ellipsis if `text` doesn't fit `maxWidthPx` under `font`. */
export function truncateLine(text: string, maxWidthPx: number, font: string): string {
  const m = measurer()
  m.font = font
  if (m.measureText(text).width <= maxWidthPx) return text
  let s = text
  while (s.length > 0 && m.measureText(s + '…').width > maxWidthPx) s = s.slice(0, -1)
  return s.replace(/[\s-]+$/, '') + '…'
}
