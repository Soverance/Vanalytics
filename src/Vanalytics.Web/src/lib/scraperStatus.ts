// Pure derivation of the AH scraper's health badge from its run-state.
// Kept UI-free so it can be unit-tested and reused.

export interface ScraperStatus {
  isRunning: boolean
  lastCycleStartedAt: string | null
  lastCycleFinishedAt: string | null
  worldsProcessedLastCycle: number
  salesIngestedLastCycle: number
  lastError: string | null
  lastErrorAt: string | null
}

export type ScraperTone = 'green' | 'amber' | 'red' | 'gray'

export interface ScraperHealth {
  key: 'idle' | 'running' | 'active' | 'starting' | 'stalled' | 'error'
  label: string
  tone: ScraperTone
}

// The loop cycles every 5 min; treat >3 missed cycles as stalled.
export const STALL_THRESHOLD_MS = 15 * 60 * 1000

export function deriveScraperHealth(
  status: ScraperStatus | null,
  masterEnabled: boolean,
  now: number,
): ScraperHealth {
  if (!masterEnabled) return { key: 'idle', label: 'Idle', tone: 'gray' }
  if (status?.isRunning) return { key: 'running', label: 'Scraping now', tone: 'green' }
  if (status?.lastError) return { key: 'error', label: 'Error', tone: 'red' }
  if (!status?.lastCycleFinishedAt) return { key: 'starting', label: 'Waiting for first cycle', tone: 'amber' }

  const age = now - new Date(status.lastCycleFinishedAt).getTime()
  if (age > STALL_THRESHOLD_MS) return { key: 'stalled', label: 'Stalled', tone: 'red' }
  return { key: 'active', label: 'Active', tone: 'green' }
}
