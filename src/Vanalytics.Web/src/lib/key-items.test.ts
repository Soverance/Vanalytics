import { describe, it, expect } from 'vitest'
import { keyItemWikiUrl } from './key-items'

describe('keyItemWikiUrl', () => {
  it('builds a BG-Wiki search URL with the encoded name', () => {
    expect(keyItemWikiUrl('astral compass')).toBe(
      'https://www.bg-wiki.com/index.php?search=astral%20compass',
    )
  })

  it('encodes quotes and special characters', () => {
    expect(keyItemWikiUrl('"The Essence of Dance"')).toBe(
      'https://www.bg-wiki.com/index.php?search=%22The%20Essence%20of%20Dance%22',
    )
  })
})
