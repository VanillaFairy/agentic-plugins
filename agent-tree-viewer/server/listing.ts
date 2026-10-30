// The session list, kept fresh on a thread of its own. A listing makes thousands of file system
// calls and takes the better part of a second, which on the server's thread would hold up every
// request and every stream for as long.

import { Worker } from 'node:worker_threads'
import type { ProjectGroup } from '../shared/model.ts'
import type { SessionFiles, SessionRow } from './sessions.ts'

export type ListingOptions = {
  projectsDir: string
  desktopDir: string
  maxAgeMs: number
  // Where each running Claude Code process keeps its `<pid>.json`.
  pidDir: string
}

export type Listed = {
  groups: ProjectGroup[]
  files: Map<string, SessionFiles>
  rows: Map<string, SessionRow>
  parents: Map<string, string>
}

export class Listing {
  private readonly worker: Worker
  private latest: Listed | undefined
  private waiting: (() => void)[] = []

  constructor(options: ListingOptions) {
    this.worker = new Worker(new URL('./listing-worker.ts', import.meta.url), { workerData: options })
    this.worker.on('message', (listed: Listed) => {
      this.latest = listed
      for (const done of this.waiting.splice(0)) done()
    })
    this.worker.on('error', err => console.error('agent-tree-viewer: the listing thread failed', err))
  }

  // Resolves when the next listing arrives.
  next(): Promise<void> {
    return new Promise(done => this.waiting.push(done))
  }

  // The latest listing, waiting for the first one if none has arrived.
  async groups(): Promise<ProjectGroup[]> {
    if (this.latest === undefined) await this.next()
    return this.latest?.groups ?? []
  }

  // The project a session is listed under, in the latest listing.
  groupOf(id: string): ProjectGroup | undefined {
    return this.latest?.groups.find(g => g.sessions.some(s => s.id === id))
  }

  // The session whose agentics run dispatched this one, as the latest listing found it.
  parentOf(id: string): string | undefined {
    return this.latest?.parents.get(id)
  }

  // The files of a session the latest listing found.
  find(id: string): { files: SessionFiles; row: SessionRow } | undefined {
    const files = this.latest?.files.get(id)
    const row = this.latest?.rows.get(id)
    return files && row ? { files, row } : undefined
  }

  close(): Promise<number> {
    return this.worker.terminate()
  }
}
