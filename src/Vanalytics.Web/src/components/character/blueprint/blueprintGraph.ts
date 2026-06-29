import type { ModeMember, BlueprintEdge, BlueprintNode, BlueprintNodeType } from '../../../types/api'
import { WEAPON_SKILLS } from '../../../lib/weaponSkills'
import { JOB_ABILITIES } from '../../../lib/jobAbilities'
import { SPELLS } from '../../../lib/spells'
import { BUFFS } from '../../../lib/buffs'

export type ActionCategory = 'WeaponSkill' | 'JobAbility' | 'Magic' | 'Buff' | 'PetAction'
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
  'trigger:pet_change': {
    label: 'pet_change',
    handles: ['Summoned', 'Released'],
    handleLabels: { Summoned: 'Summoned', Released: 'Released' },
    kinds: { Summoned: 'terminal', Released: 'terminal' },
  },
  'trigger:pet_status_change': {
    label: 'pet_status_change',
    handles: ['Engaged', 'Idle'],
    handleLabels: { Engaged: 'Engaged', Idle: 'Idle' },
    kinds: { Engaged: 'terminal', Idle: 'terminal' },
  },
  'trigger:pet_midcast': {
    label: 'pet_midcast',
    handles: ['PetAction'],
    handleLabels: { PetAction: 'Pet Action' },
    kinds: { PetAction: { category: 'PetAction', allowGeneric: true } },
  },
  'trigger:pet_aftercast': {
    label: 'pet_aftercast',
    handles: ['Engaged', 'Idle'],
    handleLabels: { Engaged: 'Engaged', Idle: 'Idle (else)' },
    kinds: { Engaged: 'terminal', Idle: 'terminal' },
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
  // Pet actions are blood pacts / ready moves (job abilities) and automaton spells — the merged list.
  if (category === 'PetAction') return allActionsCatalog()
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

// Pure ordered-list ops for an equip leaf's overlay set ids (applied over the base, last wins).
export function addOverlay(ids: number[], gearSetId: number): number[] {
  return [...ids, gearSetId]
}

export function removeOverlay(ids: number[], index: number): number[] {
  return ids.filter((_, i) => i !== index)
}

export function moveOverlay(ids: number[], index: number, dir: -1 | 1): number[] {
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
// equip | mode; category pins (precast WS/JA/Magic, buff, midcast Magic) reach only equip
// (mode needs a flat applied set, not action dispatch). Mirrors the backend topology guardrails.
export function canConnect(triggerType: string, handle: string, targetType: string): boolean {
  const isCategory = categoryOfHandle(triggerType, handle) !== null
  if (targetType === 'mode') return !isCategory
  return true
}

// ---- Handle type inventory (drives connection validity + the context menu) ----

export type HandleValueType = 'exec' | 'bool' | 'num'
interface HandleDef { id: string; type: HandleValueType; dir: 'in' | 'out' }

// Static handles per non-trigger node type. Triggers are derived from TRIGGER_DEFS (every trigger pin
// is an exec output). Phase 2 extends this with value/buff/operator nodes.
export const NODE_HANDLES: Record<string, HandleDef[]> = {
  branch: [
    { id: 'in', type: 'exec', dir: 'in' },
    { id: 'cond', type: 'bool', dir: 'in' },
    { id: 'true', type: 'exec', dir: 'out' },
    { id: 'false', type: 'exec', dir: 'out' },
  ],
  equip: [{ id: 'in', type: 'exec', dir: 'in' }, { id: 'out', type: 'exec', dir: 'out' }],
  mode: [{ id: 'in', type: 'exec', dir: 'in' }, { id: 'out', type: 'exec', dir: 'out' }],
  lua: [{ id: 'in', type: 'exec', dir: 'in' }, { id: 'out', type: 'exec', dir: 'out' }],
  print: [{ id: 'in', type: 'exec', dir: 'in' }, { id: 'out', type: 'exec', dir: 'out' }],
  setup: [],
  value: [{ id: 'out', type: 'num', dir: 'out' }],
  buff: [{ id: 'out', type: 'bool', dir: 'out' }],
  spell: [{ id: 'out', type: 'bool', dir: 'out' }],
  pet: [{ id: 'out', type: 'bool', dir: 'out' }],
  world: [{ id: 'out', type: 'bool', dir: 'out' }],
  'op:compare': [
    { id: 'in', type: 'num', dir: 'in' },
    { id: 'out', type: 'bool', dir: 'out' },
  ],
  'op:and': [
    { id: 'a', type: 'bool', dir: 'in' },
    { id: 'b', type: 'bool', dir: 'in' },
    { id: 'out', type: 'bool', dir: 'out' },
  ],
  'op:or': [
    { id: 'a', type: 'bool', dir: 'in' },
    { id: 'b', type: 'bool', dir: 'in' },
    { id: 'out', type: 'bool', dir: 'out' },
  ],
  'op:not': [
    { id: 'in', type: 'bool', dir: 'in' },
    { id: 'out', type: 'bool', dir: 'out' },
  ],
}

export function handlesOf(nodeType: string): HandleDef[] {
  if (nodeType.startsWith('trigger:')) {
    const def = TRIGGER_DEFS[nodeType as keyof typeof TRIGGER_DEFS]
    return def ? def.handles.map(h => ({ id: h, type: 'exec' as const, dir: 'out' as const })) : []
  }
  return NODE_HANDLES[nodeType] ?? []
}

export function handleType(nodeType: string, handleId: string | null | undefined): HandleValueType | null {
  if (!handleId) return null
  return handlesOf(nodeType).find(h => h.id === handleId)?.type ?? null
}

export function handleInfo(nodeType: string, handleId: string | null | undefined): HandleDef | null {
  if (!handleId) return null
  return handlesOf(nodeType).find(h => h.id === handleId) ?? null
}

// ---- Condition / branch helpers ----

// Stat resource metadata: label shown to the user ↔ the Lua player.<value> field.
export const STAT_RESOURCES: { value: string; label: string }[] = [
  { value: 'hp', label: 'HP' },
  { value: 'hpp', label: 'HP%' },
  { value: 'mp', label: 'MP' },
  { value: 'mpp', label: 'MP%' },
  { value: 'tp', label: 'TP' },
]
export const STAT_OPS = ['<', '<=', '>', '>=', '==', '~='] as const

// Value-node numeric sources = player stats + pet/world numerics. op:compare's inline picker stays
// STAT_RESOURCES (player-only); these extra sources only reach codegen via a wired value node.
export const VALUE_SOURCES: { value: string; label: string }[] = [
  ...STAT_RESOURCES,
  { value: 'pet.tp', label: 'Pet TP' },
  { value: 'pet.hpp', label: 'Pet HP%' },
  { value: 'world.moon', label: 'Moon %' },
]

export function statResourceLabel(r?: string | null): string {
  return VALUE_SOURCES.find(x => x.value === r)?.label ?? r ?? '?'
}

// The text shown on an op:compare node's face. With a wired numeric input the resource is overridden
// at codegen; the face still shows the inline resource (or "value" when none is set).
export function compareFace(
  data: { resource?: string | null; op?: string | null; value?: number | null },
): string {
  return `${data.resource ? statResourceLabel(data.resource) : 'value'} ${data.op ?? '<'} ${data.value ?? 0}`
}

// Spell-condition catalogs. Skill/element values must match Windower res EXACTLY (spell.skill /
// spell.element compare against the raw en) — transcribed from res/skills.lua (ids 32-45) and
// res/elements.lua. No per-spell data needed; these are fixed lists.
export const SPELL_SKILLS: string[] = [
  'Divine Magic', 'Healing Magic', 'Enhancing Magic', 'Enfeebling Magic',
  'Elemental Magic', 'Dark Magic', 'Summoning Magic', 'Ninjutsu',
  'Singing', 'String Instrument', 'Wind Instrument', 'Blue Magic', 'Geomancy', 'Handbell',
]
export const SPELL_ELEMENTS: string[] = [
  'Fire', 'Ice', 'Wind', 'Earth', 'Lightning', 'Water', 'Light', 'Dark',
]

// Curated name-family substrings for the spell "Name contains" field. value = the exact substring
// matched by the Lua plain string.find on spell.english (CASE-SENSITIVE — must match the catalog's
// casing); label = display text. Every value is validated against allActionsCatalog() by a vitest
// drift guard (each must match ≥1 action). Counts (current catalog) shown for reference.
export const SPELL_FAMILIES: { value: string; label: string }[] = [
  { value: 'Waltz', label: 'Waltz' },                 // 9
  { value: 'Step', label: 'Step' },                   // 4
  { value: 'Flourish', label: 'Flourish' },           // 12
  { value: 'Samba', label: 'Samba' },                 // 7
  { value: 'Jig', label: 'Jig' },                     // 4
  { value: 'Roll', label: 'Roll (Corsair)' },         // 8
  { value: 'Madrigal', label: 'Madrigal' },           // 2
  { value: 'Minuet', label: 'Minuet' },               // 5
  { value: 'March', label: 'March' },                 // 2
  { value: 'Etude', label: 'Etude' },                 // 14
  { value: 'Carol', label: 'Carol' },                 // 16
  { value: 'Threnody', label: 'Threnody' },           // 16
  { value: 'Mambo', label: 'Mambo' },                 // 2
  { value: 'Lullaby', label: 'Lullaby' },             // 4
  { value: 'Mazurka', label: 'Mazurka' },             // 2
  { value: 'Cure', label: 'Cure' },                   // 7
  { value: 'Curaga', label: 'Curaga' },               // 5
  { value: 'helix', label: 'Helix (Scholar)' },       // 16
  { value: 'storm', label: 'Storm (weather)' },       // 18
  { value: 'Indi-', label: 'Indi- (Geomancy)' },      // 30
  { value: 'Geo-', label: 'Geo- (Geomancy)' },        // 30
  { value: 'Utsusemi', label: 'Utsusemi' },           // 3
  { value: 'Katon', label: 'Katon (Ninjutsu)' },      // 3
  { value: 'Boost', label: 'Boost' },                 // 8
]

// Count of catalog actions whose name contains this family substring. CASE-SENSITIVE includes() so
// the displayed count matches the Lua plain string.find(spell.english, value, 1, true) at runtime.
export function familyMatchCount(value: string): number {
  return allActionsCatalog().filter(a => a.name.includes(value)).length
}

// Curated pet status values (res/statuses en — verify against GearSwap pet.status during impl).
export const PET_STATUSES: string[] = ['Idle', 'Engaged', 'Dead']

// Node-face text for a pet condition.
export function petFace(d: { petField?: string | null; petValue?: string | null }): string {
  if (d.petField === 'exists') return 'pet exists'
  if (d.petField === 'status') return d.petValue ? `pet is ${d.petValue}` : 'pet status…'
  return 'pet…'
}

// Node-face text for a world condition. Zone shows the stored display label (codegen uses the id).
export function worldFace(d: { worldField?: string | null; worldValue?: string | null; worldLabel?: string | null }): string {
  switch (d.worldField) {
    case 'weather': return d.worldValue ? `weather is ${d.worldValue}` : 'weather…'
    case 'day': return d.worldValue ? `day is ${d.worldValue}` : 'day…'
    case 'moghouse': return 'in mog house'
    case 'zone': return d.worldLabel ? `in ${d.worldLabel}` : 'zone…'
    default: return 'world…'
  }
}

// Curated FFXI/Windower add_to_chat color codes for the Print node. Codes are display-only (cosmetic);
// verify against Windower add_to_chat during impl. The user never types a code — picks from this list.
export const CHAT_COLORS: { code: number; label: string }[] = [
  { code: 1, label: 'White' },
  { code: 2, label: 'Green' },
  { code: 5, label: 'Pink' },
  { code: 8, label: 'Teal' },
  { code: 36, label: 'Yellow' },
  { code: 167, label: 'Orange' },
  { code: 207, label: 'Grey' },
]
export const DEFAULT_CHAT_COLOR = 1

// Node-face text helpers. The first non-blank code line previews lua/setup; print shows its message.
function firstLine(code?: string | null): string {
  return (code ?? '').split('\n').find(l => l.trim())?.trim() ?? ''
}
export function printFace(d: { chatText?: string | null }): string {
  return d.chatText ? `say "${d.chatText}"` : 'say…'
}
export function luaFace(d: { code?: string | null }): string {
  const l = firstLine(d.code)
  return l ? l.slice(0, 28) : 'custom lua…'
}
export function setupFace(d: { code?: string | null }): string {
  const l = firstLine(d.code)
  return l ? l.slice(0, 28) : 'file-load setup…'
}

// Merged catalog for the "Action is" picker: spell.english matches WS, JA and magic alike, so one
// searchable list covers all three. Names are emitted verbatim as the comparison value.
export function allActionsCatalog(): ActionEntry[] {
  return [
    ...WEAPON_SKILLS.map(w => ({ id: w.id, name: w.name })),
    ...JOB_ABILITIES.map(a => ({ id: a.id, name: a.name })),
    ...SPELLS.map(s => ({ id: s.id, name: s.name })),
  ]
}

// Node-face text for a spell condition. The picked english (WS/JA/spell) is already proper-cased;
// skill/element show verbatim. Placeholder when no value is chosen yet.
export function spellFace(data: { spellField?: string | null; spellValue?: string | null }): string {
  const field = data.spellField ?? 'name'
  if (field === 'contains') return data.spellValue ? `contains "${data.spellValue}"` : 'contains …'
  const lead = field === 'skill' ? 'skill' : field === 'element' ? 'element' : 'spell'
  return data.spellValue ? `${lead} is ${data.spellValue}` : `${lead} is …`
}

// May a connection (sourceType.sourceHandle -> targetType.targetHandle) exist? Both endpoints must
// carry the same handle value type (exec/bool/num). One domain rule on top: category trigger pins
// (precast WS/JA/Magic, midcast Magic, buff Gained/Lost) reach an action-bound Equip leaf OR a Branch
// (which runs under the category's `spell.type == X` guard) — but NOT a Mode: the codegen's category
// path only emits equip leaves, so a Mode target would be silently dropped. Terminal pins (exec, no
// category) still reach branch | equip | mode.
export function isValidConnection(
  sourceType: string, sourceHandle: string | null | undefined,
  targetType: string, targetHandle: string | null | undefined,
): boolean {
  const s = handleType(sourceType, sourceHandle)
  const t = handleType(targetType, targetHandle)
  if (s === null || t === null || s !== t) return false
  if (sourceType.startsWith('trigger:') && categoryOfHandle(sourceType, sourceHandle ?? '') !== null
      && targetType !== 'equip' && targetType !== 'branch') return false
  return true
}

// Can a freshly-created `candidateType` node be wired to a tether dragged from (fromType, fromHandle)?
// It must expose a handle of the same value type and opposite direction, then pass isValidConnection
// (so the category-pin → Equip-only rule applies in the menu too). Drives context-sensitive filtering.
export function menuCandidateValid(fromType: string, fromHandle: string, candidateType: string): boolean {
  const from = handleInfo(fromType, fromHandle)
  if (!from) return false
  const wantDir = from.dir === 'out' ? 'in' : 'out'
  const cand = handlesOf(candidateType).find(h => h.type === from.type && h.dir === wantDir)
  if (!cand) return false
  return from.dir === 'out'
    ? isValidConnection(fromType, fromHandle, candidateType, cand.id)
    : isValidConnection(candidateType, cand.id, fromType, fromHandle)
}

// Exec/value outputs that hold a single target (rewire replaces): trigger terminal pins and branch
// true/false. Category trigger pins fan out (named leaves); value/buff/operator bool|num outs fan out
// (a condition can be reused across branches and operators).
export function isSingleTargetSource(sourceType: string, sourceHandle: string | null | undefined): boolean {
  if (sourceType === 'branch') return true
  if (sourceType.startsWith('trigger:')) return categoryOfHandle(sourceType, sourceHandle ?? '') === null
  // Sequential exec chain: the 'out' of an exec statement node holds a single successor.
  if (sourceHandle === 'out' && (sourceType === 'equip' || sourceType === 'mode' || sourceType === 'lua' || sourceType === 'print')) return true
  return false
}

// Edge ids on the upstream execution lineage of nodeId: walk BACKWARD along exec wires
// (target === current, skipping condition feeders where targetHandle === 'cond'), collecting each
// edge and recursing into its source. The walk terminates naturally at triggers (no inbound edges)
// and a visited-node set guards against cycles. Used to animate only the flow that leads INTO the
// selected node — Unreal "tick" style — not the whole connected component.
export function upstreamChainEdgeIds(
  edges: { id: string; source: string; target: string; targetHandle?: string | null }[], nodeId: string,
): Set<string> {
  const incoming = new Map<string, { source: string; edgeId: string }[]>()
  for (const e of edges) {
    if (e.targetHandle === 'cond') continue   // condition feeders carry a boolean, not exec flow
    const list = incoming.get(e.target) ?? []
    list.push({ source: e.source, edgeId: e.id })
    incoming.set(e.target, list)
  }
  const out = new Set<string>()
  const seen = new Set<string>([nodeId])
  const stack = [nodeId]
  while (stack.length) {
    const n = stack.pop()!
    for (const { source, edgeId } of incoming.get(n) ?? []) {
      out.add(edgeId)
      if (!seen.has(source)) { seen.add(source); stack.push(source) }
    }
  }
  return out
}

// Drop pasted nodes whose type is a SINGLETON already present on the canvas — triggers (each maps 1:1
// to a Lua event function) and the file-top `setup` node. Edges touching a dropped node are removed
// too; the rest of the pasted subgraph survives. `existingSingletonTypes` = singleton node types
// already on the canvas (trigger:* and/or 'setup').
export function dropDuplicateSingletons<
  N extends { id: string; type: string },
  E extends { source: string; target: string },
>(nodes: N[], edges: E[], existingSingletonTypes: Set<string>): { nodes: N[]; edges: E[] } {
  const removed = new Set<string>()
  const kept = nodes.filter(n => {
    const isSingleton = n.type.startsWith('trigger:') || n.type === 'setup'
    if (isSingleton && existingSingletonTypes.has(n.type)) { removed.add(n.id); return false }
    return true
  })
  if (removed.size === 0) return { nodes, edges }
  return { nodes: kept, edges: edges.filter(e => !removed.has(e.source) && !removed.has(e.target)) }
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
