import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface ViewerState {
  port: number
  roots: string[]
  depth: number
  agentics_path: string | null
  recent: string[]
  last: { project: string; effort: string } | null
  alerted: Record<string, Record<string, number>>
}

export const DEFAULT_STATE: ViewerState = {
  port: 5181,
  roots: ['C:\\work'],
  depth: 4,
  agentics_path: null,
  recent: [],
  last: null,
  alerted: {},
}

export const statePath = (home: string): string => join(home, '.agentics-viewer', 'state.json')

export function projectKey(project: string): string {
  const p = project.replace(/\\/g, '/').replace(/\/+$/, '')
  return /^[A-Za-z]:/.test(p) ? p[0].toLowerCase() + p.slice(1) : p
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string')
}

function isLast(value: unknown): value is { project: string; effort: string } | null {
  if (value === null) return true
  if (typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.project === 'string' && typeof v.effort === 'string'
}

function isAlerted(value: unknown): value is Record<string, Record<string, number>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  return Object.values(value as Record<string, unknown>).every((inner) => {
    if (typeof inner !== 'object' || inner === null || Array.isArray(inner)) return false
    return Object.values(inner as Record<string, unknown>).every((n) => typeof n === 'number')
  })
}

export function readState(file: string): { state: ViewerState; problem: string | null } {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { state: DEFAULT_STATE, problem: null }
    }
    return { state: DEFAULT_STATE, problem: `could not read ${file}: ${(err as Error).message}` }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { state: DEFAULT_STATE, problem: `could not read ${file}: not an object` }
  }
  const r = raw as Record<string, unknown>
  const state: ViewerState = {
    port: typeof r.port === 'number' ? r.port : DEFAULT_STATE.port,
    roots: isStringArray(r.roots) ? r.roots : DEFAULT_STATE.roots,
    depth: typeof r.depth === 'number' ? r.depth : DEFAULT_STATE.depth,
    agentics_path: typeof r.agentics_path === 'string' || r.agentics_path === null ? r.agentics_path : DEFAULT_STATE.agentics_path,
    recent: isStringArray(r.recent) ? r.recent : DEFAULT_STATE.recent,
    last: isLast(r.last) ? r.last : DEFAULT_STATE.last,
    alerted: isAlerted(r.alerted) ? r.alerted : DEFAULT_STATE.alerted,
  }
  return { state, problem: null }
}

export function writeState(file: string, state: ViewerState): void {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(state), 'utf8')
  renameSync(tmp, file)
}

export function addRecent(state: ViewerState, project: string): ViewerState {
  const recent = [project, ...state.recent.filter((p) => projectKey(p) !== projectKey(project))].slice(0, 8)
  return { ...state, recent }
}
