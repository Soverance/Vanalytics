import type { BagCapacities } from '../../types/api'

/**
 * Default slot capacity used when a bag's real unlocked capacity is unknown.
 * A character that has not re-synced with a capacity-aware addon has no capacity
 * data, so every bag falls back to 80 — pixel-identical to the pre-feature UI.
 */
export const DEFAULT_MAX_SLOTS = 80

/** Real unlocked capacity for a bag, or the 80 fallback when unknown / zero. */
export function capOf(capacities: BagCapacities, key: string): number {
  const cap = capacities[key]
  return typeof cap === 'number' && cap > 0 ? cap : DEFAULT_MAX_SLOTS
}

/** Sum of capOf over the given bag keys. */
export function sumCapacities(capacities: BagCapacities, keys: string[]): number {
  return keys.reduce((sum, key) => sum + capOf(capacities, key), 0)
}
