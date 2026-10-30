import type { AgentNode } from './model.ts'

// Every agent below `id`, in start order, without the groups they hang in.
export function sessionsUnder(nodes: Record<string, AgentNode>, id: string): AgentNode[] {
  const kids = new Map<string, AgentNode[]>()
  for (const n of Object.values(nodes)) if (n.parentId !== undefined) kids.set(n.parentId, [...(kids.get(n.parentId) ?? []), n])
  const below = (one: string): AgentNode[] => (kids.get(one) ?? []).flatMap(kid => [kid, ...below(kid.id)])
  return below(id)
    .filter(n => n.kind !== 'group')
    .sort((a, b) => a.startedAt - b.startedAt)
}
