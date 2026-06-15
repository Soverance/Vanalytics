import type { WorkflowEdge, WorkflowNode, WorkflowNodeType } from '../../../types/api'
import { WEAPON_SKILLS } from '../../../lib/weaponSkills'
import { JOB_ABILITIES } from '../../../lib/jobAbilities'
import { SPELLS } from '../../../lib/spells'
import { BUFFS } from '../../../lib/buffs'

export type ActionCategory = 'WeaponSkill' | 'JobAbility' | 'Magic' | 'Buff'
export interface ActionEntry { id: number; name: string; label?: string }

// A handle is either a terminal pin (drop spawns a leaf immediately, flat equip) or a category pin
// (drop opens the action picker; its leaves dispatch on the category). `allowGeneric` controls whether
// the picker offers an "Any … (default)" row (true for spell/WS/JA pins, false for buff pins).
type HandleKind = 'terminal' | { category: ActionCategory; allowGeneric: boolean }

// Branch handles + display labels + kinds per trigger. Mirrors the backend Triggers table in
// GearSwapCodeGenerator.Events.cs — keep the handle names in sync.
export const TRIGGER_DEFS: Record<
  Extract<WorkflowNodeType, `trigger:${string}`>,
  { label: string; handles: string[]; handleLabels: Record<string, string>; kinds: Record<string, HandleKind> }
> = {
  'trigger:status_change': {
    label: 'status_change',
    handles: ['Engaged', 'Idle', 'Resting'],
    handleLabels: { Engaged: 'Engaged', Idle: 'Idle', Resting: 'Resting' },
    kinds: { Engaged: 'terminal', Idle: 'terminal', Resting: 'terminal' },
  },
  'trigger:precast': {
    label: 'precast',
    handles: ['WeaponSkill', 'JobAbility', 'Magic'],
    handleLabels: { WeaponSkill: 'Weapon Skill', JobAbility: 'Job Ability', Magic: 'Magic' },
    kinds: {
      WeaponSkill: { category: 'WeaponSkill', allowGeneric: true },
      JobAbility: { category: 'JobAbility', allowGeneric: true },
      Magic: { category: 'Magic', allowGeneric: true },
    },
  },
  'trigger:aftercast': {
    label: 'aftercast',
    handles: ['Engaged', 'Idle'],
    handleLabels: { Engaged: 'Engaged', Idle: 'Idle (else)' },
    kinds: { Engaged: 'terminal', Idle: 'terminal' },
  },
  'trigger:midcast': {
    label: 'midcast',
    handles: ['Magic', 'Ranged'],
    handleLabels: { Magic: 'Magic', Ranged: 'Ranged' },
    kinds: { Magic: { category: 'Magic', allowGeneric: true }, Ranged: 'terminal' },
  },
  'trigger:buff_change': {
    label: 'buff_change',
    handles: ['Gained', 'Lost'],
    handleLabels: { Gained: 'Gained', Lost: 'Lost' },
    kinds: {
      Gained: { category: 'Buff', allowGeneric: false },
      Lost: { category: 'Buff', allowGeneric: false },
    },
  },
}

// Category pin → its action category (its leaves dispatch on the category); terminal pin → null.
export function categoryOfHandle(triggerType: string, handle: string): ActionCategory | null {
  const def = TRIGGER_DEFS[triggerType as keyof typeof TRIGGER_DEFS]
  const kind = def?.kinds[handle]
  return kind && kind !== 'terminal' ? kind.category : null
}

// Does this category pin offer an "Any … (default)" generic leaf? False for terminal/buff pins.
export function allowGenericForHandle(triggerType: string, handle: string): boolean {
  const def = TRIGGER_DEFS[triggerType as keyof typeof TRIGGER_DEFS]
  const kind = def?.kinds[handle]
  return !!kind && kind !== 'terminal' && kind.allowGeneric
}

export function actionCatalog(category: ActionCategory): ActionEntry[] {
  if (category === 'WeaponSkill') return WEAPON_SKILLS.map(w => ({ id: w.id, name: w.name }))
  if (category === 'JobAbility') return JOB_ABILITIES.map(a => ({ id: a.id, name: a.name }))
  if (category === 'Buff') return BUFFS.map(b => ({ id: b.id, name: b.name, label: b.label }))
  return SPELLS.map(s => ({ id: s.id, name: s.name }))
}

// Buff dispatch values are stored raw (e.g. "doom"); this resolves a raw en to its Title-Case display
// label. Non-buff actions (already proper-cased) and unknown names pass through unchanged.
const BUFF_LABELS = new Map(BUFFS.map(b => [b.name, b.label]))
export function labelForAction(name: string | null | undefined): string {
  if (!name) return ''
  return BUFF_LABELS.get(name) ?? name
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
