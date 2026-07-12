import type { BlueprintNodeType } from '../../../types/api'
import { VALUE_SOURCES } from './blueprintGraph'
import { BUFFS } from '../../../lib/buffs'

export interface PaletteItem {
  key: string
  type: BlueprintNodeType
  label: string
  group: string
  color: string
  data?: Record<string, unknown>
  desc?: string          // one-line "what it does", rendered under the label
  keywords?: string[]    // extra search synonyms (never displayed)
  subgroup?: string      // optional sub-label within a group (e.g. "Action / spell")
}

// Menu group order, top → bottom. Triggers/Equip lead because they're the everyday building blocks.
export const GROUP_ORDER = [
  'Triggers', 'Equip', 'Pet Events', 'Logic', 'Conditions', 'Values', 'Output', 'Annotation', 'Setup',
] as const

export const GROUP_DESCRIPTIONS: Record<string, string> = {
  Triggers: 'When the blueprint runs — one node per GearSwap event.',
  Equip: 'What gear to put on, plus mode cycles.',
  'Pet Events': "Triggers that fire on your pet's actions.",
  Logic: 'Combine or branch on conditions.',
  Conditions: 'Tests that gate a branch — buffs, spells, HP, world state.',
  Values: 'Numeric sources for comparisons (HP%, TP, …).',
  Output: 'Run custom Lua or print a chat message.',
  Annotation: 'Notes for yourself — never emitted to Lua.',
  Setup: 'File-top Lua run once when the job loads.',
}

// Groups expanded the first time the palette is shown; everything else starts collapsed.
export const DEFAULT_EXPANDED_GROUPS = new Set<string>(['Triggers', 'Equip'])

export const STATIC_ITEMS: PaletteItem[] = [
  { key: 'trigger:precast', type: 'trigger:precast', label: 'precast', group: 'Triggers', color: '#b3344a',
    desc: 'Right before a WS / ability / spell goes off' },
  { key: 'trigger:aftercast', type: 'trigger:aftercast', label: 'aftercast', group: 'Triggers', color: '#b3344a',
    desc: 'Just after an action completes', keywords: ['recover'] },
  { key: 'trigger:midcast', type: 'trigger:midcast', label: 'midcast', group: 'Triggers', color: '#b3344a',
    desc: 'While a spell / ranged shot is in flight' },
  { key: 'trigger:status_change', type: 'trigger:status_change', label: 'status_change', group: 'Triggers', color: '#b3344a',
    desc: 'When you go Engaged / Idle / Resting', keywords: ['idle', 'engaged', 'resting', 'tp', 'melee'] },
  { key: 'trigger:buff_change', type: 'trigger:buff_change', label: 'buff_change', group: 'Triggers', color: '#b3344a',
    desc: 'When a buff is gained or lost', keywords: ['status', 'effect'] },
  { key: 'trigger:pet_change', type: 'trigger:pet_change', label: 'pet_change', group: 'Pet Events', color: '#b3344a',
    desc: 'When your pet appears or leaves', keywords: ['jug', 'automaton', 'wyvern', 'avatar'] },
  { key: 'trigger:pet_status_change', type: 'trigger:pet_status_change', label: 'pet_status_change', group: 'Pet Events', color: '#b3344a',
    desc: "When your pet's status changes" },
  { key: 'trigger:pet_midcast', type: 'trigger:pet_midcast', label: 'pet_midcast', group: 'Pet Events', color: '#b3344a',
    desc: "While your pet's ability is in flight" },
  { key: 'trigger:pet_aftercast', type: 'trigger:pet_aftercast', label: 'pet_aftercast', group: 'Pet Events', color: '#b3344a',
    desc: "Just after your pet's action" },
  { key: 'equip', type: 'equip', label: 'Equip', group: 'Equip', color: '#6366f1',
    desc: 'Put on a gear set', keywords: ['gear', 'set', 'wear'] },
  { key: 'mode', type: 'mode', label: 'Mode', group: 'Equip', color: '#34d399',
    desc: 'Cycle between gear sets with a command', keywords: ['toggle', 'cycle', 'tp', 'idle'] },
  { key: 'branch', type: 'branch', label: 'Branch', group: 'Logic', color: '#94a3b8',
    desc: 'Split the flow on a true/false test', keywords: ['if', 'condition'] },
  { key: 'op:and', type: 'op:and', label: 'AND', group: 'Logic', color: '#a78bfa',
    desc: 'True only when both inputs are true', keywords: ['both'] },
  { key: 'op:or', type: 'op:or', label: 'OR', group: 'Logic', color: '#a78bfa',
    desc: 'True when either input is true', keywords: ['either'] },
  { key: 'op:not', type: 'op:not', label: 'NOT', group: 'Logic', color: '#a78bfa',
    desc: 'Invert a condition', keywords: ['invert', 'negate'] },
  { key: 'op:compare', type: 'op:compare', label: 'Compare', group: 'Conditions', color: '#f59e0b',
    desc: 'Compare a value, e.g. HP% < 25', keywords: ['hp', 'tp', 'less', 'greater', 'threshold'] },
  { key: 'spell:name', type: 'spell', label: 'Spell/Action name', group: 'Conditions', subgroup: 'Action / spell', color: '#a78bfa',
    data: { spellField: 'name', spellValue: null },
    desc: 'Match a specific weapon skill, ability, or spell by name',
    keywords: ['action', 'weaponskill', 'ws', 'ability', 'ja', 'magic'] },
  { key: 'spell:skill', type: 'spell', label: 'Spell skill', group: 'Conditions', subgroup: 'Action / spell', color: '#a78bfa',
    data: { spellField: 'skill', spellValue: null },
    desc: 'Match a magic skill, e.g. Elemental Magic',
    keywords: ['school', 'elemental', 'enfeebling', 'healing'] },
  { key: 'spell:element', type: 'spell', label: 'Spell element', group: 'Conditions', subgroup: 'Action / spell', color: '#a78bfa',
    data: { spellField: 'element', spellValue: null },
    desc: "Match a spell's element",
    keywords: ['fire', 'ice', 'wind', 'earth', 'lightning', 'water', 'light', 'dark'] },
  { key: 'spell:bluCategory', type: 'spell', label: 'BLU category', group: 'Conditions', subgroup: 'Action / spell', color: '#a78bfa',
    data: { spellField: 'bluCategory', spellValue: null },
    desc: 'Match a Blue Magic bucket, e.g. Physical (STR)',
    keywords: ['blue magic', 'physical', 'magical', 'breath', 'stun', 'unbridled', 'stat'] },
  { key: 'spell:contains', type: 'spell', label: 'Name contains', group: 'Conditions', subgroup: 'Action / spell', color: '#a78bfa',
    data: { spellField: 'contains', spellValue: null },
    desc: 'Match a name substring / family, e.g. Waltz or Cure',
    keywords: ['family', 'substring', 'waltz', 'cure', 'step', 'roll'] },
  { key: 'pet', type: 'pet', label: 'Pet State', group: 'Conditions', color: '#fb923c',
    desc: 'Test your pet — exists, engaged, dead', keywords: ['pet', 'automaton', 'avatar'] },
  { key: 'world', type: 'world', label: 'World State', group: 'Conditions', color: '#2dd4bf',
    desc: 'Test weather / day / zone / mog house', keywords: ['weather', 'day', 'zone', 'moghouse'] },
  ...VALUE_SOURCES.map(r => ({
    key: `value:${r.value}`, type: 'value' as const, label: r.label, group: 'Values', color: '#38bdf8',
    data: { resource: r.value },
    desc: `Use ${r.label} as a number to compare`,
  })),
  { key: 'lua', type: 'lua', label: 'Script', group: 'Output', color: '#eab308',
    desc: 'Run a custom line of Lua', keywords: ['script', 'code'] },
  { key: 'print', type: 'print', label: 'Print', group: 'Output', color: '#f472b6',
    desc: 'Print a message to the chat log', keywords: ['echo', 'chat', 'say'] },
  { key: 'comment', type: 'comment', label: 'Comment', group: 'Annotation', color: '#e5e7eb',
    desc: 'A note on the canvas (not emitted)', keywords: ['note', 'label'] },
  { key: 'setup', type: 'setup', label: 'Setup', group: 'Setup', color: '#eab308',
    desc: 'Lua run once at the top of the file', keywords: ['include', 'init', 'require'] },
]

// Buff presets are a large catalog surfaced only when the user searches. They belong to Conditions
// (a buff_change branch is a condition); with Conditions collapsed by default they stay out of the way.
export const BUFF_ITEMS: PaletteItem[] = BUFFS.map(b => ({
  key: `buff:${b.id}`, type: 'buff' as const, label: b.label, group: 'Conditions', color: '#34d399',
  data: { buffName: b.name },
}))

export interface PaletteGroup { group: string; items: PaletteItem[] }

// Ordered, filtered groups for the menu. Buff presets are pooled in only when a query is present;
// the optional `filter` still excludes them (e.g. a non-buff drag-connect) even while a query pools them in.
export function buildPaletteGroups(opts: { query: string; filter?: (t: BlueprintNodeType) => boolean }): PaletteGroup[] {
  const q = opts.query.trim().toLowerCase()
  const pool = q ? [...STATIC_ITEMS, ...BUFF_ITEMS] : STATIC_ITEMS
  const matches = (i: PaletteItem): boolean => {
    if (!q) return true
    if (i.label.toLowerCase().includes(q)) return true
    if (i.desc?.toLowerCase().includes(q)) return true
    return (i.keywords ?? []).some(k => k.toLowerCase().includes(q))
  }
  const items = pool.filter(i => (!opts.filter || opts.filter(i.type)) && matches(i))
  const order = GROUP_ORDER as readonly string[]
  const present = [...new Set(items.map(i => i.group))].sort((a, b) => order.indexOf(a) - order.indexOf(b))
  return present.map(g => ({ group: g, items: items.filter(i => i.group === g) }))
}

export type PaletteRow =
  | { kind: 'subheader'; label: string }
  | { kind: 'item'; item: PaletteItem }

// Interleave subgroup sub-labels into a group's item list. A subheader is emitted whenever the
// running subgroup changes (items in a group are ordered so a subgroup's members are contiguous).
export function paletteRows(items: PaletteItem[]): PaletteRow[] {
  const rows: PaletteRow[] = []
  let last: string | undefined
  for (const i of items) {
    if (i.subgroup && i.subgroup !== last) rows.push({ kind: 'subheader', label: i.subgroup })
    last = i.subgroup
    rows.push({ kind: 'item', item: i })
  }
  return rows
}

// Whether a group renders expanded right now. A non-empty query forces every group open so search
// results are always visible. Otherwise an explicit user toggle wins, falling back to the default set.
export function isGroupExpanded(opts: { group: string; query: string; persisted: Record<string, boolean> }): boolean {
  if (opts.query.trim() !== '') return true
  if (opts.group in opts.persisted) return opts.persisted[opts.group]
  return DEFAULT_EXPANDED_GROUPS.has(opts.group)
}

const COLLAPSE_KEY = 'bp.palette.collapse.v1'

// Persisted map of groupName → user's explicit expanded/collapsed choice. Missing groups fall back
// to DEFAULT_EXPANDED_GROUPS. Guarded so SSR / disabled-storage never throws.
export function loadPaletteCollapse(): Record<string, boolean> {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(COLLAPSE_KEY) : null
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

export function savePaletteCollapse(state: Record<string, boolean>): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(COLLAPSE_KEY, JSON.stringify(state))
  } catch {
    /* ignore quota / disabled storage */
  }
}

const CONTEXT_SENSITIVE_KEY = 'bp.palette.context-sensitive.v1'

// Parse the stored Context-Sensitive flag. Only an explicit 'false' turns it off; unset/anything else
// → true (default-on). Pure (no storage access) so it can be unit-tested in the node env.
export function parseContextSensitive(raw: string | null): boolean {
  return raw !== 'false'
}

// Persisted Context-Sensitive toggle: ON filters the add-menu to position-valid nodes, OFF shows all.
// Guarded so SSR / disabled-storage never throws; defaults to ON.
export function loadContextSensitive(): boolean {
  try {
    return parseContextSensitive(
      typeof window !== 'undefined' ? window.localStorage.getItem(CONTEXT_SENSITIVE_KEY) : null)
  } catch {
    return true
  }
}

export function saveContextSensitive(value: boolean): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(CONTEXT_SENSITIVE_KEY, String(value))
  } catch {
    /* ignore quota / disabled storage */
  }
}
