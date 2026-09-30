import { describe, expect, test } from 'vitest'
import { readUrlState, urlFor, openStream } from '../web/stream.ts'
import type { EventSourceLike, StreamHandlers } from '../web/stream.ts'

class FakeEventSource implements EventSourceLike {
  listeners = new Map<string, (e: { data?: string }) => void>()
  closed = false
  url: string
  constructor(url: string) {
    this.url = url
  }
  addEventListener(type: string, fn: (e: { data?: string }) => void): void {
    this.listeners.set(type, fn)
  }
  close(): void {
    this.closed = true
  }
  fire(type: string, data?: string): void {
    this.listeners.get(type)?.({ data })
  }
}

function noopHandlers(): StreamHandlers {
  return {
    efforts() {},
    snapshot() {},
    problem() {},
    stale() {},
    connection() {},
    updated() {},
  }
}

function withSource(effort: string | null = null): { source: FakeEventSource; close: () => void; h: StreamHandlers } {
  let source!: FakeEventSource
  const h = noopHandlers()
  const close = openStream('p', effort, h, (url) => (source = new FakeEventSource(url)))
  return { source, close, h }
}

describe('readUrlState', () => {
  test('url state decodes', () => {
    const s = readUrlState('?project=C%3A%5Cwork%5Cx&effort=e&node=a%2Fb')
    expect(s).toEqual({ project: 'C:\\work\\x', effort: 'e', node: 'a/b' })
  })

  test('missing params are null', () => {
    expect(readUrlState('')).toEqual({ project: null, effort: null, node: null })
  })
})

describe('urlFor', () => {
  test('urlFor omits nulls', () => {
    expect(urlFor({ project: 'p', effort: null, node: null })).toBe('?project=p')
  })

  test('urlFor round-trips', () => {
    const state = { project: 'C:\\My Work', effort: 'e 1', node: 'a/b' }
    expect(readUrlState(urlFor(state))).toEqual(state)
  })
})

describe('openStream', () => {
  test('the stream url encodes the project and omits a null effort', () => {
    let source!: FakeEventSource
    openStream('C:\\My Work', null, noopHandlers(), (url) => (source = new FakeEventSource(url)))
    expect(source.url).toBe('/api/stream?project=C%3A%5CMy%20Work')
  })

  test('the stream url carries the effort', () => {
    let source!: FakeEventSource
    openStream('C:\\My Work', 'my effort', noopHandlers(), (url) => (source = new FakeEventSource(url)))
    expect(source.url).toBe('/api/stream?project=C%3A%5CMy%20Work&effort=my%20effort')
  })

  test('efforts events reach their handler', () => {
    const payload = { list: { repo: 'r', store: 's', store_present: true, efforts: [], notes: '' }, selected: null }
    let received: unknown = null
    const h = { ...noopHandlers(), efforts: (e: unknown) => { received = e } }
    let source!: FakeEventSource
    openStream('p', null, h, (url) => (source = new FakeEventSource(url)))
    source.fire('efforts', JSON.stringify(payload))
    expect(received).toEqual(payload)
  })

  test('snapshot events reach their handler', () => {
    const payload = { store: '/s', effort: 'e', about: '', seq_max: 1, malformed: 0, folders: [], nodes: [] }
    let received: unknown = null
    const h = { ...noopHandlers(), snapshot: (s: unknown) => { received = s } }
    let source!: FakeEventSource
    openStream('p', null, h, (url) => (source = new FakeEventSource(url)))
    source.fire('snapshot', JSON.stringify(payload))
    expect(received).toEqual(payload)
  })

  test('problem events reach their handler', () => {
    const payload = { code: 'project_gone', path: 'C:\\x' }
    let received: unknown = null
    const h = { ...noopHandlers(), problem: (p: unknown) => { received = p } }
    let source!: FakeEventSource
    openStream('p', null, h, (url) => (source = new FakeEventSource(url)))
    source.fire('problem', JSON.stringify(payload))
    expect(received).toEqual(payload)
  })

  test('stale events reach their handler', () => {
    const payload = { code: 'snapshot_failed', detail: 'timed out' }
    let received: unknown = null
    const h = { ...noopHandlers(), stale: (p: unknown) => { received = p } }
    let source!: FakeEventSource
    openStream('p', null, h, (url) => (source = new FakeEventSource(url)))
    source.fire('stale', JSON.stringify(payload))
    expect(received).toEqual(payload)
  })

  test('connection state follows the source', () => {
    const states: boolean[] = []
    const h = { ...noopHandlers(), connection: (up: boolean) => { states.push(up) } }
    let source!: FakeEventSource
    openStream('p', null, h, (url) => (source = new FakeEventSource(url)))
    source.fire('open')
    source.fire('error')
    expect(states).toEqual([true, false])
  })

  test('a reconnect to another server version reports an update, the same version does not', () => {
    let updates = 0
    const h = { ...noopHandlers(), updated: () => { updates++ } }
    let source!: FakeEventSource
    openStream('p', null, h, (url) => (source = new FakeEventSource(url)))
    source.fire('hello', JSON.stringify({ version: '1.0.0' }))
    source.fire('hello', JSON.stringify({ version: '1.0.0' }))
    expect(updates).toBe(0)
    source.fire('hello', JSON.stringify({ version: '1.1.0' }))
    expect(updates).toBe(1)
  })

  test('the close function closes the source', () => {
    const { source, close } = withSource()
    close()
    expect(source.closed).toBe(true)
  })
})
