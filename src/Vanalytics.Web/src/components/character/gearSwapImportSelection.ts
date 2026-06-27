import type { ImportSetPreview } from '../../types/api'
import type { ImportCommitSet } from '../../api/gearSwapImport'

export interface SelectableSet {
  name: string
  include: boolean
}

/** Auto-applied marker for sets created by a GearSwap import (vs. hand-built). */
export const IMPORTED_TAG = 'imported'

/** Drops the 'imported' marker (case-insensitive) — used when an imported set is edited
 *  and saved, since it's no longer a pristine import. No-op when the tag isn't present. */
export function stripImportedTag(tags: string[]): string[] {
  return tags.filter(t => t.toLowerCase() !== IMPORTED_TAG)
}

/** Turns the preview + the user's include flags into the commit payload.
 *  Unresolved slots (itemId 0) are preserved with their raw name. */
export function toCommitSets(
  preview: ImportSetPreview[],
  selection: SelectableSet[],
  job: string | null,
): ImportCommitSet[] {
  const included = new Set(selection.filter(s => s.include).map(s => s.name))
  return preview
    .filter(p => included.has(p.name))
    .map(p => ({
      name: p.name,
      job,
      category: p.category,
      tags: [IMPORTED_TAG],
      slots: p.slots.map(s => ({
        slot: s.slot,
        itemId: s.itemId,
        itemName: s.itemName,
        augments: s.augments,
      })),
    }))
}
