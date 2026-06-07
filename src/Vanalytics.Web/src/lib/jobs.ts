// The 22 real FFXI jobs as 3-letter codes, in canonical job order.
// Single client-side source of truth; mirrors the backend Vanalytics.Core.Enums.JobType.
export const FFXI_JOBS = [
  'WAR', 'MNK', 'WHM', 'BLM', 'RDM', 'THF',
  'PLD', 'DRK', 'BST', 'BRD', 'RNG', 'SAM',
  'NIN', 'DRG', 'SMN', 'BLU', 'COR', 'PUP',
  'DNC', 'SCH', 'GEO', 'RUN',
] as const

export type FfxiJob = typeof FFXI_JOBS[number]

// Job bitmask matching the backend GameItem.Jobs convention: bit 0 unused, WAR=1<<1 … RUN=1<<22.
// Since FFXI_JOBS is in canonical order, the bit is simply (index + 1). Returns 0 for unknown jobs.
export function jobBitmask(job: string): number {
  const i = (FFXI_JOBS as readonly string[]).indexOf(job)
  return i < 0 ? 0 : 1 << (i + 1)
}
