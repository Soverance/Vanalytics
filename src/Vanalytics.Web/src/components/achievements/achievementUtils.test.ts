import { describe, it, expect } from 'vitest'
import { isPrivateRanking } from './achievementUtils'

describe('isPrivateRanking', () => {
  it('returns true when both ranks are null', () => {
    expect(isPrivateRanking(null, null)).toBe(true)
  })

  it('returns false when globalRank is set', () => {
    expect(isPrivateRanking(42, null)).toBe(false)
  })

  it('returns false when serverRank is set', () => {
    expect(isPrivateRanking(null, 7)).toBe(false)
  })

  it('returns false when both ranks are set', () => {
    expect(isPrivateRanking(1, 1)).toBe(false)
  })
})
