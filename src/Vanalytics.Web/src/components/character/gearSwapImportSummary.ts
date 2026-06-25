import type { ImportSetPreview } from '../../types/api'

export interface ImportSummary {
  total: number
  overwrite: number
  newSets: number
  unresolvedSlots: number
  notOwnedSlots: number
}

/** Roll-up counts across an import preview. A slot counts as not-owned only when it
 *  resolved to an item the character doesn't own; unresolved slots are counted separately. */
export function summarizeImport(sets: ImportSetPreview[]): ImportSummary {
  let overwrite = 0
  let unresolvedSlots = 0
  let notOwnedSlots = 0
  for (const s of sets) {
    if (s.overwritesExisting) overwrite++
    for (const slot of s.slots) {
      if (slot.matchKind === 'unresolved') unresolvedSlots++
      else if (!slot.owned) notOwnedSlots++
    }
  }
  return { total: sets.length, overwrite, newSets: sets.length - overwrite, unresolvedSlots, notOwnedSlots }
}
