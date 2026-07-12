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
