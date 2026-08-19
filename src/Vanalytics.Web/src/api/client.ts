const TOKEN_KEY = 'vanalytics_access_token'
const REFRESH_KEY = 'vanalytics_refresh_token'

export function getStoredTokens() {
  return {
    accessToken: localStorage.getItem(TOKEN_KEY),
    refreshToken: localStorage.getItem(REFRESH_KEY),
  }
}

export function storeTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(TOKEN_KEY, accessToken)
  localStorage.setItem(REFRESH_KEY, refreshToken)
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

// The server rotates refresh tokens, so concurrent /api/auth/refresh calls
// with the same token cause the loser to be logged out. Serialize refresh
// attempts across tabs via the Web Locks API, falling back to a same-tab
// mutex for browsers without it.
const REFRESH_LOCK_NAME = 'vanalytics-token-refresh'
let inFlightRefresh: Promise<string | null> | null = null

async function performRefresh(): Promise<string | null> {
  const { refreshToken } = getStoredTokens()
  if (!refreshToken) return null

  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })

    if (!res.ok) {
      clearTokens()
      return null
    }

    const data = await res.json()
    storeTokens(data.accessToken, data.refreshToken)
    return data.accessToken
  } catch {
    clearTokens()
    return null
  }
}

async function refreshAccessToken(): Promise<string | null> {
  // Snapshot the token we saw before any serialization — once we're through
  // the lock, a different current token means another holder already did the
  // work and we should reuse their result.
  const initial = getStoredTokens().accessToken

  const attempt = async (): Promise<string | null> => {
    const current = getStoredTokens().accessToken
    if (current && current !== initial) return current
    return performRefresh()
  }

  if ('locks' in navigator) {
    return navigator.locks.request(REFRESH_LOCK_NAME, attempt)
  }

  if (inFlightRefresh) return inFlightRefresh
  inFlightRefresh = attempt().finally(() => {
    inFlightRefresh = null
  })
  return inFlightRefresh
}

// If another request already refreshed while we were waiting on our initial
// response, the new token is sitting in localStorage — use it instead of
// kicking off a fresh refresh (which would present the now-revoked token).
async function resolveRefreshedToken(usedToken: string): Promise<string | null> {
  const current = getStoredTokens().accessToken
  if (current && current !== usedToken) return current
  return refreshAccessToken()
}

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const { accessToken } = getStoredTokens()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }

  let res = await fetch(path, { ...options, headers })

  if (res.status === 401 && accessToken) {
    const newToken = await resolveRefreshedToken(accessToken)
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`
      res = await fetch(path, { ...options, headers })
    }
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }))
    // Endpoints use both { message } (dominant) and { error } shapes; surface either.
    throw new ApiError(res.status, error.message ?? error.error ?? 'Request failed')
  }

  if (res.status === 204) return undefined as T

  const text = await res.text()
  if (!text) return undefined as T

  return JSON.parse(text)
}

export async function uploadFile<T>(
  path: string,
  file: File
): Promise<T> {
  const { accessToken } = getStoredTokens()

  const headers: Record<string, string> = {}
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }

  const formData = new FormData()
  formData.append('file', file)

  let res = await fetch(path, { method: 'POST', headers, body: formData })

  if (res.status === 401 && accessToken) {
    const newToken = await resolveRefreshedToken(accessToken)
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`
      res = await fetch(path, { method: 'POST', headers, body: formData })
    }
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }))
    throw new ApiError(res.status, error.message ?? 'Upload failed')
  }

  return res.json()
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

// Achievement / Leaderboard API helpers
import type {
  LeaderboardPage,
  CharacterLeaderboardEntry,
  LinkshellLeaderboardEntry,
  RubricResponse,
  CharacterAchievementResponse,
  LinkshellAchievementResponse,
  AchievementAdminStatus,
  AchievementRescoreStatus,
  AggregateInventoryResponse,
  AnalyticsSummary,
  ServerComparisonEntry,
  JobPopularityEntry,
  UltimateWeaponRarityEntry,
  ServerMetric,
  JobMode,
} from '../types/api'

export function getCharacterLeaderboard(
  server?: string,
  page = 1,
  pageSize = 50
): Promise<LeaderboardPage<CharacterLeaderboardEntry>> {
  const params = new URLSearchParams({
    ...(server ? { server } : {}),
    page: String(page),
    pageSize: String(pageSize),
  })
  return api<LeaderboardPage<CharacterLeaderboardEntry>>(`/api/leaderboards/characters?${params}`)
}

export function getLinkshellLeaderboard(
  server?: string,
  sort = 'total',
  page = 1,
  pageSize = 50
): Promise<LeaderboardPage<LinkshellLeaderboardEntry>> {
  const params = new URLSearchParams({
    ...(server ? { server } : {}),
    sort,
    page: String(page),
    pageSize: String(pageSize),
  })
  return api<LeaderboardPage<LinkshellLeaderboardEntry>>(`/api/leaderboards/linkshells?${params}`)
}

export function getRubric(): Promise<RubricResponse> {
  return api<RubricResponse>('/api/achievements/rubric')
}

export function getCharacterAchievement(id: string): Promise<CharacterAchievementResponse> {
  return api<CharacterAchievementResponse>(`/api/characters/${id}/achievement`)
}

export function getLinkshellAchievement(id: string): Promise<LinkshellAchievementResponse> {
  return api<LinkshellAchievementResponse>(`/api/linkshells/${id}/achievement`)
}

export function getAchievementAdminStatus(): Promise<AchievementAdminStatus> {
  return api<AchievementAdminStatus>('/api/admin/achievements/status')
}

export async function startRescore(): Promise<{ started: boolean; alreadyRunning: boolean }> {
  try {
    await api<{ started: boolean }>('/api/admin/achievements/rescore', { method: 'POST' })
    return { started: true, alreadyRunning: false }
  } catch (err) {
    // A run already in progress returns 409 — not an error; the caller just polls.
    if (err instanceof ApiError && err.status === 409) {
      return { started: false, alreadyRunning: true }
    }
    throw err
  }
}

export function getRescoreStatus(): Promise<AchievementRescoreStatus> {
  return api<AchievementRescoreStatus>('/api/admin/achievements/rescore-status')
}

export function getAggregateInventory(world?: string): Promise<AggregateInventoryResponse> {
  const qs = world ? `?world=${encodeURIComponent(world)}` : ''
  return api<AggregateInventoryResponse>(`/api/characters/inventory/aggregate${qs}`)
}

// Analytics API helpers
export function getAnalyticsSummary(server?: string): Promise<AnalyticsSummary> {
  const params = new URLSearchParams(server ? { server } : {})
  return api<AnalyticsSummary>(`/api/analytics/summary?${params}`)
}

export function getServerComparison(metric: ServerMetric): Promise<ServerComparisonEntry[]> {
  return api<ServerComparisonEntry[]>(`/api/analytics/servers?metric=${metric}`)
}

export function getJobPopularity(server: string | undefined, mode: JobMode): Promise<JobPopularityEntry[]> {
  const params = new URLSearchParams({ ...(server ? { server } : {}), mode })
  return api<JobPopularityEntry[]>(`/api/analytics/jobs?${params}`)
}

export function getUltimateWeaponRarity(server?: string): Promise<UltimateWeaponRarityEntry[]> {
  const params = new URLSearchParams(server ? { server } : {})
  return api<UltimateWeaponRarityEntry[]>(`/api/analytics/ultimate-weapons?${params}`)
}
