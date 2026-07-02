import { describe, it, expect } from 'vitest'
import { deriveScraperHealth, STALL_THRESHOLD_MS, type ScraperStatus } from './scraperStatus'

const NOW = 1_700_000_000_000

function status(overrides: Partial<ScraperStatus> = {}): ScraperStatus {
  return {
    isRunning: false,
    lastCycleStartedAt: null,
    lastCycleFinishedAt: null,
    worldsProcessedLastCycle: 0,
    salesIngestedLastCycle: 0,
    lastError: null,
    lastErrorAt: null,
    ...overrides,
  }
}

describe('deriveScraperHealth', () => {
  it('is idle/gray when the master switch is off, regardless of run-state', () => {
    const h = deriveScraperHealth(status({ isRunning: true }), false, NOW)
    expect(h.key).toBe('idle')
    expect(h.tone).toBe('gray')
  })

  it('is running/green while a cycle is active', () => {
    const h = deriveScraperHealth(status({ isRunning: true }), true, NOW)
    expect(h.key).toBe('running')
    expect(h.tone).toBe('green')
  })

  it('is error/red when a whole-cycle error is recorded', () => {
    const h = deriveScraperHealth(status({ lastError: 'boom' }), true, NOW)
    expect(h.key).toBe('error')
    expect(h.tone).toBe('red')
  })

  it('is starting/amber when enabled but no cycle has finished yet', () => {
    const h = deriveScraperHealth(status(), true, NOW)
    expect(h.key).toBe('starting')
    expect(h.tone).toBe('amber')
  })

  it('is starting/amber when enabled and status has not loaded yet', () => {
    const h = deriveScraperHealth(null, true, NOW)
    expect(h.key).toBe('starting')
  })

  it('is active/green when the last cycle finished recently', () => {
    const finished = new Date(NOW - 60_000).toISOString()
    const h = deriveScraperHealth(status({ lastCycleFinishedAt: finished }), true, NOW)
    expect(h.key).toBe('active')
    expect(h.tone).toBe('green')
  })

  it('is stalled/red when the last cycle finished beyond the stall threshold', () => {
    const finished = new Date(NOW - STALL_THRESHOLD_MS - 1000).toISOString()
    const h = deriveScraperHealth(status({ lastCycleFinishedAt: finished }), true, NOW)
    expect(h.key).toBe('stalled')
    expect(h.tone).toBe('red')
  })
})
