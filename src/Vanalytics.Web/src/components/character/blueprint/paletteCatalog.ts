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
}

// Menu group order, top → bottom. Triggers/Equip lead because they're the everyday building blocks.
export const GROUP_ORDER = [
  'Triggers', 'Equip', 'Pet Events', 'Logic', 'Conditions', 'Values', 'Output', 'Annotation', 'Setup',
] as const

// Groups expanded the first time the palette is shown; everything else starts collapsed.
export const DEFAULT_EXPANDED_GROUPS = new Set<string>(['Triggers', 'Equip'])

export const STATIC_ITEMS: PaletteItem[] = [
  { key: 'trigger:precast', type: 'trigger:precast', label: 'precast', group: 'Triggers', color: '#b3344a' },
  { key: 'trigger:aftercast', type: 'trigger:aftercast', label: 'aftercast', group: 'Triggers', color: '#b3344a' },
  { key: 'trigger:midcast', type: 'trigger:midcast', label: 'midcast', group: 'Triggers', color: '#b3344a' },
  { key: 'trigger:status_change', type: 'trigger:status_change', label: 'status_change', group: 'Triggers', color: '#b3344a' },
  { key: 'trigger:buff_change', type: 'trigger:buff_change', label: 'buff_change', group: 'Triggers', color: '#b3344a' },
  { key: 'trigger:pet_change', type: 'trigger:pet_change', label: 'pet_change', group: 'Pet Events', color: '#b3344a' },
  { key: 'trigger:pet_status_change', type: 'trigger:pet_status_change', label: 'pet_status_change', group: 'Pet Events', color: '#b3344a' },
  { key: 'trigger:pet_midcast', type: 'trigger:pet_midcast', label: 'pet_midcast', group: 'Pet Events', color: '#b3344a' },
  { key: 'trigger:pet_aftercast', type: 'trigger:pet_aftercast', label: 'pet_aftercast', group: 'Pet Events', color: '#b3344a' },
  { key: 'equip', type: 'equip', label: 'Equip', group: 'Equip', color: '#6366f1' },
  { key: 'mode', type: 'mode', label: 'Mode', group: 'Equip', color: '#34d399' },
  { key: 'branch', type: 'branch', label: 'Branch', group: 'Logic', color: '#94a3b8' },
  { key: 'op:and', type: 'op:and', label: 'AND', group: 'Logic', color: '#a78bfa' },
  { key: 'op:or', type: 'op:or', label: 'OR', group: 'Logic', color: '#a78bfa' },
  { key: 'op:not', type: 'op:not', label: 'NOT', group: 'Logic', color: '#a78bfa' },
  { key: 'op:compare', type: 'op:compare', label: 'Compare', group: 'Conditions', color: '#f59e0b' },
  { key: 'spell', type: 'spell', label: 'Action', group: 'Conditions', color: '#a78bfa' },
  { key: 'pet', type: 'pet', label: 'Pet State', group: 'Conditions', color: '#fb923c' },
  { key: 'world', type: 'world', label: 'World State', group: 'Conditions', color: '#2dd4bf' },
  ...VALUE_SOURCES.map(r => ({
    key: `value:${r.value}`, type: 'value' as const, label: r.label, group: 'Values', color: '#38bdf8',
    data: { resource: r.value },
  })),
  { key: 'lua', type: 'lua', label: 'Script', group: 'Output', color: '#eab308' },
  { key: 'print', type: 'print', label: 'Print', group: 'Output', color: '#f472b6' },
  { key: 'comment', type: 'comment', label: 'Comment', group: 'Annotation', color: '#e5e7eb' },
  { key: 'setup', type: 'setup', label: 'Setup', group: 'Setup', color: '#eab308' },
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
  const items = pool.filter(i => (!opts.filter || opts.filter(i.type)) && (!q || i.label.toLowerCase().includes(q)))
  const order = GROUP_ORDER as readonly string[]
  const present = [...new Set(items.map(i => i.group))].sort((a, b) => order.indexOf(a) - order.indexOf(b))
  return present.map(g => ({ group: g, items: items.filter(i => i.group === g) }))
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
