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

export function needsBuild(newestWebMtime: number, distIndexMtime: number | null): boolean {
  return distIndexMtime === null || distIndexMtime < newestWebMtime
}
