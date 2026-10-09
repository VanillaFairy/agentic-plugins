import type { JSX } from 'preact'
import type { Spend as SpendFigures } from '../shared/snapshot.ts'
import { spendView } from './model.ts'

/** Cost, tokens and dispatches on one line; given `by_model`, the tokens open a per-model breakdown on hover or focus. */
export function Spend(props: { spend: SpendFigures & { by_model?: Record<string, SpendFigures> }; tip: 'below' | 'above' }): JSX.Element {
  const v = spendView(props.spend)
  if (v.cost === null) return <span class="spend">{v.dispatches}</span>
  return (
    <span class="spend">
      <b>{v.cost}</b>
      <span class="spend-tokens" tabIndex={0}>
        {v.tokens}
        {v.rows.length > 0 && (
          <table class={`spend-tip ${props.tip}`}>
            <thead>
              <tr>
                <th>Model</th>
                <th>Dispatches</th>
                <th>Tokens</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {v.rows.map((r) => (
                <tr key={r.model}>
                  <th>{r.model}</th>
                  <td>{r.dispatches}</td>
                  <td>{r.tokens}</td>
                  <td>{r.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </span>
      <span>{v.dispatches}</span>
    </span>
  )
}
