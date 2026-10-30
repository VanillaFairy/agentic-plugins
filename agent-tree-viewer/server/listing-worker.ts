// The listing thread: lists the sessions, hands the result to the server, rests, and lists again.

import { parentPort, workerData } from 'node:worker_threads'
import type { ListingOptions } from './listing.ts'
import { noShellCheck, pidOnlyCheck, readPresence, windowsProcessCheck, windowsShellCheck } from './presence.ts'
import { SessionIndex } from './sessions.ts'

const REST_MS = 2000

const { projectsDir, desktopDir, maxAgeMs, pidDir } = workerData as ListingOptions
const check = process.platform === 'win32' ? windowsProcessCheck() : pidOnlyCheck
const shells = process.platform === 'win32' ? windowsShellCheck() : noShellCheck
const index = new SessionIndex({ projectsDir, desktopDir, maxAgeMs, presence: () => readPresence(pidDir, check, shells) })

function round(): void {
  try {
    const groups = index.list(Date.now())
    parentPort?.postMessage({ groups, ...index.known() })
  } catch (err) {
    console.error('agent-tree-viewer: listing the sessions failed', err)
  }
  setTimeout(round, REST_MS)
}

round()
