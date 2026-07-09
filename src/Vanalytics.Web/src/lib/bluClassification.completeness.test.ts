import { describe, it, expect } from 'vitest'
import { BLU_CLASSIFICATION } from './bluClassification'
import { SPELLS } from './spells'

// Spells intentionally left unclassified (document WHY inline). Keep empty unless a spell
// genuinely has no meaningful gearing category after BG-Wiki review.
const INTENTIONALLY_UNCLASSIFIED = new Set<number>([])

describe('BLU classification completeness', () => {
  it('every obtainable BLU spell is classified (or explicitly excluded)', () => {
    const missing = SPELLS
      .filter(s => s.type === 'BlueMagic' && !s.npcOnly)
      .filter(s => !(s.id in BLU_CLASSIFICATION) && !INTENTIONALLY_UNCLASSIFIED.has(s.id))
      .map(s => `${s.id} ${s.name}`)
    expect(missing, `unclassified BLU spells:\n${missing.join('\n')}`).toHaveLength(0)
  })
})
