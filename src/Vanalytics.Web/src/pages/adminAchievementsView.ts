import type { AchievementRescoreStatus } from '../types/api'

export interface RescoreView {
  running: boolean
  pct: number
  showProgress: boolean
  failed: number
  stalled: boolean
}

/**
 * Pure render-model for the Achievements Admin "Rescore" section.
 * Derives everything the page needs from a rescore-status snapshot (or null
 * before the first fetch), guarding against divide-by-zero on total=0.
 */
export function deriveRescoreView(s: AchievementRescoreStatus | null): RescoreView {
  const running = s?.isRunning ?? false
  const pct = s && s.total > 0 ? Math.round((s.processed / s.total) * 100) : 0
  const showProgress = !!s && (running || s.isStalled || !!s.finishedAt)
  return {
    running,
    pct,
    showProgress,
    failed: s?.failed ?? 0,
    stalled: s?.isStalled ?? false,
  }
}
