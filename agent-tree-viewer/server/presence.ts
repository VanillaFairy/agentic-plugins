// What each running Claude Code process says it is doing. Every process keeps
// `~/.claude/sessions/<pid>.json` and rewrites its `status` on every change:
//
// - busy: a turn runs (the model thinks or a tool runs), or a background agent or workflow does
// - shell: the turn is over, but a background shell still runs
// - waiting: a permission prompt, an MCP input or a dialog waits on the person; `waitingFor` says which
// - idle: nothing runs
//
// A process can die without removing its file, and Windows reuses pids, so a file counts only
// while its pid runs with the creation time the file records in `procStart`.

import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const PID_FILE = /^\d+\.json$/

export type Presence = { status: 'busy' | 'shell' | 'waiting' | 'idle'; waitingFor?: string; at: number }

type PidRecord = Presence & { sessionId: string; pid: number; procStart: string }

// Answers whether each pid still runs as the process that started at its procStart.
export type ProcessCheck = (records: readonly { pid: number; procStart: string }[]) => boolean[]

const STATUSES = new Set<string>(['busy', 'shell', 'waiting', 'idle'])

function parse(text: string): PidRecord | undefined {
  let r: Record<string, unknown>
  try {
    r = JSON.parse(text) as Record<string, unknown>
  } catch {
    return undefined
  }
  const procStart = r.procStart ?? r.procStartFt
  if (typeof r.sessionId !== 'string' || typeof r.pid !== 'number' || typeof procStart !== 'string') return undefined
  if (typeof r.status !== 'string' || !STATUSES.has(r.status)) return undefined
  return {
    sessionId: r.sessionId,
    pid: r.pid,
    procStart,
    status: r.status as Presence['status'],
    ...(typeof r.waitingFor === 'string' ? { waitingFor: r.waitingFor } : {}),
    at: typeof r.statusUpdatedAt === 'number' ? r.statusUpdatedAt : 0,
  }
}

// By session id. A session resumed in a second process keeps the newest word of the ones running.
export function readPresence(dir: string, check: ProcessCheck): Map<string, Presence> {
  let names: string[]
  try {
    names = readdirSync(dir).filter(name => PID_FILE.test(name))
  } catch {
    return new Map()
  }
  const records: PidRecord[] = []
  for (const name of names) {
    try {
      const r = parse(readFileSync(join(dir, name), 'utf8'))
      if (r !== undefined) records.push(r)
    } catch {
      // Removed as the process exited.
    }
  }
  const running = check(records)
  const out = new Map<string, Presence>()
  records.forEach((r, i) => {
    if (!running[i]) return
    const old = out.get(r.sessionId)
    if (old === undefined || r.at > old.at) out.set(r.sessionId, { status: r.status, ...(r.waitingFor !== undefined ? { waitingFor: r.waitingFor } : {}), at: r.at })
  })
  return out
}

function pidRuns(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    // EPERM: the process runs under another user.
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

// On Windows `procStart` is the process's creation time as a FILETIME. Asking for it spawns
// PowerShell, so a pid's verdict is kept for as long as that pid keeps running.
export function windowsProcessCheck(): ProcessCheck {
  const proven = new Map<string, boolean>()
  return records => {
    const keys = records.map(r => `${r.pid}:${r.procStart}`)
    const alive = records.map(r => pidRuns(r.pid))
    for (const [i, key] of keys.entries()) if (!alive[i]) proven.delete(key)
    const unknown = records.filter((r, i) => alive[i] && !proven.has(keys[i]!))
    const started = unknown.length > 0 ? creationTimes(unknown.map(r => r.pid)) : undefined
    // PowerShell failed: nothing is proven either way, and the next listing asks again.
    if (started !== undefined) for (const r of unknown) proven.set(`${r.pid}:${r.procStart}`, started.get(r.pid) === r.procStart)
    return keys.map((key, i) => alive[i]! && proven.get(key) === true)
  }
}

function creationTimes(pids: readonly number[]): Map<number, string> | undefined {
  const script = `Get-Process -Id ${pids.join(',')} -ErrorAction SilentlyContinue | ForEach-Object { "$($_.Id) $($_.StartTime.ToFileTimeUtc())" }; exit 0`
  let out: string
  try {
    out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true })
  } catch {
    return undefined
  }
  const times = new Map<number, string>()
  for (const line of out.split(/\r?\n/)) {
    const [pid, time] = line.trim().split(' ')
    if (pid !== undefined && time !== undefined) times.set(Number(pid), time)
  }
  return times
}

// Elsewhere `procStart` is in a form this viewer does not read; a running pid is taken at its word.
export const pidOnlyCheck: ProcessCheck = records => records.map(r => pidRuns(r.pid))
