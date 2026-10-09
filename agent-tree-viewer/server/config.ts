// The viewer's settings: `~/.agent-tree-viewer/config.json`, with `--port <n>` on the command
// line taking precedence over the file.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export type Config = {
  port: number
  // Sessions untouched for longer than this many days are left out of the picker.
  maxAgeDays: number
  // A running agent whose transcript stays silent this many minutes is shown as stopped.
  staleMinutes: number
}

export const DEFAULT_CONFIG: Config = { port: 5182, maxAgeDays: 14, staleMinutes: 15 }

export const configPath = (home: string): string => join(home, '.agent-tree-viewer', 'config.json')

const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0

function portOf(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isInteger(n) && n > 0 && n < 65536 ? n : undefined
}

// `file` is the config file's text, or undefined when there is none. `problem` explains a
// setting that was ignored.
export function resolveConfig(file: string | undefined, argv: readonly string[]): { config: Config; problem?: string } {
  const config = { ...DEFAULT_CONFIG }
  let problem: string | undefined
  if (file !== undefined) {
    try {
      const r = JSON.parse(file) as Record<string, unknown>
      if (r.port !== undefined) {
        const port = portOf(r.port)
        if (port === undefined) problem = `ignored "port": ${JSON.stringify(r.port)} is not a port number`
        else config.port = port
      }
      if (positive(r.maxAgeDays)) config.maxAgeDays = r.maxAgeDays
      if (positive(r.staleMinutes)) config.staleMinutes = r.staleMinutes
    } catch {
      problem = 'ignored the config file: it is not valid JSON'
    }
  }
  const at = argv.indexOf('--port')
  if (at >= 0) {
    const port = portOf(argv[at + 1])
    if (port === undefined) problem = `ignored --port: ${JSON.stringify(argv[at + 1] ?? '')} is not a port number`
    else config.port = port
  }
  return problem === undefined ? { config } : { config, problem }
}

export function readConfig(home: string, argv: readonly string[]): { config: Config; problem?: string } {
  let file: string | undefined
  try {
    file = readFileSync(configPath(home), 'utf8')
  } catch {
    file = undefined
  }
  return resolveConfig(file, argv)
}
