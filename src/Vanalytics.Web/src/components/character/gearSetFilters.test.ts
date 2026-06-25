import { describe, it, expect } from 'vitest'
import {
  buildTree, distinctTags, filterSets, visibleSlice, UNASSIGNED_JOB, ROW_CAP,
} from './gearSetFilters'
import type { GearSetSummary } from '../../types/api'

const set = (over: Partial<GearSetSummary>): GearSetSummary => ({
  id: 1, name: 'Set', job: 'THF', category: 'WeaponSkill', tags: [],
  slotCount: 0, unresolvedCount: 0, notOwnedCount: null,
  updatedAt: '2026-01-01T00:00:00Z', ...over,
})

describe('buildTree', () => {
  it('groups by job then category with counts, jobs in canonical order, Unassigned last', () => {
    const tree = buildTree([
      set({ id: 1, job: 'THF', category: 'WeaponSkill' }),
      set({ id: 2, job: 'THF', category: 'Idle' }),
      set({ id: 3, job: 'WAR', category: 'Engaged' }),
      set({ id: 4, job: null, category: 'Other' }),
    ])
    expect(tree.map(n => n.job)).toEqual(['WAR', 'THF', UNASSIGNED_JOB])
    const thf = tree.find(n => n.job === 'THF')!
    expect(thf.count).toBe(2)
    // Idle sorts before Weapon Skill per CATEGORY_ORDER.
    expect(thf.categories.map(c => c.category)).toEqual(['Idle', 'WeaponSkill'])
    expect(tree.find(n => n.job === UNASSIGNED_JOB)!.label).toBe('Unassigned')
  })
})

describe('distinctTags', () => {
  it('dedupes case-insensitively (first casing wins) and sorts', () => {
    const tags = distinctTags([
      set({ id: 1, tags: ['SATA', 'BiS'] }),
      set({ id: 2, tags: ['sata', 'Odyssey'] }),
    ])
    expect(tags).toEqual(['BiS', 'Odyssey', 'SATA'])
  })
})

describe('filterSets', () => {
  const data = [
    set({ id: 1, name: 'Rudra', job: 'THF', category: 'WeaponSkill', tags: ['SATA'], slotCount: 15, updatedAt: '2026-03-01T00:00:00Z' }),
    set({ id: 2, name: 'Accuracy', job: 'THF', category: 'Engaged', tags: ['TH'], slotCount: 16, updatedAt: '2026-02-01T00:00:00Z' }),
    set({ id: 3, name: 'Idle', job: 'WAR', category: 'Idle', tags: [], slotCount: 14, updatedAt: '2026-04-01T00:00:00Z' }),
  ]
  const base = { job: null, category: null, search: '', tags: [], sort: 'name' as const }

  it('filters by job key', () => {
    expect(filterSets(data, { ...base, job: 'THF' }).map(s => s.id)).toEqual([2, 1])
  })
  it('filters by job + category', () => {
    expect(filterSets(data, { ...base, job: 'THF', category: 'WeaponSkill' }).map(s => s.id)).toEqual([1])
  })
  it('search matches name OR tag', () => {
    expect(filterSets(data, { ...base, search: 'sata' }).map(s => s.id)).toEqual([1])
    expect(filterSets(data, { ...base, search: 'idl' }).map(s => s.id)).toEqual([3])
  })
  it('tag filter ANDs', () => {
    expect(filterSets(data, { ...base, tags: ['TH'] }).map(s => s.id)).toEqual([2])
    expect(filterSets(data, { ...base, tags: ['TH', 'SATA'] })).toEqual([])
  })
  it('sorts by updated desc and slots desc', () => {
    expect(filterSets(data, { ...base, sort: 'updated' }).map(s => s.id)).toEqual([3, 1, 2])
    expect(filterSets(data, { ...base, sort: 'slots' }).map(s => s.id)).toEqual([2, 1, 3])
  })
})

describe('visibleSlice', () => {
  it('caps at ROW_CAP until expanded', () => {
    const rows = Array.from({ length: ROW_CAP + 5 }, (_, i) => i)
    const capped = visibleSlice(rows, false)
    expect(capped.shown).toHaveLength(ROW_CAP)
    expect(capped.hiddenCount).toBe(5)
    expect(visibleSlice(rows, true).hiddenCount).toBe(0)
  })
})
