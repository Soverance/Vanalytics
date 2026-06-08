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
