import type { SellAdviceItem } from '../types/api'

export type SellAdviceInput = Pick<
  SellAdviceItem,
  'quantity' | 'stackSize' | 'baseSell' | 'singleMedian' | 'singleCount' | 'stackMedian' | 'stackCount'
>

/** Winning AH basis with fewer than this many sales in the window is "thin" (low confidence). */
export const THIN_DATA_THRESHOLD = 3

export interface DerivedSellAdvice {
  /** quantity × baseSell, or null when the item is not vendorable. */
  vendorTotal: number | null
  /** Best-of single/stack AH estimate, or null when no AH sales exist. */
  ahValue: number | null
  ahBasis: 'single' | 'stack' | null
  /** Number of sales backing the winning basis (0 when no AH data). */
  ahCount: number
  /** True when the winning basis is backed by fewer than THIN_DATA_THRESHOLD sales. */
  ahThin: boolean
  /** The better liquidation option, or null when neither is available. */
  best: 'AH' | 'Vendor' | null
  /** max(vendorTotal ?? 0, ahValue ?? 0) — used for sorting and the optimal total. */
  bestValue: number
}

interface Candidate {
  basis: 'single' | 'stack'
  value: number
  count: number
}

export function deriveSellAdvice(item: SellAdviceInput): DerivedSellAdvice {
  const { quantity, stackSize, baseSell, singleMedian, singleCount, stackMedian, stackCount } = item

  const vendorTotal = baseSell != null && baseSell > 0 ? quantity * baseSell : null

  const candidates: Candidate[] = []

  if (singleMedian != null) {
    candidates.push({ basis: 'single', value: quantity * singleMedian, count: singleCount })
  }

  // Stack basis only applies to stackable items when we hold at least one full stack.
  if (stackMedian != null && stackSize > 1 && quantity >= stackSize) {
    const fullStacks = Math.floor(quantity / stackSize)
    const remainder = quantity % stackSize
    const remainderValue = singleMedian != null ? remainder * singleMedian : 0
    candidates.push({ basis: 'stack', value: fullStacks * stackMedian + remainderValue, count: stackCount })
  }

  let ahValue: number | null = null
  let ahBasis: 'single' | 'stack' | null = null
  let ahCount = 0
  let ahThin = false
  for (const c of candidates) {
    if (ahValue === null || c.value > ahValue) {
      ahValue = c.value
      ahBasis = c.basis
      ahCount = c.count
      ahThin = c.count < THIN_DATA_THRESHOLD
    }
  }

  let best: 'AH' | 'Vendor' | null
  if (vendorTotal != null && ahValue != null) best = ahValue > vendorTotal ? 'AH' : 'Vendor'
  else if (ahValue != null) best = 'AH'
  else if (vendorTotal != null) best = 'Vendor'
  else best = null

  const bestValue = Math.max(vendorTotal ?? 0, ahValue ?? 0)

  return { vendorTotal, ahValue, ahBasis, ahCount, ahThin, best, bestValue }
}

export function summarizeSellAdvice(items: SellAdviceInput[]) {
  let vendorEverything = 0
  let sellOptimally = 0
  for (const item of items) {
    const d = deriveSellAdvice(item)
    vendorEverything += d.vendorTotal ?? 0
    sellOptimally += d.bestValue
  }
  return {
    vendorEverything,
    sellOptimally,
    upside: sellOptimally - vendorEverything,
    count: items.length,
  }
}
