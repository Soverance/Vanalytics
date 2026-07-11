import type { AdminUser, UserRole } from '../types/api'
import { authTypeOf } from './adminUsers'

const DAY_MS = 86_400_000

export type Bucket = 'week' | 'month'
export interface SignupPoint { period: string; created: number; cumulative: number }
export interface CategoryCount { key: string; label: string; count: number }

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function weekKey(d: Date): string {
  // ISO week start (Monday), in UTC, as a YYYY-MM-DD label.
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = date.getUTCDay() || 7 // Sunday(0) -> 7
  date.setUTCDate(date.getUTCDate() - day + 1)
  return date.toISOString().slice(0, 10)
}

export function signupSeries(users: AdminUser[], bucket: Bucket): SignupPoint[] {
  const keyOf = bucket === 'month' ? monthKey : weekKey
  const counts = new Map<string, number>()
  for (const u of users) {
    const k = keyOf(new Date(u.createdAt))
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  let cumulative = 0
  return [...counts.keys()].sort().map((period) => {
    const created = counts.get(period)!
    cumulative += created
    return { period, created, cumulative }
  })
}

export function activityBreakdown(users: AdminUser[], now: Date): CategoryCount[] {
  const b = { active7: 0, active30: 0, active90: 0, dormant: 0, never: 0 }
  for (const u of users) {
    if (!u.lastActiveAt) { b.never++; continue }
    const days = (now.getTime() - new Date(u.lastActiveAt).getTime()) / DAY_MS
    if (days <= 7) b.active7++
    else if (days <= 30) b.active30++
    else if (days <= 90) b.active90++
    else b.dormant++
  }
  return [
    { key: 'active7', label: 'Active ≤7d', count: b.active7 },
    { key: 'active30', label: '8–30d', count: b.active30 },
    { key: 'active90', label: '31–90d', count: b.active90 },
    { key: 'dormant', label: 'Dormant >90d', count: b.dormant },
    { key: 'never', label: 'Never synced', count: b.never },
  ]
}

const AUTH_LABELS: Record<string, string> = {
  local: 'Local', google: 'Google', microsoft: 'Microsoft', discord: 'Discord',
}

export function authBreakdown(users: AdminUser[]): CategoryCount[] {
  const counts = new Map<string, number>()
  for (const u of users) {
    const k = authTypeOf(u)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: AUTH_LABELS[key] ?? key, count }))
    .sort((a, b) => b.count - a.count)
}

export function roleBreakdown(users: AdminUser[]): CategoryCount[] {
  const order: UserRole[] = ['Member', 'Moderator', 'Admin']
  return order
    .map((r) => ({ key: r, label: r, count: users.filter((u) => u.role === r).length }))
    .filter((c) => c.count > 0)
}

export function characterHistogram(users: AdminUser[]): CategoryCount[] {
  const bins = ['0', '1', '2', '3', '4', '5+']
  const counts: Record<string, number> = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5+': 0 }
  for (const u of users) {
    const key = u.characterCount >= 5 ? '5+' : String(u.characterCount)
    counts[key]++
  }
  return bins.map((b) => ({ key: b, label: b, count: counts[b] }))
}

export function topServers(users: AdminUser[], limit = 8): CategoryCount[] {
  const counts = new Map<string, number>()
  for (const u of users) {
    if (!u.defaultServer) continue
    counts.set(u.defaultServer, (counts.get(u.defaultServer) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

export interface UserSummary {
  total: number
  active30: number
  newThisMonth: number
  avgCharacters: number
}

export function userSummary(users: AdminUser[], now: Date): UserSummary {
  const nowMonth = monthKey(now)
  let active30 = 0
  let newThisMonth = 0
  let totalChars = 0
  for (const u of users) {
    if (u.lastActiveAt && (now.getTime() - new Date(u.lastActiveAt).getTime()) / DAY_MS <= 30) active30++
    if (monthKey(new Date(u.createdAt)) === nowMonth) newThisMonth++
    totalChars += u.characterCount
  }
  return {
    total: users.length,
    active30,
    newThisMonth,
    avgCharacters: users.length ? totalChars / users.length : 0,
  }
}
