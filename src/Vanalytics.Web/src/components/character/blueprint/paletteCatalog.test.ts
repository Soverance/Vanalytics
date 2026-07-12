import { describe, it, expect } from 'vitest'
import {
  buildPaletteGroups, isGroupExpanded, GROUP_ORDER, DEFAULT_EXPANDED_GROUPS, parseContextSensitive,
  STATIC_ITEMS, GROUP_DESCRIPTIONS, paletteRows,
} from './paletteCatalog'

describe('buildPaletteGroups', () => {
  it('returns groups in GROUP_ORDER and excludes buff presets without a query', () => {
    const groups = buildPaletteGroups({ query: '' })
    const order = GROUP_ORDER as readonly string[]
    const idxs = groups.map(g => order.indexOf(g.group))
    expect(idxs).toEqual([...idxs].sort((a, b) => a - b))   // already in canonical order
    expect(idxs.every(i => i >= 0)).toBe(true)              // no unknown groups
    expect(groups.flatMap(g => g.items).some(i => i.type === 'buff')).toBe(false)
  })

  it('uses the renamed labels and regrouping', () => {
    const items = buildPaletteGroups({ query: '' }).flatMap(g => g.items)
    const byType = (t: string) => items.find(i => i.type === t)
    expect(byType('equip')?.label).toBe('Equip')
    expect(byType('mode')?.label).toBe('Mode')
    expect(STATIC_ITEMS.find(i => i.key === 'spell:name')?.label).toBe('Spell/Action name')
    expect(byType('pet')?.label).toBe('Pet State')
    expect(byType('world')?.label).toBe('World State')
    expect(byType('lua')?.label).toBe('Script')
    expect(byType('print')?.label).toBe('Print')
    expect(byType('branch')?.label).toBe('Branch')
    expect(byType('op:compare')?.label).toBe('Compare')
    expect(byType('setup')?.label).toBe('Setup')
    expect(byType('equip')?.group).toBe('Equip')
    expect(byType('mode')?.group).toBe('Equip')
    expect(byType('op:compare')?.group).toBe('Conditions')
    expect(byType('spell')?.group).toBe('Conditions')
    expect(byType('lua')?.group).toBe('Output')
    expect(byType('print')?.group).toBe('Output')
    expect(byType('branch')?.group).toBe('Logic')
  })

  it('includes matching buff presets when a query is present', () => {
    const items = buildPaletteGroups({ query: 'haste' }).flatMap(g => g.items)
    expect(items.some(i => i.type === 'buff')).toBe(true)
    expect(items.every(i => i.label.toLowerCase().includes('haste'))).toBe(true)
    expect(items.filter(i => i.type === 'buff').every(i => i.group === 'Conditions')).toBe(true)
  })

  it('respects the drag-connect filter', () => {
    const groups = buildPaletteGroups({ query: '', filter: t => t === 'equip' })
    const items = groups.flatMap(g => g.items)
    expect(items).toHaveLength(1)
    expect(items[0].type).toBe('equip')
  })

  it('keeps the filter authoritative over buff presets even with a query', () => {
    const items = buildPaletteGroups({ query: 'haste', filter: t => t === 'buff' }).flatMap(g => g.items)
    expect(items.length).toBeGreaterThan(0)
    expect(items.every(i => i.type === 'buff')).toBe(true)
  })
})

describe('isGroupExpanded', () => {
  it('defaults to only Triggers and Equip expanded', () => {
    expect(isGroupExpanded({ group: 'Triggers', query: '', persisted: {} })).toBe(true)
    expect(isGroupExpanded({ group: 'Equip', query: '', persisted: {} })).toBe(true)
    expect(isGroupExpanded({ group: 'Conditions', query: '', persisted: {} })).toBe(false)
    expect(DEFAULT_EXPANDED_GROUPS.has('Triggers')).toBe(true)
    expect(DEFAULT_EXPANDED_GROUPS.has('Equip')).toBe(true)
  })

  it('forces every group expanded while a query is present', () => {
    expect(isGroupExpanded({ group: 'Conditions', query: 'ha', persisted: { Conditions: false } })).toBe(true)
  })

  it('lets an explicit persisted toggle override the default', () => {
    expect(isGroupExpanded({ group: 'Triggers', query: '', persisted: { Triggers: false } })).toBe(false)
    expect(isGroupExpanded({ group: 'Conditions', query: '', persisted: { Conditions: true } })).toBe(true)
  })
})

describe('parseContextSensitive', () => {
  it('defaults to true when unset or unparseable', () => {
    expect(parseContextSensitive(null)).toBe(true)
    expect(parseContextSensitive('')).toBe(true)
    expect(parseContextSensitive('yes')).toBe(true)
  })

  it('returns true for "true" and false for "false"', () => {
    expect(parseContextSensitive('true')).toBe(true)
    expect(parseContextSensitive('false')).toBe(false)
  })
})

describe('spell-field palette entries', () => {
  const spellItems = STATIC_ITEMS.filter(i => i.type === 'spell')

  it('surfaces all five spell match-modes as distinct entries', () => {
    const byKey = (k: string) => spellItems.find(i => i.key === k)
    expect(spellItems).toHaveLength(5)
    expect(byKey('spell:name')?.label).toBe('Spell/Action name')
    expect(byKey('spell:skill')?.label).toBe('Spell skill')
    expect(byKey('spell:element')?.label).toBe('Spell element')
    expect(byKey('spell:bluCategory')?.label).toBe('BLU category')
    expect(byKey('spell:contains')?.label).toBe('Name contains')
  })

  it('pre-seeds each with a complete, inspector-ready spell field', () => {
    const field = (k: string) => (STATIC_ITEMS.find(i => i.key === k)?.data as { spellField?: string; spellValue?: unknown } | undefined)
    expect(field('spell:name')).toEqual({ spellField: 'name', spellValue: null })
    expect(field('spell:bluCategory')).toEqual({ spellField: 'bluCategory', spellValue: null })
    expect(field('spell:contains')).toEqual({ spellField: 'contains', spellValue: null })
  })

  it('groups all five under Conditions / "Action / spell" subgroup', () => {
    for (const i of spellItems) {
      expect(i.group).toBe('Conditions')
      expect(i.subgroup).toBe('Action / spell')
    }
  })
})

describe('keyword/desc search', () => {
  it('finds the BLU entry by a synonym not in its label', () => {
    const items = buildPaletteGroups({ query: 'blue magic' }).flatMap(g => g.items)
    expect(items.some(i => i.key === 'spell:bluCategory')).toBe(true)
  })
  it('matches on description text', () => {
    const blu = STATIC_ITEMS.find(i => i.key === 'spell:bluCategory')!
    const word = blu.desc!.split(' ').find(w => w.length > 4)!.toLowerCase()
    const items = buildPaletteGroups({ query: word }).flatMap(g => g.items)
    expect(items.some(i => i.key === 'spell:bluCategory')).toBe(true)
  })
  it('excludes non-matching queries', () => {
    const items = buildPaletteGroups({ query: 'zzzznotathing' }).flatMap(g => g.items)
    expect(items).toHaveLength(0)
  })
})

describe('GROUP_DESCRIPTIONS', () => {
  it('has a non-empty description for every group in GROUP_ORDER', () => {
    for (const g of GROUP_ORDER) expect((GROUP_DESCRIPTIONS[g] ?? '').length).toBeGreaterThan(0)
  })
})

describe('paletteRows', () => {
  it('inserts one subheader before a contiguous subgroup run', () => {
    const items = STATIC_ITEMS.filter(i => i.group === 'Conditions')
    const rows = paletteRows(items)
    const subs = rows.filter(r => r.kind === 'subheader')
    expect(subs).toHaveLength(1)
    expect(subs[0]).toEqual({ kind: 'subheader', label: 'Action / spell' })
    const subIdx = rows.findIndex(r => r.kind === 'subheader')
    const next = rows[subIdx + 1]
    expect(next.kind === 'item' && next.item.type === 'spell').toBe(true)
  })
  it('emits no subheader when no item has a subgroup', () => {
    const items = STATIC_ITEMS.filter(i => i.group === 'Values')
    expect(paletteRows(items).every(r => r.kind === 'item')).toBe(true)
  })
})

describe('palette item descriptions', () => {
  it('every static item has a non-empty description', () => {
    const missing = STATIC_ITEMS.filter(i => !(i.desc && i.desc.trim().length > 0)).map(i => i.key)
    expect(missing, `items missing desc: ${missing.join(', ')}`).toHaveLength(0)
  })
})
