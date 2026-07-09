import { describe, it, expect } from 'vitest'
import { BLU_CLASSIFICATION } from './bluClassification'
import { SPELLS } from './spells'

const BLU_STATS = new Set(['STR', 'DEX', 'VIT', 'AGI', 'INT', 'MND', 'CHR'])
const BLU_CLASSES = new Set(['Physical', 'Magical', 'Breath', 'Healing', 'Buff', 'Stun', 'Skill'])

const obtainableBlu = new Map(
  SPELLS.filter(s => s.type === 'BlueMagic' && !s.npcOnly).map(s => [s.id, s.name]),
)

describe('BLU_CLASSIFICATION integrity', () => {
  it('keys map to obtainable BLU spell ids', () => {
    for (const idStr of Object.keys(BLU_CLASSIFICATION))
      expect(obtainableBlu.has(Number(idStr)), `id ${idStr} is not an obtainable BLU spell`).toBe(true)
  })

  it('uses only valid class / stat / unbridled values', () => {
    for (const [idStr, c] of Object.entries(BLU_CLASSIFICATION)) {
      expect(BLU_CLASSES.has(c.class), `${idStr}: bad class ${c.class}`).toBe(true)
      if (c.stat !== undefined) expect(BLU_STATS.has(c.stat), `${idStr}: bad stat ${c.stat}`).toBe(true)
      if (c.unbridled !== undefined) expect(c.unbridled, `${idStr}: unbridled must be true when present`).toBe(true)
    }
  })

  it('only stat-bearing classes carry a stat', () => {
    for (const [idStr, c] of Object.entries(BLU_CLASSIFICATION))
      if (c.stat !== undefined)
        expect(['Physical', 'Magical'].includes(c.class), `${idStr}: ${c.class} must not carry a stat`).toBe(true)
  })
})
