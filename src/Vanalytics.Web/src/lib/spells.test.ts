import { describe, it, expect } from 'vitest'
import { spellWikiUrl, isScrollLearnable, isObtainable, SPELLS, type SpellCatalogEntry } from './spells'

const spell = (
  name: string,
  type: SpellCatalogEntry['type'],
): SpellCatalogEntry => ({ id: 1, name, type, mpCost: 0, minLevel: 1 })

describe('isScrollLearnable', () => {
  it('is true for scroll-taught types', () => {
    expect(isScrollLearnable('WhiteMagic')).toBe(true)
    expect(isScrollLearnable('BlackMagic')).toBe(true)
    expect(isScrollLearnable('Ninjutsu')).toBe(true)
    expect(isScrollLearnable('BardSong')).toBe(true)
    expect(isScrollLearnable('Geomancy')).toBe(true)
  })

  it('is false for types with no scroll', () => {
    expect(isScrollLearnable('BlueMagic')).toBe(false)
    expect(isScrollLearnable('SummonerPact')).toBe(false)
    expect(isScrollLearnable('Trust')).toBe(false)
  })
})

describe('spellWikiUrl', () => {
  it('links scroll-learnable spells to a "Scroll of {name}" search', () => {
    expect(spellWikiUrl(spell('Cure', 'WhiteMagic'))).toBe(
      'https://www.bg-wiki.com/index.php?search=Scroll%20of%20Cure',
    )
  })

  it('encodes compound names with colons', () => {
    expect(spellWikiUrl(spell('Utsusemi: Ichi', 'Ninjutsu'))).toBe(
      'https://www.bg-wiki.com/index.php?search=Scroll%20of%20Utsusemi%3A%20Ichi',
    )
  })

  it('links scroll-less spells to the bare spell name', () => {
    expect(spellWikiUrl(spell('Sound Blast', 'BlueMagic'))).toBe(
      'https://www.bg-wiki.com/index.php?search=Sound%20Blast',
    )
    expect(spellWikiUrl(spell('Ifrit', 'SummonerPact'))).toBe(
      'https://www.bg-wiki.com/index.php?search=Ifrit',
    )
  })
})

describe('isObtainable', () => {
  it('is true for a normal player spell', () => {
    const cure = SPELLS.find(s => s.name === 'Cure')!
    expect(isObtainable(cure)).toBe(true)
  })

  it('is true for high-end sentinel-level spells (Death, Drain III)', () => {
    expect(isObtainable(SPELLS.find(s => s.name === 'Death')!)).toBe(true)
    expect(isObtainable(SPELLS.find(s => s.name === 'Drain III')!)).toBe(true)
  })

  it('is true for trusts', () => {
    expect(isObtainable(SPELLS.find(s => s.type === 'Trust')!)).toBe(true)
  })

  it('is false for NPC-only spells', () => {
    for (const name of ['Banish V', 'Firaga V', 'Poison V', 'Tractor II', 'Dokumori: San']) {
      expect(isObtainable(SPELLS.find(s => s.name === name)!), name).toBe(false)
    }
  })

  it('flags exactly the 28 known NPC-only catalog entries', () => {
    expect(SPELLS.filter(s => s.npcOnly).length).toBe(28)
  })
})
