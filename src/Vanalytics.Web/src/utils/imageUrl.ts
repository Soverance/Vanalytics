/** Resolve an item image path to a full URL. Handles both relative paths and legacy absolute blob URLs. */
export function itemImageUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `/item-images/${path}`
}
