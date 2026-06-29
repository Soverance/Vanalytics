// src/Vanalytics.Web/src/lib/actionCatalogs.test.ts
import { describe, it, expect } from 'vitest'
import { WEAPON_SKILLS } from './weaponSkills'
import { JOB_ABILITIES } from './jobAbilities'

describe('action catalogs', () => {
  it('weapon skills parse with a plausible count and known entries', () => {
    expect(WEAPON_SKILLS.length).toBeGreaterThan(100)
    expect(WEAPON_SKILLS.find(w => w.name === 'Mercy Stroke')).toBeTruthy()
    expect(WEAPON_SKILLS.every(w => typeof w.id === 'number' && w.name.length > 0)).toBe(true)
  })
  it('job abilities parse with a plausible count and known entries', () => {
    expect(JOB_ABILITIES.length).toBeGreaterThan(50)
    expect(JOB_ABILITIES.find(a => a.name === 'Sneak Attack')).toBeTruthy()
  })
})
