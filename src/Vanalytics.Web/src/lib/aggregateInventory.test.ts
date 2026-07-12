import { describe, it, expect } from 'vitest'
import { matchesItemQuery, filterAggregateItems, isRosterDuplicate, isSellable } from './aggregateInventory'

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

describe('isRosterDuplicate', () => {
  it('is true when locations span 2+ distinct characters', () => {
    expect(isRosterDuplicate({ locations: [
      { characterId: 'a' }, { characterId: 'b' },
    ] })).toBe(true)
  })
  it('is false for 2+ slots on ONE character', () => {
    expect(isRosterDuplicate({ locations: [
      { characterId: 'a' }, { characterId: 'a' },
    ] })).toBe(false)
  })
  it('is false for a single location', () => {
    expect(isRosterDuplicate({ locations: [{ characterId: 'a' }] })).toBe(false)
  })
})

describe('isSellable', () => {
  it('is true when vendorable', () => {
    expect(isSellable({ baseSell: 10, isNoAuction: true })).toBe(true)
  })
  it('is true when auctionable', () => {
    expect(isSellable({ baseSell: null, isNoAuction: false })).toBe(true)
  })
  it('is false when neither', () => {
    expect(isSellable({ baseSell: 0, isNoAuction: true })).toBe(false)
  })
})
