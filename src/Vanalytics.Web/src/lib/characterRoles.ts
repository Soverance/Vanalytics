// Client mirror of Vanalytics.Core.Enums.CharacterRole. `value` is the stored
// enum name (matches the API string); `label` is the player-facing text. `None`
// is the unlabeled default and is intentionally NOT selectable in the picker.
export interface CharacterRoleDef {
  value: string
  label: string
}

// Selectable roles, in picker order. Excludes 'None' (cleared via a separate action).
export const CHARACTER_ROLES: CharacterRoleDef[] = [
  { value: 'Main', label: 'Main' },
  { value: 'Mule', label: 'Mule' },
  { value: 'Alt', label: 'Alt' },
  { value: 'Crafter', label: 'Crafter' },
  { value: 'Merchant', label: 'Merchant' },
]

// Display/sort order for grouping the characters list. 'None' (unlabeled) sorts last.
export const ROLE_ORDER: string[] = ['Main', 'Alt', 'Crafter', 'Merchant', 'Mule', 'None']

// Label shown for the unlabeled group.
export const UNLABELED_LABEL = 'Unlabeled'

export const roleLabel = (value: string): string =>
  value === 'None'
    ? UNLABELED_LABEL
    : CHARACTER_ROLES.find(r => r.value === value)?.label ?? value

export interface RoleGroup<T> {
  role: string
  label: string
  rows: T[]
}

const normalizeRole = (role?: string): string => (role && role.length > 0 ? role : 'None')

const roleRank = (role: string): number => {
  const i = ROLE_ORDER.indexOf(role)
  return i < 0 ? ROLE_ORDER.length : i
}

/** Groups rows by their `role` field (missing/empty -> 'None'), ordered by
 *  ROLE_ORDER (unknowns last), preserving input order within each group. */
export function groupByRole<T extends { role?: string }>(rows: T[]): RoleGroup<T>[] {
  const byRole = new Map<string, T[]>()
  for (const r of rows) {
    const key = normalizeRole(r.role)
    const arr = byRole.get(key) ?? []
    arr.push(r)
    byRole.set(key, arr)
  }
  return [...byRole.entries()]
    .map(([role, rs]) => ({ role, label: roleLabel(role), rows: rs }))
    .sort((a, b) => roleRank(a.role) - roleRank(b.role))
}
