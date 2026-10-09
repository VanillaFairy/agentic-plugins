// Finds the sessions on this machine and names them the way Claude does: grouped by the
// project folder they run in, titled with the name the app shows.
//
// Titles and folders come first from the desktop app's own session records, then from what the
// transcript itself records (a title the person gave it, the agent name, the AI-made title),
// and last from the session's first prompt.

import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { ProjectGroup, SessionSummary } from '../shared/model.ts'
import { parseLines } from './tail.ts'

const HEAD_BYTES = 64 * 1024
const TAIL_BYTES = 256 * 1024
const SESSION_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/i
const DESKTOP_FILE = /^local_.*\.json$/
const PROMPT_CHARS = 80

export type TitleHints = {
  desktop?: string
  custom?: string
  agentName?: string
  ai?: string
  prompt?: string
}

export function pickTitle(h: TitleHints): string {
  for (const title of [h.desktop, h.custom, h.agentName, h.ai, h.prompt]) {
    if (title !== undefined && title.trim() !== '') return title.trim()
  }
  return 'Untitled session'
}

// What a transcript says about itself: where it runs and what it is called.
export type TranscriptHints = { cwd?: string; custom?: string; agentName?: string; ai?: string; prompt?: string }

const record = (v: unknown): Record<string, unknown> | undefined =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined

function promptOf(entry: Record<string, unknown>): string | undefined {
  if (entry.type !== 'user' || entry.isMeta === true || entry.isSidechain === true) return undefined
  const content = record(entry.message)?.content
  const text =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.map(part => (record(part)?.type === 'text' ? String(record(part)?.text ?? '') : '')).join(' ')
        : ''
  const flat = text.replace(/\s+/g, ' ').trim()
  // Commands, hook output and harness notes start with a tag; a person's prompt does not.
  if (flat === '' || flat.startsWith('<')) return undefined
  return flat.length > PROMPT_CHARS ? flat.slice(0, PROMPT_CHARS - 1) + '…' : flat
}

// Later entries win, since a session can be renamed; the first prompt and folder stay the first.
export function readHints(entries: readonly unknown[], into: TranscriptHints = {}): TranscriptHints {
  for (const raw of entries) {
    const e = record(raw)
    if (e === undefined) continue
    if (into.cwd === undefined && typeof e.cwd === 'string') into.cwd = e.cwd
    if (e.type === 'custom-title' && typeof e.customTitle === 'string') into.custom = e.customTitle
    if (e.type === 'agent-name' && typeof e.agentName === 'string') into.agentName = e.agentName
    if (e.type === 'ai-title' && typeof e.aiTitle === 'string') into.ai = e.aiTitle
    if (into.prompt === undefined) into.prompt = promptOf(e)
  }
  return into
}

export type SessionRow = SessionSummary & { path: string }

const keyOf = (path: string) => path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
const folderName = (path: string) => basename(path.replace(/[\\/]+$/, '')) || path

// Groups sessions by project folder, newest first at both levels. Two folders with the same
// name get their parent folder's name added, so the picker never shows two alike.
export function groupSessions(rows: readonly SessionRow[]): ProjectGroup[] {
  const groups = new Map<string, ProjectGroup>()
  for (const { path, ...session } of [...rows].sort((a, b) => b.lastAt - a.lastAt)) {
    const key = keyOf(path)
    const group = groups.get(key) ?? { path, name: folderName(path), sessions: [] }
    group.sessions.push(session)
    groups.set(key, group)
  }
  const all = [...groups.values()]
  const count = new Map<string, number>()
  for (const g of all) count.set(g.name.toLowerCase(), (count.get(g.name.toLowerCase()) ?? 0) + 1)
  for (const g of all) {
    if ((count.get(g.name.toLowerCase()) ?? 0) > 1) g.name = `${g.name} (${folderName(dirname(g.path))})`
  }
  return all
}

type DesktopRecord = { title?: string; cwd?: string; archived: boolean }

function readSlice(file: string, from: 'head' | 'tail', size: number, bytes: number): unknown[] {
  const length = Math.min(size, bytes)
  const start = from === 'head' ? 0 : size - length
  const buf = Buffer.alloc(length)
  const fd = openSync(file, 'r')
  try {
    readSync(fd, buf, 0, length, start)
  } finally {
    closeSync(fd)
  }
  const lines = buf.toString('utf8').split('\n')
  // A slice cuts a line at each end it does not share with the file.
  if (start + length < size) lines.pop()
  if (start > 0) lines.shift()
  return parseLines(lines)
}

function newestUnder(dir: string): number {
  try {
    return Math.max(0, ...readdirSync(dir).map(name => statSync(join(dir, name)).mtimeMs))
  } catch {
    return 0
  }
}

export type SessionFiles = { id: string; main: string; dir: string }

export type IndexOptions = {
  projectsDir: string
  desktopDir: string
  // Sessions untouched for longer than this are left out of the picker.
  maxAgeMs: number
  liveMs: number
}

export class SessionIndex {
  private hints = new Map<string, { stamp: string; hints: TranscriptHints }>()
  private desktop = new Map<string, { stamp: number; id?: string; rec: DesktopRecord }>()
  private files = new Map<string, SessionFiles>()
  private rows = new Map<string, SessionRow>()

  private readonly opts: IndexOptions

  constructor(opts: IndexOptions) {
    this.opts = opts
  }

  private desktopRecords(): Map<string, DesktopRecord> {
    const byCliId = new Map<string, DesktopRecord>()
    const seen = new Set<string>()
    const walk = (dir: string, depth: number): void => {
      let names: string[]
      try {
        names = readdirSync(dir)
      } catch {
        return
      }
      for (const name of names) {
        const full = join(dir, name)
        if (depth < 2) {
          if (statSync(full, { throwIfNoEntry: false })?.isDirectory()) walk(full, depth + 1)
          continue
        }
        if (!DESKTOP_FILE.test(name)) continue
        seen.add(full)
        const stamp = statSync(full, { throwIfNoEntry: false })?.mtimeMs ?? 0
        let cached = this.desktop.get(full)
        if (cached?.stamp !== stamp) {
          cached = { stamp, rec: { archived: false } }
          try {
            const r = JSON.parse(readFileSync(full, 'utf8')) as Record<string, unknown>
            cached = {
              stamp,
              ...(typeof r.cliSessionId === 'string' ? { id: r.cliSessionId } : {}),
              rec: {
                ...(typeof r.title === 'string' ? { title: r.title } : {}),
                ...(typeof r.originCwd === 'string' ? { cwd: r.originCwd } : typeof r.cwd === 'string' ? { cwd: r.cwd } : {}),
                archived: r.isArchived === true,
              },
            }
          } catch {
            // Mid-write; the next scan reads it again.
          }
          this.desktop.set(full, cached)
        }
        if (cached.id !== undefined) byCliId.set(cached.id, cached.rec)
      }
    }
    walk(this.opts.desktopDir, 0)
    for (const key of this.desktop.keys()) if (!seen.has(key)) this.desktop.delete(key)
    return byCliId
  }

  private transcriptHints(file: string, size: number, mtime: number, dir: string): TranscriptHints {
    const stamp = `${size}:${mtime}`
    const cached = this.hints.get(file)
    if (cached?.stamp === stamp) return cached.hints
    const hints = readHints(readSlice(file, 'head', size, HEAD_BYTES))
    if (size > HEAD_BYTES) readHints(readSlice(file, 'tail', size, TAIL_BYTES), hints)
    const titleFile = join(dir, 'custom-title.json')
    if (existsSync(titleFile)) {
      try {
        const t = (JSON.parse(readFileSync(titleFile, 'utf8')) as Record<string, unknown>).customTitle
        if (typeof t === 'string') hints.custom = t
      } catch {
        // Mid-write; the transcript's own title stands.
      }
    }
    this.hints.set(file, { stamp, hints })
    return hints
  }

  list(now: number): ProjectGroup[] {
    const desktop = this.desktopRecords()
    const rows: SessionRow[] = []
    const files = new Map<string, SessionFiles>()
    let projectDirs: string[]
    try {
      projectDirs = readdirSync(this.opts.projectsDir)
    } catch {
      projectDirs = []
    }
    for (const project of projectDirs) {
      const projectDir = join(this.opts.projectsDir, project)
      let names: string[]
      try {
        names = readdirSync(projectDir).filter(name => SESSION_FILE.test(name))
      } catch {
        continue
      }
      for (const name of names) {
        const main = join(projectDir, name)
        const stat = statSync(main, { throwIfNoEntry: false })
        if (stat === undefined || now - stat.mtimeMs > this.opts.maxAgeMs) continue
        const id = name.slice(0, -'.jsonl'.length)
        const dir = join(projectDir, id)
        const rec = desktop.get(id)
        if (rec?.archived) continue
        const hints = this.transcriptHints(main, stat.size, stat.mtimeMs, dir)
        // A transcript with nothing said in it is a session that never started.
        if (rec === undefined && hints.prompt === undefined && hints.custom === undefined) continue
        const lastAt = Math.max(stat.mtimeMs, newestUnder(join(dir, 'subagents')))
        const title = pickTitle({ desktop: rec?.title, ...hints })
        files.set(id, { id, main, dir })
        rows.push({ id, title, lastAt, live: now - lastAt < this.opts.liveMs, path: rec?.cwd ?? hints.cwd ?? project })
      }
    }
    this.files = files
    this.rows = new Map(rows.map(r => [r.id, r]))
    return groupSessions(rows)
  }

  // The files of a session the last listing found.
  find(id: string): { files: SessionFiles; row: SessionRow } | undefined {
    const files = this.files.get(id)
    const row = this.rows.get(id)
    return files && row ? { files, row } : undefined
  }
}
