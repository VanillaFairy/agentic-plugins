import type { JSX } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import type { Tile, Counts } from './model.ts'
import { tileKey, addAck } from './model.ts'
import './annunciator.css'

const ACK_KEY = 'agentics-viewer:ack'

function readAcks(): string[] {
  try {
    const raw = localStorage.getItem(ACK_KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as string[]) : []
  } catch {
    return []
  }
}

function writeAcks(acks: string[]): void {
  try {
    localStorage.setItem(ACK_KEY, JSON.stringify(acks))
  } catch {
    // storage unavailable: tiles simply flash until they clear
  }
}

export function Annunciator(props: {
  tiles: Tile[]
  counts: Counts
  project: string
  effort: string
  onSelect: (id: string) => void
  selected: string | null
}): JSX.Element {
  const [acks, setAcks] = useState<string[]>(() => readAcks())

  function ack(key: string): void {
    setAcks((prev) => {
      if (prev.includes(key)) return prev
      const next = addAck(prev, key)
      writeAcks(next)
      return next
    })
  }

  // Selecting a tile's node elsewhere (board, outline, URL) acknowledges it too.
  useEffect(() => {
    if (props.selected === null) return
    const tile = props.tiles.find((t) => t.node === props.selected)
    if (!tile) return
    ack(tileKey(props.project, props.effort, tile))
  }, [props.selected, props.tiles, props.project, props.effort])

  function handleClick(tile: Tile): void {
    ack(tileKey(props.project, props.effort, tile))
    props.onSelect(tile.node)
  }

  return (
    <div class="ann" aria-label="Needs you">
      {props.tiles.map((tile) => {
        const key = tileKey(props.project, props.effort, tile)
        const acked = acks.includes(key)
        return (
          <button
            key={key}
            type="button"
            class={`tile ${tile.kind}${acked ? '' : ' unack'}`}
            onClick={() => handleClick(tile)}
          >
            <span class="glyph"></span>
            <span class="who">{tile.title}</span>
            <span class="why">{tile.why}</span>
          </button>
        )
      })}
      <div class="calm">
        <span>
          <i class="lamp l-work"></i>
          {props.counts.working} working
        </span>
        <span>
          <i class="lamp l-done"></i>
          {props.counts.merged} merged
        </span>
        <span>
          <i class="lamp l-idle"></i>
          {props.counts.queued} queued
        </span>
        <span>
          <i class="lamp l-open"></i>
          {props.counts.needDesign} need design
        </span>
      </div>
    </div>
  )
}
