import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Snapshot, EffortsList, Problem } from '../shared/snapshot.ts'
import { FORMAT } from '../shared/snapshot.ts'

export interface AgenticsLocation { path: string; version: string }

const DEFAULT_TIMEOUT_MS = 10000
const MAX_BUFFER_BYTES = 64 * 1024 * 1024

export function locateAgentics(opts: { override: string | null; installedPlugins: string }): AgenticsLocation | Problem {
  const candidate = opts.override ?? readInstallPath(opts.installedPlugins)
  if (candidate === null || !existsSync(join(candidate, 'lib', 'status.mjs'))) {
    return { code: 'agentics_missing', path: candidate ?? opts.installedPlugins }
  }
  return { path: candidate, version: readVersion(candidate) }
}

function readInstallPath(installedPlugins: string): string | null {
  try {
    const data = JSON.parse(readFileSync(installedPlugins, 'utf8'))
    const installPath = data?.plugins?.['agentics@vanillafairy']?.[0]?.installPath
    return typeof installPath === 'string' ? installPath : null
  } catch {
    return null
  }
}

function readVersion(path: string): string {
  try {
    const data = JSON.parse(readFileSync(join(path, '.claude-plugin', 'plugin.json'), 'utf8'))
    return typeof data?.version === 'string' ? data.version : ''
  } catch {
    return ''
  }
}

export type RunResult<T> = { ok: true; payload: T; digest: string } | { ok: false; problem: Problem }

function execStatus(loc: AgenticsLocation, args: string[], timeoutMs: number): Promise<{ stdout: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [join(loc.path, 'lib', 'status.mjs'), ...args, '--json'],
      { timeout: timeoutMs, maxBuffer: MAX_BUFFER_BYTES },
      (err, stdout) => {
        const timedOut =
          err !== null &&
          (err as NodeJS.ErrnoException & { killed?: boolean }).killed === true &&
          (err as NodeJS.ErrnoException).code !== 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
        resolve({ stdout: stdout ?? '', timedOut })
      },
    )
  })
}

function interpret<T>(loc: AgenticsLocation, stdout: string, timedOut: boolean, checkFormat: boolean): RunResult<T> {
  if (timedOut) {
    return { ok: false, problem: { code: 'snapshot_failed', path: loc.path, version: loc.version, detail: 'timed out' } }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return { ok: false, problem: { code: 'snapshot_failed', path: loc.path, version: loc.version, detail: stdout } }
  }
  if (parsed !== null && typeof parsed === 'object' && 'error' in parsed) {
    const message = String((parsed as { error: unknown }).error)
    if (message.startsWith('unknown command "snapshot"')) {
      return { ok: false, problem: { code: 'agentics_too_old', path: loc.path, version: loc.version } }
    }
    return { ok: false, problem: { code: 'snapshot_failed', path: loc.path, version: loc.version, detail: message } }
  }
  if (parsed !== null && typeof parsed === 'object' && 'payload' in parsed) {
    const envelope = parsed as { payload: { format?: number }; payload_digest: string }
    if (checkFormat && envelope.payload.format !== FORMAT) {
      return { ok: false, problem: { code: 'format_mismatch', path: loc.path, version: loc.version, format: envelope.payload.format } }
    }
    return { ok: true, payload: envelope.payload as T, digest: envelope.payload_digest }
  }
  return { ok: false, problem: { code: 'snapshot_failed', path: loc.path, version: loc.version, detail: stdout } }
}

export function runSnapshot(loc: AgenticsLocation, project: string, effort: string, opts: { timeoutMs?: number } = {}): Promise<RunResult<Snapshot>> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  return execStatus(loc, ['snapshot', '--repo', project, '--effort', effort], timeoutMs).then((r) =>
    interpret<Snapshot>(loc, r.stdout, r.timedOut, true),
  )
}

export function runList(loc: AgenticsLocation, project: string, opts: { timeoutMs?: number } = {}): Promise<RunResult<EffortsList>> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  return execStatus(loc, ['list', '--repo', project], timeoutMs).then((r) =>
    interpret<EffortsList>(loc, r.stdout, r.timedOut, false),
  )
}
