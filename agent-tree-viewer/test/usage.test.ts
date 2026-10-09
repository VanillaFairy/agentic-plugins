import { describe, expect, it } from 'vitest'
import { estimateCost } from '../server/pricing.ts'
import { emptyFacts, ingest, sumUsage } from '../server/transcript.ts'
import { modelName } from '../web/Usage.tsx'

const reply = (id: string, model: string, usage: object, s = 0) => ({
  type: 'assistant',
  timestamp: new Date(Date.UTC(2026, 9, 9, 10, 0, s)).toISOString(),
  message: { id, model, usage, content: [{ type: 'text', text: 'x' }] },
})

const usage = (input: number, output: number, read: number, w5m: number, w1h: number, extra: object = {}) => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: read,
  cache_creation_input_tokens: w5m + w1h,
  cache_creation: { ephemeral_5m_input_tokens: w5m, ephemeral_1h_input_tokens: w1h },
  ...extra,
})

function factsOf(...entries: object[]) {
  const f = emptyFacts()
  for (const e of entries) ingest(f, e)
  return f
}

describe('sumUsage', () => {
  it('counts a response once however many entries repeat its usage, and keeps models apart', () => {
    const once = usage(10, 20, 300, 40, 50)
    const f = factsOf(reply('m1', 'claude-opus-5-5', once), reply('m1', 'claude-opus-5-5', once), reply('m2', 'claude-opus-5-5', once), reply('m3', 'claude-haiku-4-5', usage(1, 2, 3, 4, 0)))
    const rows = sumUsage([f])
    const opus = rows.find(r => r.model === 'claude-opus-5-5')
    expect(opus).toMatchObject({ messages: 2, input: 20, output: 40, cacheRead: 600, cacheWrite5m: 80, cacheWrite1h: 100 })
    expect(rows.find(r => r.model === 'claude-haiku-4-5')?.messages).toBe(1)
  })

  it('takes every cache write as the 5-minute kind when the transcript has no breakdown', () => {
    const f = factsOf(reply('m1', 'claude-opus-5-5', { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 70 }))
    expect(sumUsage([f])[0]).toMatchObject({ cacheWrite5m: 70, cacheWrite1h: 0 })
  })

  it('leaves out messages Claude Code wrote itself', () => {
    expect(sumUsage([factsOf(reply('m1', '<synthetic>', usage(1, 1, 0, 0, 0)))])).toEqual([])
  })

  it('totals the transcripts it is given, the costliest model first', () => {
    const a = factsOf(reply('a', 'claude-haiku-4-5', usage(1000, 0, 0, 0, 0)))
    const b = factsOf(reply('b', 'claude-fable-5-1', usage(1000, 0, 0, 0, 0)))
    expect(sumUsage([a, b]).map(r => r.model)).toEqual(['claude-fable-5-1', 'claude-haiku-4-5'])
  })
})

describe('estimateCost', () => {
  const base = { messages: 1, fast: false, input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 }
  const million = 1_000_000

  it('prices each kind of token against the model input price', () => {
    const opus = { ...base, model: 'claude-opus-5-5' }
    const input = estimateCost({ ...opus, input: million })!
    expect(estimateCost({ ...opus, cacheWrite5m: million })).toBeCloseTo(input * 1.25)
    expect(estimateCost({ ...opus, cacheWrite1h: million })).toBeCloseTo(input * 2)
    expect(estimateCost({ ...opus, output: million })).toBeGreaterThan(input)
  })

  it('uses a model own cache-read rate where it has one, a tenth of input otherwise', () => {
    const sonnet = { ...base, model: 'claude-sonnet-5-5' }
    expect(estimateCost({ ...sonnet, cacheRead: million })).toBeCloseTo(estimateCost({ ...sonnet, input: million })! / 10)
    const opus = { ...base, model: 'claude-opus-5-5' }
    expect(estimateCost({ ...opus, cacheRead: million })).toBeLessThan(estimateCost({ ...opus, input: million })! / 10)
  })

  it('doubles everything in fast mode, matches dated ids, and gives no price for an unknown model', () => {
    const plain = estimateCost({ ...base, model: 'claude-opus-5-5', input: million, output: million })!
    expect(estimateCost({ ...base, model: 'claude-opus-5-5', fast: true, input: million, output: million })).toBeCloseTo(plain * 2)
    expect(estimateCost({ ...base, model: 'claude-opus-4-1-20250805', input: million })).not.toBe(estimateCost({ ...base, model: 'claude-opus-4-5', input: million }))
    expect(estimateCost({ ...base, model: 'some-other-model', input: million })).toBeUndefined()
  })
})

describe('modelName', () => {
  it('names a model the way Claude does', () => {
    expect(modelName('claude-opus-5-5')).toBe('Opus 5.5')
    expect(modelName('claude-sonnet-4-5-20250929')).toBe('Sonnet 4.5')
    expect(modelName('claude-fable-5')).toBe('Fable 5')
    expect(modelName('gpt-x')).toBe('gpt-x')
  })
})
