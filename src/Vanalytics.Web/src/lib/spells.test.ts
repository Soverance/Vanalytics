import { describe, it, expect } from 'vitest'
import { spellWikiUrl, isScrollLearnable, type SpellCatalogEntry } from './spells'

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
