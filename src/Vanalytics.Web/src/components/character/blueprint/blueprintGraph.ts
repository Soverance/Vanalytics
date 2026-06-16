import type { ModeMember, BlueprintEdge, BlueprintNode, BlueprintNodeType } from '../../../types/api'
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
  Extract<BlueprintNodeType, `trigger:${string}`>,
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
  nodes: BlueprintNode[], edges: BlueprintEdge[],
  sourceNodeId: string, handle: string, actionName: string,
): boolean {
  const targets = new Set(
    edges.filter(e => e.source === sourceNodeId && e.sourceHandle === handle).map(e => e.target))
  return nodes.some(n => targets.has(n.id) && (n.data.actionName ?? '') === actionName)
}

// True if adding source->target would create a directed cycle (incl. a self-edge).
export function wouldCreateCycle(edges: BlueprintEdge[], source: string, target: string): boolean {
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

// A terminal pin (no dispatch category) is the only kind allowed to target a Mode node.
export function isTerminalHandle(triggerType: string, handle: string): boolean {
  return categoryOfHandle(triggerType, handle) === null
}

// Pure member-list ops for Mode nodes (the editor delegates to these so they stay unit-testable).
export function addMember(members: ModeMember[], gearSetId: number): ModeMember[] {
  return [...members, { gearSetId }]
}

export function removeMember(members: ModeMember[], index: number): ModeMember[] {
  return members.filter((_, i) => i !== index)
}

export function moveMember(members: ModeMember[], index: number, dir: -1 | 1): ModeMember[] {
  const j = index + dir
  if (j < 0 || j >= members.length) return members
  const copy = [...members]
  ;[copy[index], copy[j]] = [copy[j], copy[index]]
  return copy
}

// Pure ordered-list ops for a Combine node's component set ids (index 0 = base, last wins).
export function addCombineSet(ids: number[], gearSetId: number): number[] {
  return [...ids, gearSetId]
}

export function removeCombineSet(ids: number[], index: number): number[] {
  return ids.filter((_, i) => i !== index)
}

export function moveCombineSet(ids: number[], index: number, dir: -1 | 1): number[] {
  const j = index + dir
  if (j < 0 || j >= ids.length) return ids
  const copy = [...ids]
  ;[copy[index], copy[j]] = [copy[j], copy[index]]
  return copy
}

// A 16-slot gear set is "full"; used only to warn that a full set as an upper combine layer fully
// replaces the layers above it (the value of set_combine comes from sparse override layers).
export function isFullSet(filledSlotCount: number): boolean {
  return filledSlotCount >= 16
}

// May a trigger pin (sourceHandle on triggerType) connect to a node of targetType? Terminal pins reach
// equip | mode | combine; category pins (precast WS/JA/Magic, buff, midcast Magic) reach only equip
// (mode/combine need a flat applied set, not action dispatch). Mirrors the backend topology guardrails.
export function canConnect(triggerType: string, handle: string, targetType: string): boolean {
  const isCategory = categoryOfHandle(triggerType, handle) !== null
  if (targetType === 'mode' || targetType === 'combine') return !isCategory
  return true
}

// ---- Copy/paste transforms (pure; the editor wires Ctrl-C/V to these) ----

export interface ClipboardNode { id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> }
export interface ClipboardEdge { id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }
export interface Clipboard { nodes: ClipboardNode[]; edges: ClipboardEdge[] }

// Snapshot the selected nodes (projected to a serializable shape, data deep-copied) plus the edges
// whose BOTH endpoints are selected. Edges crossing to unselected nodes are dropped.
export function cloneSelection(
  nodes: { id: string; selected?: boolean; type?: string; position: { x: number; y: number }; data: Record<string, unknown> }[],
  edges: { id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }[],
): Clipboard {
  const sel = nodes.filter(n => n.selected)
  const ids = new Set(sel.map(n => n.id))
  return {
    nodes: sel.map(n => ({ id: n.id, type: n.type ?? '', position: { ...n.position }, data: structuredClone(n.data) })),
    edges: edges.filter(e => ids.has(e.source) && ids.has(e.target))
      .map(e => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null, targetHandle: e.targetHandle ?? null })),
  }
}

// Top-left corner (min x, min y) of a clipboard's nodes; {0,0} for an empty clipboard. Used to
// translate a pasted group so its anchor lands at the paste cursor.
export function clipboardAnchor(clip: Clipboard): { x: number; y: number } {
  if (clip.nodes.length === 0) return { x: 0, y: 0 }
  return {
    x: Math.min(...clip.nodes.map(n => n.position.x)),
    y: Math.min(...clip.nodes.map(n => n.position.y)),
  }
}

// Build pasted nodes/edges from a clipboard: fresh ids (via newId), internal edges remapped through the
// id map, positions offset by (dx,dy), all marked selected. Data is deep-copied so paste is independent.
export function pasteClone(
  clip: Clipboard, newId: () => string, offset: { x: number; y: number },
): {
  nodes: { id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown>; selected: boolean }[]
  edges: { id: string; source: string; target: string; sourceHandle: string | null; targetHandle: string | null; selected: boolean }[]
} {
  const idMap = new Map<string, string>()
  for (const n of clip.nodes) idMap.set(n.id, newId())
  return {
    nodes: clip.nodes.map(n => ({
      id: idMap.get(n.id)!, type: n.type,
      position: { x: n.position.x + offset.x, y: n.position.y + offset.y },
      data: structuredClone(n.data), selected: true,
    })),
    edges: clip.edges.map(e => ({
      id: `${idMap.get(e.source)}-${e.sourceHandle ?? ''}-${idMap.get(e.target)}`,
      source: idMap.get(e.source)!, target: idMap.get(e.target)!,
      sourceHandle: e.sourceHandle ?? null, targetHandle: e.targetHandle ?? null, selected: true,
    })),
  }
}
