// Pure start decisions for main.ts.

export type StartDecision = 'run' | 'already-running' | 'port-taken'

function isAgenticsViewerHealth(health: unknown): boolean {
  if (typeof health !== 'object' || health === null) return false
  return (health as Record<string, unknown>).app === 'agentics-viewer'
}

export function startDecision(health: unknown, portFree: boolean): StartDecision {
  if (isAgenticsViewerHealth(health)) return 'already-running'
  return portFree ? 'run' : 'port-taken'
}

// serve.ts exits with this when package.json's version moved; main.ts starts it again.
export const RESTART_EXIT_CODE = 75

export function needsBuild(newestWebMtime: number, distIndexMtime: number | null): boolean {
  return distIndexMtime === null || distIndexMtime < newestWebMtime
}
