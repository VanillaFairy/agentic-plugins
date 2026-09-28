import { existsSync, lstatSync, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import type { Clock } from './clock.ts'

export interface ProjectRef {
  path: string
  name: string
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.claude', '.agentics'])

function scan(dir: string, depth: number, out: string[]): void {
  let hasAgentics = false
  try {
    hasAgentics = lstatSync(join(dir, '.agentics')).isDirectory()
  } catch {
    hasAgentics = false
  }
  if (hasAgentics) {
    out.push(dir)
  }
  if (depth <= 0) {
    return
  }
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) {
      continue
    }
    const full = join(dir, entry)
    let stat
    try {
      stat = lstatSync(full)
    } catch {
      continue
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      continue
    }
    scan(full, depth - 1, out)
  }
}

export function discoverProjects(roots: string[], depth: number): ProjectRef[] {
  const found: string[] = []
  for (const root of roots) {
    try {
      const stat = lstatSync(root)
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        continue
      }
    } catch {
      continue
    }
    scan(root, depth, found)
  }
  const sorted = [...new Set(found)].sort()
  return sorted.map((path) => ({ path, name: basename(path) }))
}

export function createDiscovery(clock: Clock, ttlMs = 60_000): { list(roots: string[], depth: number): ProjectRef[] } {
  let cacheKey = ''
  let cacheAt = -Infinity
  let cached: ProjectRef[] = []
  return {
    list(roots: string[], depth: number): ProjectRef[] {
      const key = JSON.stringify([roots, depth])
      const now = clock.now()
      if (key === cacheKey && now - cacheAt < ttlMs) {
        return cached
      }
      cached = discoverProjects(roots, depth)
      cacheKey = key
      cacheAt = now
      return cached
    },
  }
}

export function recentProjects(recent: string[]): ProjectRef[] {
  return recent.filter((path) => existsSync(path)).map((path) => ({ path, name: basename(path) }))
}

export function latestEffort(store: string, efforts: string[]): string | null {
  let best: string | null = null
  let bestMtime = -Infinity
  for (const effort of efforts) {
    const dir = join(store, effort)
    let mtime = -Infinity
    const candidates: string[] = []
    const stateDir = join(dir, '.state')
    try {
      for (const entry of readdirSync(stateDir)) {
        if (entry.endsWith('.jsonl')) {
          candidates.push(join(stateDir, entry))
        }
      }
    } catch {
      // no .state directory
    }
    candidates.push(...findDesignFiles(dir))
    for (const file of candidates) {
      try {
        const stat = lstatSync(file)
        const ms = stat.mtimeMs
        if (ms > mtime) {
          mtime = ms
        }
      } catch {
        // skip unreadable file
      }
    }
    if (best === null || mtime > bestMtime || (mtime === bestMtime && effort > best)) {
      best = effort
      bestMtime = mtime
    }
  }
  return best
}

function findDesignFiles(dir: string): string[] {
  const found: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return found
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    let stat
    try {
      stat = lstatSync(full)
    } catch {
      continue
    }
    if (stat.isSymbolicLink()) {
      continue
    }
    if (stat.isDirectory()) {
      found.push(...findDesignFiles(full))
    } else if (entry === 'DESIGN.md') {
      found.push(full)
    }
  }
  return found
}
