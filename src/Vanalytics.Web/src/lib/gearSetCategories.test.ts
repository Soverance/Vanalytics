import { describe, it, expect } from 'vitest'
import { groupByCategory } from './gearSetCategories'

describe('groupByCategory', () => {
  it('groups by category in CATEGORY_ORDER, preserving input order within a group', () => {
    const rows = [
      { category: 'WeaponSkill', name: 'b' },
      { category: 'Idle', name: 'a' },
      { category: 'WeaponSkill', name: 'a' },
    ]
    const groups = groupByCategory(rows)
    expect(groups.map(g => g.category)).toEqual(['Idle', 'WeaponSkill'])
    expect(groups.map(g => g.label)).toEqual(['Idle', 'Weapon Skill'])
    expect(groups[1].rows.map(r => r.name)).toEqual(['b', 'a']) // input order kept
  })

  it('sorts unknown categories last', () => {
    const rows = [{ category: 'Zzz' }, { category: 'Idle' }]
    expect(groupByCategory(rows).map(g => g.category)).toEqual(['Idle', 'Zzz'])
  })

  it('returns one group when all rows share a category', () => {
    expect(groupByCategory([{ category: 'Idle' }, { category: 'Idle' }])).toHaveLength(1)
  })
})
