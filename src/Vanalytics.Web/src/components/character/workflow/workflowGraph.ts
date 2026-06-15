import type { WorkflowEdge, WorkflowNode, WorkflowNodeType } from '../../../types/api'

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
    label: 'precast',
    handles: ['WeaponSkill', 'JobAbility', 'Magic'],
    handleLabels: { WeaponSkill: 'Weapon Skill', JobAbility: 'Job Ability', Magic: 'Magic' },
  },
  'trigger:aftercast': {
    label: 'aftercast',
    handles: ['Engaged', 'Idle'],
    handleLabels: { Engaged: 'Engaged', Idle: 'Idle (else)' },
  },
}

import { WEAPON_SKILLS } from '../../../lib/weaponSkills'
import { JOB_ABILITIES } from '../../../lib/jobAbilities'
import { SPELLS } from '../../../lib/spells'

export type ActionCategory = 'WeaponSkill' | 'JobAbility' | 'Magic'
export interface ActionEntry { id: number; name: string }

// A precast pin is a "category" pin (its leaves dispatch on spell.english); status/aftercast pins
// are terminal. Returns the category for a category pin, else null.
export function categoryOfHandle(triggerType: string, handle: string): ActionCategory | null {
  if (triggerType !== 'trigger:precast') return null
  if (handle === 'WeaponSkill' || handle === 'JobAbility' || handle === 'Magic') return handle
  return null
}

export function actionCatalog(category: ActionCategory): ActionEntry[] {
  if (category === 'WeaponSkill') return WEAPON_SKILLS.map(w => ({ id: w.id, name: w.name }))
  if (category === 'JobAbility') return JOB_ABILITIES.map(a => ({ id: a.id, name: a.name }))
  return SPELLS.map(s => ({ id: s.id, name: s.name }))
}

// Is a leaf with this actionName already wired to this pin (source node + handle)?
export function hasAction(
  nodes: WorkflowNode[], edges: WorkflowEdge[],
  sourceNodeId: string, handle: string, actionName: string,
): boolean {
  const targets = new Set(
    edges.filter(e => e.source === sourceNodeId && e.sourceHandle === handle).map(e => e.target))
  return nodes.some(n => targets.has(n.id) && (n.data.actionName ?? '') === actionName)
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
