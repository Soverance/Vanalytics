import { describe, it, expect } from 'vitest'
import { deriveSellAdvice, summarizeSellAdvice, THIN_DATA_THRESHOLD } from './sellAdvice'
import type { SellAdviceItem } from '../types/api'

// Minimal factory; override per test.
function item(over: Partial<SellAdviceItem>): SellAdviceItem {
  return {
    itemId: 1, itemName: 'X', iconPath: null, bag: 'Inventory', slotIndex: 0,
    quantity: 1, stackSize: 1, baseSell: null, isNoAuction: false,
    singleMedian: null, singleCount: 0, stackMedian: null, stackCount: 0, lastSoldAt: null,
    ...over,
  }
}

describe('deriveSellAdvice', () => {
  it('computes vendor total from baseSell × quantity', () => {
    const d = deriveSellAdvice(item({ quantity: 5, baseSell: 100 }))
    expect(d.vendorTotal).toBe(500)
  })

  it('treats baseSell 0 or null as not vendorable', () => {
    expect(deriveSellAdvice(item({ baseSell: 0 })).vendorTotal).toBeNull()
    expect(deriveSellAdvice(item({ baseSell: null })).vendorTotal).toBeNull()
  })

  it('uses single basis when all-singles beats stacks+remainder', () => {
    // qty 12, stack 12: singles = 12×5000=60000; stack = 1×55000=55000 → single wins.
    const d = deriveSellAdvice(item({ quantity: 12, stackSize: 12, singleMedian: 5000, singleCount: 8, stackMedian: 55000, stackCount: 4 }))
    expect(d.ahValue).toBe(60000)
    expect(d.ahBasis).toBe('single')
  })

  it('uses stack basis with remainder priced as singles', () => {
    // qty 13, stack 12: stack = 1×55000 + 1×3000 = 58000; singles = 13×3000 = 39000 → stack wins.
    const d = deriveSellAdvice(item({ quantity: 13, stackSize: 12, singleMedian: 3000, singleCount: 6, stackMedian: 55000, stackCount: 5 }))
    expect(d.ahValue).toBe(58000)
    expect(d.ahBasis).toBe('stack')
  })

  it('ignores stack basis when quantity is below one full stack', () => {
    const d = deriveSellAdvice(item({ quantity: 5, stackSize: 12, singleMedian: 100, singleCount: 4, stackMedian: 9000, stackCount: 4 }))
    expect(d.ahValue).toBe(500)
    expect(d.ahBasis).toBe('single')
  })

  it('prices full stacks even when single median is missing', () => {
    // qty 24, stack 12, no single median: stack = 2×55000 = 110000; remainder 0.
    const d = deriveSellAdvice(item({ quantity: 24, stackSize: 12, singleMedian: null, stackMedian: 55000, stackCount: 4 }))
    expect(d.ahValue).toBe(110000)
    expect(d.ahBasis).toBe('stack')
  })

  it('returns null AH value when no medians exist', () => {
    const d = deriveSellAdvice(item({ quantity: 3 }))
    expect(d.ahValue).toBeNull()
    expect(d.ahBasis).toBeNull()
    expect(d.ahThin).toBe(false)
  })

  it('exposes the winning basis sale count', () => {
    const d = deriveSellAdvice(item({ quantity: 2, singleMedian: 5000, singleCount: 7 }))
    expect(d.ahCount).toBe(7)
    expect(deriveSellAdvice(item({ quantity: 1 })).ahCount).toBe(0)
  })

  it('flags thin data when the winning basis has fewer than the threshold sales', () => {
    const d = deriveSellAdvice(item({ quantity: 2, singleMedian: 5000, singleCount: THIN_DATA_THRESHOLD - 1 }))
    expect(d.ahThin).toBe(true)
  })

  it('does not flag thin data at or above the threshold', () => {
    const d = deriveSellAdvice(item({ quantity: 2, singleMedian: 5000, singleCount: THIN_DATA_THRESHOLD }))
    expect(d.ahThin).toBe(false)
  })

  it('recommends AH when AH value exceeds vendor', () => {
    const d = deriveSellAdvice(item({ quantity: 1, baseSell: 100, singleMedian: 5000, singleCount: 5 }))
    expect(d.best).toBe('AH')
    expect(d.bestValue).toBe(5000)
  })

  it('recommends Vendor when vendor meets or beats AH', () => {
    const d = deriveSellAdvice(item({ quantity: 1, baseSell: 5000, singleMedian: 5000, singleCount: 5 }))
    expect(d.best).toBe('Vendor')
    expect(d.bestValue).toBe(5000)
  })

  it('recommends the only available option', () => {
    expect(deriveSellAdvice(item({ baseSell: 200, quantity: 1 })).best).toBe('Vendor')
    expect(deriveSellAdvice(item({ singleMedian: 200, singleCount: 5, quantity: 1 })).best).toBe('AH')
  })
})

describe('summarizeSellAdvice', () => {
  it('sums vendor-everything, sell-optimally, upside, and count', () => {
    const items = [
      item({ quantity: 1, baseSell: 100, singleMedian: 5000, singleCount: 5 }), // vendor 100, best 5000
      item({ quantity: 2, baseSell: 300, singleMedian: 50, singleCount: 5 }),    // vendor 600, best 600 (vendor)
    ]
    const s = summarizeSellAdvice(items)
    expect(s.vendorEverything).toBe(700)   // 100 + 600
    expect(s.sellOptimally).toBe(5600)     // 5000 + 600
    expect(s.upside).toBe(4900)
    expect(s.count).toBe(2)
  })
})
