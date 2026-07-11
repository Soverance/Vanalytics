import { describe, it, expect } from 'vitest'
import { categoryBarPct, isPrivateRanking } from './achievementUtils'
import type { AchievementCategoryScore } from '../../types/api'

function makeRow(current: number | null, total: number | null): AchievementCategoryScore {
  return { key: 'test', name: 'Test', points: 10, current, total, detail: '' }
}

describe('categoryBarPct', () => {
  it('returns null when current is null', () => {
    expect(categoryBarPct(makeRow(null, 100))).toBeNull()
  })

  it('returns null when total is null', () => {
    expect(categoryBarPct(makeRow(50, null))).toBeNull()
  })

  it('returns null when total is zero', () => {
    expect(categoryBarPct(makeRow(50, 0))).toBeNull()
  })

  it('returns correct percentage', () => {
    expect(categoryBarPct(makeRow(30, 100))).toBe(30)
  })

  it('caps at 100 when current exceeds total', () => {
    expect(categoryBarPct(makeRow(120, 100))).toBe(100)
  })

  it('returns 0 when current is 0', () => {
    expect(categoryBarPct(makeRow(0, 100))).toBe(0)
  })
})

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
