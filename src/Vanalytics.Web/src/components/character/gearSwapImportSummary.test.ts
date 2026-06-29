import { describe, it, expect } from 'vitest'
import { summarizeImport } from './gearSwapImportSummary'
import type { ImportSetPreview, ImportSlotPreview } from '../../types/api'

const slot = (o: Partial<ImportSlotPreview> = {}): ImportSlotPreview => ({
  slot: 'Head', rawName: 'x', itemId: 1, itemName: 'x',
  matchKind: 'exact', owned: true, augments: [], ...o,
})
const mkSet = (o: Partial<ImportSetPreview> = {}): ImportSetPreview => ({
  name: 'S', category: 'Idle', luaKey: 'idle', overwritesExisting: false, slots: [], ...o,
})

describe('summarizeImport', () => {
  it('rolls up totals, overwrite/new, unresolved and not-owned slots', () => {
    const sets = [
      mkSet({ overwritesExisting: true, slots: [slot(), slot({ matchKind: 'unresolved', itemId: 0, owned: false })] }),
      mkSet({ slots: [slot({ owned: false })] }), // resolved but not owned
    ]
    const s = summarizeImport(sets)
    expect(s.total).toBe(2)
    expect(s.overwrite).toBe(1)
    expect(s.newSets).toBe(1)
    expect(s.unresolvedSlots).toBe(1)
    expect(s.notOwnedSlots).toBe(1) // the unresolved slot is NOT also counted as not-owned
  })

  it('handles an empty batch', () => {
    expect(summarizeImport([])).toEqual({ total: 0, overwrite: 0, newSets: 0, unresolvedSlots: 0, notOwnedSlots: 0 })
  })
})
