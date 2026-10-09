// Follows one session's transcripts as they grow and rebuilds its agent tree from them.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { NodeDetail, Project, SessionSnapshot } from '../shared/model.ts'
import { JsonlTail } from './tail.ts'
import type { SessionFiles } from './sessions.ts'
import { buildSnapshot, emptyFacts, ingest, nodeDetail } from './transcript.ts'
import type { AgentMeta, FileFacts } from './transcript.ts'

const META = /^agent-(.+)\.meta\.json$/

type Followed = { tail: JsonlTail; facts: FileFacts }

function follow(path: string): Followed {
  return { tail: new JsonlTail(path), facts: emptyFacts() }
}

function catchUp(f: Followed): void {
  const { entries, restarted } = f.tail.read()
  if (restarted) f.facts = emptyFacts()
  for (const entry of entries) ingest(f.facts, entry)
}

function readMeta(path: string): AgentMeta | undefined {
  try {
    const r = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    const pick = (key: string) => (typeof r[key] === 'string' ? { [key]: r[key] as string } : {})
    return { ...pick('agentType'), ...pick('description'), ...pick('toolUseId') }
  } catch {
    return undefined
  }
}

export class SessionWatch {
  private main: Followed
  private agents = new Map<string, Followed & { meta: AgentMeta }>()

  private readonly files: SessionFiles
  private readonly staleMs: number

  constructor(files: SessionFiles, staleMs: number) {
    this.files = files
    this.staleMs = staleMs
    this.main = follow(files.main)
  }

  // Agents a Workflow ran keep their transcripts one folder down, in `workflows/<run id>/`.
  private discoverAgents(): void {
    const root = join(this.files.dir, 'subagents')
    const scan = (dir: string, workflow: string | undefined): void => {
      let names: string[]
      try {
        names = readdirSync(dir)
      } catch {
        return
      }
      for (const name of names) {
        if (workflow === undefined && name === 'workflows') {
          for (const run of readdirSync(join(dir, name))) scan(join(dir, name, run), run)
          continue
        }
        const id = META.exec(name)?.[1]
        if (id === undefined || this.agents.has(id)) continue
        const meta = readMeta(join(dir, name))
        // Still being written; the next poll reads it.
        if (meta === undefined) continue
        this.agents.set(id, { ...follow(join(dir, `agent-${id}.jsonl`)), meta: workflow === undefined ? meta : { ...meta, workflow } })
      }
    }
    scan(root, undefined)
  }

  private catchUpAll(): void {
    catchUp(this.main)
    this.discoverAgents()
    for (const agent of this.agents.values()) catchUp(agent)
  }

  // Everything one card's transcript says; undefined for an agent this session never had.
  detail(id: string): NodeDetail | undefined {
    this.catchUpAll()
    if (id === 'main') return nodeDetail(id, this.main.facts, [this.main.facts, ...[...this.agents.values()].map(a => a.facts)])
    const agent = this.agents.get(id)
    return agent === undefined ? undefined : nodeDetail(id, agent.facts)
  }

  snapshot(now: number, title: string, project: Project): SessionSnapshot {
    this.catchUpAll()
    return buildSnapshot({
      id: this.files.id,
      title,
      project,
      now,
      staleMs: this.staleMs,
      main: this.main.facts,
      agents: [...this.agents].map(([id, a]) => ({ id, meta: a.meta, facts: a.facts, mtime: a.tail.mtime })),
    })
  }
}
