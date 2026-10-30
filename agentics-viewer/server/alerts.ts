import type { Snapshot, SnapshotEvent, SnapshotNode } from '../shared/snapshot.ts'

export interface Alert { node: string; kind: 'parked' | 'escalated'; seq: number; title: string; body: string }

type StoppedNode = SnapshotNode & { status: 'parked' | 'escalated'; event: SnapshotEvent }

// `heldBefore` names the stops the last read found with the session. A stop going from there to
// nobody has no new seq to rise above the watermark, so that is how its alert is noticed.
export function diffAlerts(
  s: Snapshot,
  watermark: number | undefined,
  heldBefore: ReadonlySet<string> = new Set(),
): { alerts: Alert[]; watermark: number; held: Set<string> } {
  const stops = s.nodes.filter(isStop)
  const held = new Set(stops.filter((n) => n.event.holder === 'session').map(stopKey))
  if (watermark === undefined) return { alerts: [], watermark: s.seq_max, held }

  const alerts = stops
    .filter((n) => isAlerting(n, watermark, heldBefore))
    .map((n) => toAlert(n, s.effort))
    .sort((a, b) => a.seq - b.seq)

  const nextWatermark = alerts.reduce((max, a) => Math.max(max, a.seq), watermark)
  return { alerts, watermark: nextWatermark, held }
}

function isStop(n: SnapshotNode): n is StoppedNode {
  return (n.status === 'parked' || n.status === 'escalated') && n.event !== null && n.event.kind === n.status
}

function stopKey(n: StoppedNode): string {
  return `${n.id}#${n.event.seq}`
}

// A question's alert goes by the question's seq: it may open long after the stop, with the
// watermark moved past the stop by then.
function alertSeq(n: StoppedNode): number {
  return n.event.holder === 'user' && n.event.asked !== undefined ? n.event.asked : n.event.seq
}

function isAlerting(n: StoppedNode, watermark: number, heldBefore: ReadonlySet<string>): boolean {
  if (n.event.holder === 'session') return false
  if (n.event.holder === 'nobody' && heldBefore.has(stopKey(n))) return true
  return alertSeq(n) > watermark
}

function nameOf(id: string, effort: string): string {
  return id === '.' ? effort : id.split('.').pop()!
}

function toAlert(n: StoppedNode, effort: string): Alert {
  const name = nameOf(n.id, effort)
  const why = n.status === 'parked' ? n.event.question ?? n.event.return ?? '' : n.event.reason ?? n.event.detail ?? ''
  const title = n.event.holder === 'nobody'
    ? `Nobody is handling ${name}`
    : n.event.holder === 'user' || n.status === 'parked' ? `${name} is waiting on you` : `${name} escalated`
  return { node: n.id, kind: n.status, seq: alertSeq(n), title, body: why }
}
