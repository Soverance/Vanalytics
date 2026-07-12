// Human labels for InventoryBag enum names. Mirrors the mapping used in the
// per-character inventory views.
export const BAG_LABELS: Record<string, string> = {
  Inventory: 'Inventory',
  Safe: 'Mog Safe',
  Safe2: 'Mog Safe 2',
  Storage: 'Storage',
  Locker: 'Mog Locker',
  Satchel: 'Mog Satchel',
  Sack: 'Mog Sack',
  Case: 'Mog Case',
  Wardrobe: 'Mog Wardrobe 1',
  Wardrobe2: 'Mog Wardrobe 2',
  Wardrobe3: 'Mog Wardrobe 3',
  Wardrobe4: 'Mog Wardrobe 4',
  Wardrobe5: 'Mog Wardrobe 5',
  Wardrobe6: 'Mog Wardrobe 6',
  Wardrobe7: 'Mog Wardrobe 7',
  Wardrobe8: 'Mog Wardrobe 8',
}

export const bagLabel = (key: string): string => BAG_LABELS[key] ?? key
