import { describe, it, expect } from 'vitest'
import {
  buildPaletteGroups, isGroupExpanded, GROUP_ORDER, DEFAULT_EXPANDED_GROUPS, parseContextSensitive,
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
    expect(byType('spell')?.label).toBe('Action')
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
