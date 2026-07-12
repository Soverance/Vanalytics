import { describe, it, expect, vi, afterEach } from 'vitest'
import { timeAgo } from './leaderboards'

describe('timeAgo', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns em-dash for null input', () => {
    expect(timeAgo(null)).toBe('—')
  })

  it('returns "just now" for a time less than 60 seconds ago', () => {
    const now = new Date('2026-07-11T12:00:00Z')
    vi.setSystemTime(now)
    const thirtySecondsAgo = new Date(now.getTime() - 30 * 1000).toISOString()
    expect(timeAgo(thirtySecondsAgo)).toBe('just now')
  })

  it('returns minutes ago for a time between 1 and 59 minutes ago', () => {
    const now = new Date('2026-07-11T12:00:00Z')
    vi.setSystemTime(now)
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString()
    expect(timeAgo(fiveMinutesAgo)).toBe('5m ago')
  })

  it('returns hours ago for a time between 1 and 23 hours ago', () => {
    const now = new Date('2026-07-11T12:00:00Z')
    vi.setSystemTime(now)
    const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString()
    expect(timeAgo(threeHoursAgo)).toBe('3h ago')
  })

  it('returns days ago for a time 24+ hours ago', () => {
    const now = new Date('2026-07-11T12:00:00Z')
    vi.setSystemTime(now)
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString()
    expect(timeAgo(twoDaysAgo)).toBe('2d ago')
  })
})
