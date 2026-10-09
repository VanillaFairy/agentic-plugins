import type { ModelUsage } from '../shared/model.ts'

// `claude-opus-5-5` as Claude names it, Opus 5.5; an id it can't read stays as it is.
export function modelName(id: string): string {
  const m = /^claude-([a-z]+)-(\d{1,2})(?:-(\d{1,2}))?(?:-|$)/.exec(id)
  if (m === null || m[1] === undefined) return id
  const family = m[1].charAt(0).toUpperCase() + m[1].slice(1)
  return `${family} ${m[2]}${m[3] !== undefined ? `.${m[3]}` : ''}`
}

export function tokens(n: number): string {
  if (n < 10_000) return n.toLocaleString('en-US')
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(2)}M`
}

export function dollars(n: number): string {
  if (n > 0 && n < 0.01) return '<$0.01'
  return `$${n.toFixed(2)}`
}

function Row({ u }: { u: ModelUsage }) {
  const written = u.cacheWrite5m + u.cacheWrite1h
  return (
    <li class="usage-row">
      <div class="usage-head">
        <span class="usage-model" title={u.model}>
          {modelName(u.model)}
          {u.fast && <span class="usage-fast">fast</span>}
        </span>
        <span class="usage-cost">{u.cost === undefined ? 'no price' : dollars(u.cost)}</span>
      </div>
      <dl class="usage-grid">
        <dt>Input</dt>
        <dd>{tokens(u.input)}</dd>
        <dt>Output</dt>
        <dd>{tokens(u.output)}</dd>
        <dt>Cache read</dt>
        <dd>{tokens(u.cacheRead)}</dd>
        <dt>Cache write</dt>
        <dd title={`${tokens(u.cacheWrite5m)} for 5 minutes, ${tokens(u.cacheWrite1h)} for 1 hour`}>
          {tokens(written)}
          {written > 0 && <span class="usage-ttl">{u.cacheWrite1h >= u.cacheWrite5m ? '1h' : '5m'}</span>}
        </dd>
        <dt>API calls</dt>
        <dd>{u.messages}</dd>
      </dl>
    </li>
  )
}

export function UsageList({ rows }: { rows: ModelUsage[] }) {
  if (rows.length === 0) return <p class="quiet-inline">No model calls recorded yet.</p>
  const priced = rows.filter(r => r.cost !== undefined)
  const total = priced.reduce((sum, r) => sum + (r.cost ?? 0), 0)
  return (
    <>
      <ul class="usage">
        {rows.map(u => (
          <Row key={`${u.model}|${u.fast}`} u={u} />
        ))}
      </ul>
      {rows.length > 1 && (
        <p class="usage-total">
          <span>Total</span>
          <span>
            {dollars(total)}
            {priced.length < rows.length && ' and models with no price'}
          </span>
        </p>
      )}
    </>
  )
}
