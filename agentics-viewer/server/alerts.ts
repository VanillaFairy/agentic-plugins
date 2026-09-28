import type { Snapshot, SnapshotNode } from '../shared/snapshot.ts'

export interface Alert { node: string; kind: 'parked' | 'escalated'; seq: number; title: string; body: string }

type AlertingNode = SnapshotNode & { status: 'parked' | 'escalated'; event: NonNullable<SnapshotNode['event']> }

export function diffAlerts(s: Snapshot, watermark: number | undefined): { alerts: Alert[]; watermark: number } {
  if (watermark === undefined) return { alerts: [], watermark: s.seq_max }

  const mark = watermark
  const alerts = s.nodes
    .filter((n): n is AlertingNode => isAlerting(n, mark))
    .map((n) => toAlert(n, s.effort))
    .sort((a, b) => a.seq - b.seq)

  const nextWatermark = alerts.reduce((max, a) => Math.max(max, a.seq), watermark)
  return { alerts, watermark: nextWatermark }
}

function isAlerting(n: SnapshotNode, watermark: number): n is AlertingNode {
  return (
    (n.status === 'parked' || n.status === 'escalated') &&
    n.event !== null &&
    n.event.kind === n.status &&
    n.event.seq > watermark
  )
}

function nameOf(id: string, effort: string): string {
  return id === '.' ? effort : id.split('.').pop()!
}

function toAlert(n: AlertingNode, effort: string): Alert {
  const name = nameOf(n.id, effort)
  if (n.status === 'parked') {
    return { node: n.id, kind: 'parked', seq: n.event.seq, title: `${name} is waiting on you`, body: n.event.question ?? n.event.return ?? '' }
  }
  return { node: n.id, kind: 'escalated', seq: n.event.seq, title: `${name} escalated`, body: n.event.reason ?? n.event.detail ?? '' }
}
