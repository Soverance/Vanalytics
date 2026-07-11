import { describe, it, expect } from 'vitest'
import { CHARACTER_ROLES, ROLE_ORDER, roleLabel, groupByRole } from './characterRoles'

describe('character role catalog', () => {
  it('lists the five selectable roles (no None)', () => {
    expect(CHARACTER_ROLES.map(r => r.value)).toEqual(['Main', 'Mule', 'Alt', 'Crafter', 'Merchant'])
  })

  it('orders Main first and None last', () => {
    expect(ROLE_ORDER[0]).toBe('Main')
    expect(ROLE_ORDER[ROLE_ORDER.length - 1]).toBe('None')
  })

  it('maps value to a player-facing label, falling back to the raw value', () => {
    expect(roleLabel('Merchant')).toBe('Merchant')
    expect(roleLabel('Whatever')).toBe('Whatever')
  })
})

describe('groupByRole', () => {
  it('orders groups by ROLE_ORDER and treats missing role as None', () => {
    const rows = [
      { id: 'a', role: 'Mule' },
      { id: 'b', role: 'Main' },
      { id: 'c' },              // missing -> None
      { id: 'd', role: 'Alt' },
    ]
    const groups = groupByRole(rows)
    expect(groups.map(g => g.role)).toEqual(['Main', 'Alt', 'Mule', 'None'])
  })

  it('preserves input order within a group', () => {
    const rows = [
      { id: 'a', role: 'Mule' },
      { id: 'b', role: 'Mule' },
      { id: 'c', role: 'Mule' },
    ]
    const groups = groupByRole(rows)
    expect(groups).toHaveLength(1)
    expect(groups[0].rows.map(r => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('sorts an unknown role after the known ones but before nothing missing', () => {
    const rows = [{ id: 'a', role: 'Zzz' }, { id: 'b', role: 'Main' }]
    const groups = groupByRole(rows)
    expect(groups[0].role).toBe('Main')
    expect(groups[1].role).toBe('Zzz')
  })
})
