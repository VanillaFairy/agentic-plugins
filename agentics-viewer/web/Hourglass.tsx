import type { JSX } from 'preact'

// Marks a node that waits on other nodes. Renders in HTML and, given x and y, nested in the board's SVG.
export function Hourglass(props: { size: number; x?: number; y?: number }): JSX.Element {
  return (
    <svg
      class="hourglass"
      x={props.x}
      y={props.y}
      width={props.size}
      height={props.size}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      stroke-width="1.2"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M3 1.5h6L6 6l3 4.5H3L6 6Z" />
    </svg>
  )
}
