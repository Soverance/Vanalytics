import type { AggregateInventoryItem } from '../types/api'
import type { SellAdviceInput } from './sellAdvice'

/** True when the item's name (case-insensitive) or its numeric id contains the query. */
export function matchesItemQuery(item: { name: string; itemId: number }, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return item.name.toLowerCase().includes(q) || String(item.itemId).includes(q)
}

/** Filters items by query; returns all items when the query is empty/whitespace. */
export function filterAggregateItems<T extends { name: string; itemId: number }>(
  items: T[],
  query: string,
): T[] {
  const q = query.trim()
  if (!q) return items
  return items.filter((item) => matchesItemQuery(item, q))
}

/** True when an item's locations span 2+ distinct characters (a roster duplicate). */
export function isRosterDuplicate(item: { locations: { characterId: string }[] }): boolean {
  const chars = new Set(item.locations.map((l) => l.characterId))
  return chars.size >= 2
}

/** True when an item can be vendored (baseSell > 0) or auctioned (not no-auction). */
export function isSellable(item: { baseSell: number | null; isNoAuction: boolean }): boolean {
  return (item.baseSell ?? 0) > 0 || !item.isNoAuction
}

/** Maps an aggregate item to the sell-advice math input (quantity = world-total). */
export function toSellInput(item: AggregateInventoryItem): SellAdviceInput {
  return {
    quantity: item.totalQuantity,
    stackSize: item.stackSize,
    baseSell: item.baseSell,
    singleMedian: item.singleMedian,
    singleCount: item.singleCount,
    stackMedian: item.stackMedian,
    stackCount: item.stackCount,
  }
}
