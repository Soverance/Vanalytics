// Client mirror of Vanalytics.Core.Enums.GearSetCategory. `value` is the stored enum
// name (and the future GearSwap namespace key); `label` is the player-facing text.
export interface GearSetCategory {
  value: string
  label: string
}

export const GEAR_SET_CATEGORIES: GearSetCategory[] = [
  { value: 'Idle', label: 'Idle' },
  { value: 'Engaged', label: 'Engaged' },
  { value: 'WeaponSkill', label: 'Weapon Skill' },
  { value: 'JobAbility', label: 'Job Ability' },
  { value: 'Precast', label: 'Precast' },
  { value: 'Midcast', label: 'Midcast' },
  { value: 'Aftercast', label: 'Aftercast' },
  { value: 'Weapons', label: 'Weapons' },
  { value: 'Other', label: 'Other' },
]

export const CATEGORY_ORDER: string[] = GEAR_SET_CATEGORIES.map(c => c.value)

export const categoryLabel = (value: string): string =>
  GEAR_SET_CATEGORIES.find(c => c.value === value)?.label ?? value

export interface CategoryGroup<T> {
  category: string
  label: string
  rows: T[]
}

const categoryRank = (cat: string): number => {
  const i = CATEGORY_ORDER.indexOf(cat)
  return i < 0 ? CATEGORY_ORDER.length : i
}

/** Groups rows by their `category` field, ordered by CATEGORY_ORDER (unknowns last),
 *  preserving input order within each group. */
export function groupByCategory<T extends { category: string }>(rows: T[]): CategoryGroup<T>[] {
  const byCat = new Map<string, T[]>()
  for (const r of rows) {
    const arr = byCat.get(r.category) ?? []
    arr.push(r)
    byCat.set(r.category, arr)
  }
  return [...byCat.entries()]
    .map(([category, rs]) => ({ category, label: categoryLabel(category), rows: rs }))
    .sort((a, b) => categoryRank(a.category) - categoryRank(b.category))
}
