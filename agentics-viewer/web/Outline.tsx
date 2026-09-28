import type { JSX } from 'preact'
import { useState } from 'preact/hooks'
import type { BoardModel } from './model.ts'
import { visibleRows, moveSelection } from './model.ts'
import { Hourglass } from './Hourglass.tsx'

export function Outline(props: {
  model: BoardModel
  selected: string | null
  onSelect: (id: string) => void
}): JSX.Element {
  const [filter, setFilter] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())

  const rows = visibleRows(props.model, filter, collapsed)

  function toggle(id: string): void {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function collapse(id: string): void {
    setCollapsed((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }

  function expand(id: string): void {
    setCollapsed((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  function onKeyDown(e: JSX.TargetedKeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = moveSelection(rows, props.selected, e.key === 'ArrowDown' ? 'down' : 'up')
      if (next !== null) props.onSelect(next)
      return
    }
    if (e.key === 'ArrowLeft') {
      if (props.selected !== null && (props.model.nodes.get(props.selected)?.children.length ?? 0) > 0) {
        e.preventDefault()
        collapse(props.selected)
      }
      return
    }
    if (e.key === 'ArrowRight') {
      if (props.selected !== null && (props.model.nodes.get(props.selected)?.children.length ?? 0) > 0) {
        e.preventDefault()
        expand(props.selected)
      }
      return
    }
    if (e.key === 'Enter') {
      if (props.selected !== null) props.onSelect(props.selected)
    }
  }

  return (
    <nav class="rail" aria-label="Nodes">
      <input
        class="find"
        placeholder="Find a node"
        value={filter}
        onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
      />
      <div role="tree" onKeyDown={onKeyDown}>
        {rows.map((id) => {
          const view = props.model.nodes.get(id)!
          const isFolder = view.children.length > 0
          const isCollapsed = collapsed.has(id)
          const isSelected = props.selected === id
          const isBlocked = view.blockedBy.length > 0
          const blockedTitle = isBlocked
            ? `, waits on ${view.blockedBy.map((d) => props.model.nodes.get(d)?.name ?? d).join(', ')}`
            : ''
          return (
            <div
              key={id}
              role="treeitem"
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              class={`row${isSelected ? ' sel' : ''}${view.lamp === 'done' ? ' done' : ''}${isBlocked ? ' blocked' : ''}`}
              style={{ paddingLeft: `${12 * (view.depth + 1)}px` }}
              title={`${view.name}, ${view.wording}${blockedTitle}`}
              onClick={() => props.onSelect(id)}
            >
              <span class="nm">
                {isFolder && (
                  <button
                    type="button"
                    class="chev"
                    aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggle(id)
                    }}
                  >
                    {isCollapsed ? '▸' : '▾'}
                  </button>
                )}
                {view.name}
              </span>
              {view.status !== '' ? (
                <span class={`st badge t-${view.lamp}`}>{view.status}</span>
              ) : (
                <span class="st facts">{view.facts.join(', ')}</span>
              )}
              {isBlocked && (
                <span class="wait">
                  <Hourglass size={11} />
                  {view.blockedBy.length}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </nav>
  )
}
