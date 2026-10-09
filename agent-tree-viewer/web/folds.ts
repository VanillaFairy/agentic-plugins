// Which nodes are folded in each session, kept in this browser so a reload or a trip to another
// session finds the tree folded as it was left.

const KEY = 'agent-tree-viewer:folds'
// The sessions folded longest ago drop out past this many, so the record stays small.
const KEEP_SESSIONS = 200

type Stored = Record<string, string[]>

function readAll(): Stored {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown
    return typeof parsed === 'object' && parsed !== null ? (parsed as Stored) : {}
  } catch {
    return {}
  }
}

export function loadFolds(sessionId: string): Set<string> {
  const ids = readAll()[sessionId]
  return new Set(Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : [])
}

export function saveFolds(sessionId: string, folds: ReadonlySet<string>): void {
  const all = readAll()
  delete all[sessionId]
  // Insertion order is the order sessions were last folded in; the newest goes last.
  if (folds.size > 0) all[sessionId] = [...folds]
  const sessions = Object.keys(all)
  for (const old of sessions.slice(0, Math.max(0, sessions.length - KEEP_SESSIONS))) delete all[old]
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // Storage blocked: the folds last until the page reloads.
  }
}
