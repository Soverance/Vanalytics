import type { AchievementCategoryScore } from '../../types/api'

/** Returns the progress percentage (0-100) for a category row, or null when progress is unavailable. */
export function categoryBarPct(cat: AchievementCategoryScore): number | null {
  if (cat.current == null || cat.total == null || cat.total <= 0) return null
  return Math.min(100, (cat.current / cat.total) * 100)
}

/** Returns true when both ranks are null, indicating a private character. */
export function isPrivateRanking(globalRank: number | null, serverRank: number | null): boolean {
  return globalRank == null && serverRank == null
}
