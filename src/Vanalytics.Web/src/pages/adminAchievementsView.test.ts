import { describe, it, expect } from 'vitest'
import { deriveRescoreView } from './adminAchievementsView'
import type { AchievementRescoreStatus } from '../types/api'

function status(overrides: Partial<AchievementRescoreStatus> = {}): AchievementRescoreStatus {
  return {
    isRunning: false,
    isStalled: false,
    processed: 0,
    total: 0,
    failed: 0,
    startedAt: null,
    finishedAt: null,
    lastError: null,
    lastErrorAt: null,
    ...overrides,
  }
}

describe('deriveRescoreView', () => {
  it('null status → idle, 0%, no progress shown', () => {
    const v = deriveRescoreView(null)
    expect(v.running).toBe(false)
    expect(v.pct).toBe(0)
    expect(v.showProgress).toBe(false)
    expect(v.failed).toBe(0)
    expect(v.stalled).toBe(false)
  })

  it('total=0 does not divide by zero → 0%', () => {
    const v = deriveRescoreView(status({ isRunning: true, processed: 0, total: 0 }))
    expect(v.pct).toBe(0)
    expect(v.running).toBe(true)
  })

  it('mid-run computes rounded percent and reports running', () => {
    const v = deriveRescoreView(status({ isRunning: true, processed: 42, total: 100 }))
    expect(v.running).toBe(true)
    expect(v.pct).toBe(42)
    expect(v.showProgress).toBe(true)
  })

  it('rounds fractional progress', () => {
    const v = deriveRescoreView(status({ isRunning: true, processed: 1, total: 3 }))
    expect(v.pct).toBe(33)
  })

  it('finished run (not running, finishedAt set) still shows progress', () => {
    const v = deriveRescoreView(
      status({ isRunning: false, processed: 100, total: 100, finishedAt: '2026-07-15T00:00:00Z' })
    )
    expect(v.running).toBe(false)
    expect(v.showProgress).toBe(true)
    expect(v.pct).toBe(100)
  })

  it('completed-but-not-running with no finishedAt hides progress', () => {
    const v = deriveRescoreView(status({ isRunning: false, processed: 0, total: 0, finishedAt: null }))
    expect(v.showProgress).toBe(false)
  })

  it('surfaces stalled flag', () => {
    const v = deriveRescoreView(status({ isRunning: true, isStalled: true, processed: 5, total: 10 }))
    expect(v.stalled).toBe(true)
  })

  it('stalled-but-not-running (finishedAt null) still shows progress so the stalled warning is reachable', () => {
    const v = deriveRescoreView(
      status({ isRunning: false, isStalled: true, finishedAt: null, processed: 5, total: 10, failed: 1 })
    )
    expect(v.stalled).toBe(true)
    expect(v.showProgress).toBe(true)
  })

  it('passes through failed count', () => {
    const v = deriveRescoreView(status({ isRunning: true, processed: 5, total: 10, failed: 3 }))
    expect(v.failed).toBe(3)
  })
})
