import { describe, it, expect } from 'vitest'
import { matchesItemQuery, filterAggregateItems } from './aggregateInventory'

const items = [
  { name: 'Beastblood', itemId: 6001 },
  { name: 'Iron Ore', itemId: 6002 },
  { name: 'Fire Crystal', itemId: 4096 },
]

describe('matchesItemQuery', () => {
  it('matches case-insensitively on name substring', () => {
    expect(matchesItemQuery(items[0], 'beast')).toBe(true)
    expect(matchesItemQuery(items[0], 'BLOOD')).toBe(true)
    expect(matchesItemQuery(items[0], 'ore')).toBe(false)
  })

  it('matches on item id substring', () => {
    expect(matchesItemQuery(items[1], '6002')).toBe(true)
    expect(matchesItemQuery(items[1], '600')).toBe(true)
  })
})

describe('filterAggregateItems', () => {
  it('returns all items for an empty or whitespace query', () => {
    expect(filterAggregateItems(items, '')).toHaveLength(3)
    expect(filterAggregateItems(items, '   ')).toHaveLength(3)
  })

  it('filters by name', () => {
    const result = filterAggregateItems(items, 'crystal')
    expect(result).toEqual([{ name: 'Fire Crystal', itemId: 4096 }])
  })
})
