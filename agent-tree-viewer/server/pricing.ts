// Anthropic's first-party list prices, in dollars per million tokens, for estimating what a
// transcript's model calls cost. Cache writes cost 1.25× the input price for the 5-minute TTL
// and 2× for the 1-hour TTL; cache reads cost 0.1× input unless a model lists its own rate.

import type { ModelUsage } from '../shared/model.ts'

type Price = { input: number; output: number; cacheRead?: number }

// Longest prefix wins, so `claude-opus-4-1` is not priced as `claude-opus-4`.
const PRICES: Record<string, Price> = {
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25 },
  'claude-mythos-5-1': { input: 10, output: 50, cacheRead: 0.25 },
  'claude-fable-5': { input: 10, output: 50 },
  'claude-mythos-5': { input: 10, output: 50 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-opus-4-5': { input: 5, output: 25 },
  'claude-opus-4-1': { input: 15, output: 75 },
  'claude-opus-4': { input: 15, output: 75 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-sonnet-4': { input: 3, output: 15 },
  'claude-3-7-sonnet': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-3-5-haiku': { input: 0.8, output: 4 },
}
const WRITE_5M = 1.25
const WRITE_1H = 2
const READ = 0.1
// Fast mode bills every token at twice the standard rate.
const FAST = 2

function priceOf(model: string): Price | undefined {
  const key = Object.keys(PRICES)
    .filter(prefix => model.startsWith(prefix))
    .sort((a, b) => b.length - a.length)[0]
  return key === undefined ? undefined : PRICES[key]
}

// Undefined for a model with no listed price.
export function estimateCost(u: Omit<ModelUsage, 'cost'>): number | undefined {
  const p = priceOf(u.model)
  if (p === undefined) return undefined
  const perToken = (dollars: number) => (dollars * (u.fast ? FAST : 1)) / 1_000_000
  return (
    u.input * perToken(p.input) +
    u.output * perToken(p.output) +
    u.cacheWrite5m * perToken(p.input * WRITE_5M) +
    u.cacheWrite1h * perToken(p.input * WRITE_1H) +
    u.cacheRead * perToken(p.cacheRead ?? p.input * READ)
  )
}
