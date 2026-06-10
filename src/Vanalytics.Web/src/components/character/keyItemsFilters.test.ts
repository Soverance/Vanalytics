import { describe, it, expect } from 'vitest'
import { filterKeyItems } from './keyItemsFilters'
import type { KeyItemCatalogEntry } from '../../lib/key-items'

const items: KeyItemCatalogEntry[] = [
  { id: 1, name: 'airship pass', category: 'Permanent Key Items' },
  { id: 2, name: 'astral compass', category: 'Permanent Key Items' },
  { id: 3, name: 'map of Jeuno', category: 'Magical Maps' },
  { id: 4, name: 'Atma of the Lion', category: 'Abyssea' },
]

describe('filterKeyItems', () => {
  it('returns all items sorted by name when category is All and query is empty', () => {
    const result = filterKeyItems(items, 'All', '')
    expect(result.map(k => k.id)).toEqual([1, 2, 4, 3])
  })

  it('filters by category', () => {
    const result = filterKeyItems(items, 'Magical Maps', '')
    expect(result.map(k => k.id)).toEqual([3])
  })

  it('matches name case-insensitively as a substring', () => {
    const result = filterKeyItems(items, 'All', 'ATMA')
    expect(result.map(k => k.id)).toEqual([4])
  })

  it('composes category and query (intersection)', () => {
    const result = filterKeyItems(items, 'Permanent Key Items', 'compass')
    expect(result.map(k => k.id)).toEqual([2])
  })

  it('ignores surrounding whitespace in the query', () => {
    const result = filterKeyItems(items, 'All', '  airship  ')
    expect(result.map(k => k.id)).toEqual([1])
  })

  it('matches substrings mid-word (search-as-you-type)', () => {
    // 'pass' appears in both 'airship pass' and 'astral comPASS'.
    const result = filterKeyItems(items, 'All', 'pass')
    expect(result.map(k => k.id)).toEqual([1, 2])
  })

  it('returns empty when nothing matches', () => {
    expect(filterKeyItems(items, 'All', 'zzz')).toEqual([])
  })
})
