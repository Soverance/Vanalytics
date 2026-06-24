import { describe, it, expect } from 'vitest'
import { toCommitSets, type SelectableSet } from './gearSwapImportSelection'
import type { ImportSetPreview } from '../../types/api'

const set = (name: string, over: Partial<ImportSetPreview> = {}): ImportSetPreview => ({
  name, category: 'Engaged', luaKey: name.toLowerCase(), overwritesExisting: false,
  slots: [
    { slot: 'Head', rawName: 'A', itemId: 1, itemName: 'A', matchKind: 'exact', owned: true, augments: [] },
    { slot: 'Main', rawName: 'B', itemId: 0, itemName: 'B', matchKind: 'unresolved', owned: false, augments: [] },
  ],
  ...over,
})

describe('toCommitSets', () => {
  it('includes only selected sets and tags them imported', () => {
    const preview = [set('Engaged'), set('Idle')]
    const selected: SelectableSet[] = [
      { name: 'Engaged', include: true },
      { name: 'Idle', include: false },
    ]
    const out = toCommitSets(preview, selected, 'THF')
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('Engaged')
    expect(out[0].job).toBe('THF')
    expect(out[0].tags).toContain('imported')
  })

  it('keeps unresolved slots with itemId 0 so nothing is lost', () => {
    const out = toCommitSets([set('Engaged')], [{ name: 'Engaged', include: true }], 'THF')
    const main = out[0].slots.find(s => s.slot === 'Main')!
    expect(main.itemId).toBe(0)
    expect(main.itemName).toBe('B')
  })
})
