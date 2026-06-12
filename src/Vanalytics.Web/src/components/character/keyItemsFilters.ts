import type { KeyItemCatalogEntry, KeyItemCategory } from '../../lib/key-items'

// Filters the key item catalog by category and a name substring, returning the
// matches sorted by name. Category and query compose as an intersection.
export function filterKeyItems(
  items: KeyItemCatalogEntry[],
  category: KeyItemCategory | 'All',
  query: string,
): KeyItemCatalogEntry[] {
  const q = query.trim().toLowerCase()
  return items
    .filter(k => category === 'All' || k.category === category)
    .filter(k => q === '' || k.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name))
}
