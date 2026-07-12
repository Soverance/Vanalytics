import { describe, it, expect } from 'vitest'
import { capOf, sumCapacities, DEFAULT_MAX_SLOTS } from './inventoryCapacity'

describe('capOf', () => {
  it('returns the real capacity when it is a positive number', () => {
    expect(capOf({ Inventory: 30 }, 'Inventory')).toBe(30)
  })

  it('falls back to 80 when the bag is missing from the map', () => {
    expect(capOf({ Inventory: 30 }, 'Wardrobe')).toBe(DEFAULT_MAX_SLOTS)
  })

  it('falls back to 80 when the capacity is 0', () => {
    expect(capOf({ Case: 0 }, 'Case')).toBe(DEFAULT_MAX_SLOTS)
  })

  it('falls back to 80 for an empty (legacy) map', () => {
    expect(capOf({}, 'Inventory')).toBe(DEFAULT_MAX_SLOTS)
  })
})

describe('sumCapacities', () => {
  it('sums real capacities across the given bags', () => {
    expect(sumCapacities({ Inventory: 30, Safe: 50 }, ['Inventory', 'Safe'])).toBe(80)
  })

  it('uses the 80 fallback for bags absent from the map', () => {
    // Inventory=30 real, Wardrobe falls back to 80 => 110
    expect(sumCapacities({ Inventory: 30 }, ['Inventory', 'Wardrobe'])).toBe(110)
  })

  it('legacy empty map sums to activeBags * 80', () => {
    expect(sumCapacities({}, ['Inventory', 'Wardrobe', 'Safe'])).toBe(3 * DEFAULT_MAX_SLOTS)
  })
})
