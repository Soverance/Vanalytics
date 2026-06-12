import type { GearSetSummary } from '../../types/api'
import { FFXI_JOBS } from '../../lib/jobs'
import { CATEGORY_ORDER, categoryLabel } from '../../lib/gearSetCategories'

export const UNASSIGNED_JOB = '__unassigned__'
export const ROW_CAP = 50

export type SortKey = 'name' | 'updated' | 'slots'

export interface CategoryNode { category: string; label: string; count: number }
export interface JobNode { job: string; label: string; count: number; categories: CategoryNode[] }

export interface FilterState {
  job: string | null       // null = all jobs
  category: string | null  // null = all categories within the job selection
  search: string
  tags: string[]           // AND across selected tags
  sort: SortKey
}

const jobKey = (s: GearSetSummary): string => s.job ?? UNASSIGNED_JOB
const jobLabel = (key: string): string => (key === UNASSIGNED_JOB ? 'Unassigned' : key)

// Real jobs in canonical FFXI order; Unassigned (and any unknown) sort last.
const jobRank = (key: string): number => {
  if (key === UNASSIGNED_JOB) return FFXI_JOBS.length
  const i = (FFXI_JOBS as readonly string[]).indexOf(key)
  return i < 0 ? FFXI_JOBS.length + 1 : i
}
const categoryRank = (cat: string): number => {
  const i = CATEGORY_ORDER.indexOf(cat)
  return i < 0 ? CATEGORY_ORDER.length : i
}

export function buildTree(sets: GearSetSummary[]): JobNode[] {
  const byJob = new Map<string, GearSetSummary[]>()
  for (const s of sets) {
    const k = jobKey(s)
    const arr = byJob.get(k) ?? []
    arr.push(s)
    byJob.set(k, arr)
  }
  const nodes: JobNode[] = []
  for (const [job, jobSets] of byJob) {
    const byCat = new Map<string, number>()
    for (const s of jobSets) byCat.set(s.category, (byCat.get(s.category) ?? 0) + 1)
    const categories: CategoryNode[] = [...byCat.entries()]
      .map(([category, count]) => ({ category, label: categoryLabel(category), count }))
      .sort((a, b) => categoryRank(a.category) - categoryRank(b.category))
    nodes.push({ job, label: jobLabel(job), count: jobSets.length, categories })
  }
  return nodes.sort((a, b) => jobRank(a.job) - jobRank(b.job))
}

export function distinctTags(sets: GearSetSummary[]): string[] {
  const seen = new Map<string, string>() // lowercase -> first-seen casing
  for (const s of sets)
    for (const t of s.tags) {
      const key = t.toLowerCase()
      if (!seen.has(key)) seen.set(key, t)
    }
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}

function sortSets(rows: GearSetSummary[], sort: SortKey): GearSetSummary[] {
  const copy = [...rows]
  switch (sort) {
    // updatedAt is an ISO-8601 UTC string, so lexicographic compare == chronological.
    case 'updated': copy.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); break
    case 'slots': copy.sort((a, b) => b.slotCount - a.slotCount); break
    case 'name':
    default: copy.sort((a, b) => a.name.localeCompare(b.name)); break
  }
  return copy
}

export function filterSets(sets: GearSetSummary[], state: FilterState): GearSetSummary[] {
  const q = state.search.trim().toLowerCase()
  const tagFilters = state.tags.map(t => t.toLowerCase())
  const rows = sets.filter(s => {
    if (state.job != null && jobKey(s) !== state.job) return false
    if (state.category != null && s.category !== state.category) return false
    if (tagFilters.length) {
      const lower = s.tags.map(t => t.toLowerCase())
      if (!tagFilters.every(t => lower.includes(t))) return false
    }
    if (q) {
      const inName = s.name.toLowerCase().includes(q)
      const inTags = s.tags.some(t => t.toLowerCase().includes(q))
      if (!inName && !inTags) return false
    }
    return true
  })
  return sortSets(rows, state.sort)
}

export function visibleSlice<T>(rows: T[], expanded: boolean): { shown: T[]; hiddenCount: number } {
  if (expanded || rows.length <= ROW_CAP) return { shown: rows, hiddenCount: 0 }
  return { shown: rows.slice(0, ROW_CAP), hiddenCount: rows.length - ROW_CAP }
}
