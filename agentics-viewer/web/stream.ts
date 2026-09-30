import type { EffortsList, Snapshot, Problem } from '../shared/snapshot.ts'

export interface UrlState {
  project: string | null
  effort: string | null
  node: string | null
}

export function readUrlState(search: string): UrlState {
  const params = new URLSearchParams(search)
  return {
    project: params.get('project'),
    effort: params.get('effort'),
    node: params.get('node'),
  }
}

export function urlFor(state: UrlState): string {
  const parts: string[] = []
  if (state.project !== null) parts.push(`project=${encodeURIComponent(state.project)}`)
  if (state.effort !== null) parts.push(`effort=${encodeURIComponent(state.effort)}`)
  if (state.node !== null) parts.push(`node=${encodeURIComponent(state.node)}`)
  return `?${parts.join('&')}`
}

export interface StreamHandlers {
  efforts(e: { list: EffortsList; selected: string | null }): void
  snapshot(s: Snapshot): void
  problem(p: Problem): void
  stale(p: Problem): void
  connection(up: boolean): void
  // The server came back as another version than the one this stream first met.
  updated(): void
}

export interface EventSourceLike {
  addEventListener(type: string, fn: (e: { data?: string }) => void): void
  close(): void
}

export function openStream(
  project: string,
  effort: string | null,
  h: StreamHandlers,
  make: (url: string) => EventSourceLike = (u) => new EventSource(u),
): () => void {
  let url = `/api/stream?project=${encodeURIComponent(project)}`
  if (effort !== null) url += `&effort=${encodeURIComponent(effort)}`
  const source = make(url)
  let serverVersion: string | null = null
  source.addEventListener('hello', (e) => {
    const { version } = JSON.parse(e.data!) as { version: string }
    if (serverVersion === null) serverVersion = version
    else if (version !== serverVersion) h.updated()
  })
  source.addEventListener('open', () => h.connection(true))
  source.addEventListener('error', () => h.connection(false))
  source.addEventListener('efforts', (e) => h.efforts(JSON.parse(e.data!)))
  source.addEventListener('snapshot', (e) => h.snapshot(JSON.parse(e.data!)))
  source.addEventListener('problem', (e) => h.problem(JSON.parse(e.data!)))
  source.addEventListener('stale', (e) => h.stale(JSON.parse(e.data!)))
  return () => source.close()
}
