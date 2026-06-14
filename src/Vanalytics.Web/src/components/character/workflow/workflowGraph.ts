import type { WorkflowEdge, WorkflowNodeType } from '../../../types/api'

// Branch handles + display labels per trigger. Mirrors the backend Triggers table in
// GearSwapCodeGenerator.Events.cs — keep the handle names in sync.
export const TRIGGER_DEFS: Record<
  Extract<WorkflowNodeType, `trigger:${string}`>,
  { label: string; handles: string[]; handleLabels: Record<string, string> }
> = {
  'trigger:status_change': {
    label: 'status_change',
    handles: ['Engaged', 'Idle', 'Resting'],
    handleLabels: { Engaged: 'Engaged', Idle: 'Idle', Resting: 'Resting' },
  },
  'trigger:precast': {
    label: 'precast(spell)',
    handles: ['WeaponSkill', 'JobAbility', 'Magic'],
    handleLabels: { WeaponSkill: 'Weapon Skill', JobAbility: 'Job Ability', Magic: 'Magic' },
  },
  'trigger:aftercast': {
    label: 'aftercast(spell)',
    handles: ['Engaged', 'Idle'],
    handleLabels: { Engaged: 'Engaged', Idle: 'Idle (else)' },
  },
}

// True if adding source->target would create a directed cycle (incl. a self-edge).
export function wouldCreateCycle(edges: WorkflowEdge[], source: string, target: string): boolean {
  if (source === target) return true
  // Is `source` reachable from `target` following existing edges? If so, the new edge closes a loop.
  const adjacency = new Map<string, string[]>()
  for (const e of edges) {
    const list = adjacency.get(e.source) ?? []
    list.push(e.target)
    adjacency.set(e.source, list)
  }
  const stack = [target]
  const seen = new Set<string>()
  while (stack.length) {
    const node = stack.pop()!
    if (node === source) return true
    if (seen.has(node)) continue
    seen.add(node)
    for (const next of adjacency.get(node) ?? []) stack.push(next)
  }
  return false
}
