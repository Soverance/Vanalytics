import { useState, useEffect, useCallback } from 'react'
import { api, getStoredTokens } from '../api/client'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ItemDbStats {
  items: {
    total: number
    withIcons: number
    withPreviews: number
    withDescriptions: number
    missingIcons: number
    missingPreviews: number
    iconCoverage: number
    categories: { category: string; count: number }[]
  }
  economy: {
    totalAhSales: number
    totalBazaarListings: number
    activeBazaarListings: number
    activeBazaarPresences: number
  }
}

interface SyncProviderStatus {
  providerId: string
  displayName: string
  isRunning: boolean
  metadata?: {
    storageType: string
    label: string
  }
  lastSync: {
    startedAt: string
    completedAt: string | null
    status: string
    itemsAdded: number
    itemsUpdated: number
    itemsSkipped: number
    itemsFailed: number
    totalItems: number
    errorMessage: string | null
  } | null
}

interface SyncProgress {
  providerId: string
  type: string
  message?: string
  currentItem?: string
  currentItemId?: number
  current: number
  total: number
  added: number
  updated: number
  skipped: number
  failed: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = Date.now()
  const diff = now - d.getTime()
  const mins = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString()
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-200">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      {sub && <p className="text-xs text-gray-600 mt-1">{sub}</p>}
    </div>
  )
}

// ─── SyncCard ─────────────────────────────────────────────────────────────────

function SyncCard({
  provider,
  onRefresh,
}: {
  provider: SyncProviderStatus
  onRefresh: () => void
}) {
  const [progress, setProgress] = useState<SyncProgress | null>(null)
  const [running, setRunning] = useState(provider.isRunning)
  const [error, setError] = useState('')

  // Keep running state in sync with provider prop (status refresh)
  useEffect(() => {
    if (!provider.isRunning) {
      setRunning(false)
    }
  }, [provider.isRunning])

  const startStream = useCallback(async (providerId: string) => {
    const { accessToken } = getStoredTokens()
    try {
      const response = await fetch(`/api/admin/sync/${providerId}/progress`, {
        headers: { Authorization: `Bearer ${accessToken ?? ''}` },
      })

      if (!response.ok || !response.body) {
        throw new Error(`Stream failed: ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const blocks = buffer.split('\n\n')
        buffer = blocks.pop()!
        for (const block of blocks) {
          const dataMatch = block.match(/^data: (.+)$/m)
          if (dataMatch) {
            const evt: SyncProgress = JSON.parse(dataMatch[1])
            setProgress(evt)
            if (evt.type === 'Completed' || evt.type === 'Cancelled' || evt.type === 'Failed') {
              setRunning(false)
              onRefresh()
            }
          }
        }
      }

      // Stream ended cleanly without a terminal event — refresh anyway
      setRunning(false)
      onRefresh()
    } catch {
      // Fall back to polling
      setError('Stream unavailable — polling for status')
      const interval = setInterval(() => {
        api<SyncProviderStatus[]>('/api/admin/sync/status')
          .then((statuses) => {
            const updated = statuses.find((s) => s.providerId === providerId)
            if (updated && !updated.isRunning) {
              clearInterval(interval)
              setRunning(false)
              setError('')
              onRefresh()
            }
          })
          .catch(() => {
            // keep polling silently
          })
      }, 5_000)
    }
  }, [onRefresh])

  const handleSyncNow = async () => {
    setError('')
    setProgress(null)
    try {
      await api(`/api/admin/sync/${provider.providerId}/start`, { method: 'POST' })
      setRunning(true)
      await startStream(provider.providerId)
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 409) {
        setError('A sync is already running for this provider.')
        // Still open the stream to show progress
        setRunning(true)
        await startStream(provider.providerId)
      } else {
        setError('Failed to start sync.')
      }
    }
  }

  const handleCancel = async () => {
    try {
      await api(`/api/admin/sync/${provider.providerId}/cancel`, { method: 'POST' })
    } catch {
      setError('Failed to send cancel request.')
    }
  }

  const pct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : 0

  const lastSync = provider.lastSync

  return (
    <div
      className={`rounded-lg border bg-gray-900 p-5 transition-colors ${
        running ? 'border-blue-600' : 'border-gray-800'
      }`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-base font-semibold text-gray-200">{provider.displayName}</h3>
          {lastSync ? (
            <p className="text-xs text-gray-500 mt-0.5">
              Last sync: {formatDate(lastSync.startedAt)}
              {lastSync.totalItems > 0 && ` · ${lastSync.totalItems.toLocaleString()} items`}
            </p>
          ) : (
            <p className="text-xs text-gray-500 mt-0.5">Never synced</p>
          )}
          {provider.metadata && (
            <p className="text-xs mt-0.5">
              <span className="text-gray-500">Storage: </span>
              <span className={provider.metadata.storageType === 'azure' ? 'text-blue-400' : 'text-amber-400'}>
                {provider.metadata.label}
              </span>
            </p>
          )}
        </div>

        {running ? (
          <button
            onClick={handleCancel}
            className="px-3 py-1.5 text-sm rounded bg-red-600 hover:bg-red-700 text-white transition-colors"
          >
            Cancel
          </button>
        ) : (
          <button
            onClick={handleSyncNow}
            className="px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            Sync Now
          </button>
        )}
      </div>

      {/* Running state */}
      {running && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-blue-400 text-sm animate-pulse">● Syncing…</span>
            {progress && progress.total > 0 && (
              <span className="text-xs text-gray-500">
                {progress.current.toLocaleString()} / {progress.total.toLocaleString()} ({pct}%)
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* Current item */}
          {progress?.currentItem && (
            <p className="text-xs text-gray-400 truncate">
              Processing: <span className="text-gray-300">{progress.currentItem}</span>
              {progress.currentItemId !== undefined && (
                <span className="text-gray-600"> (#{progress.currentItemId})</span>
              )}
            </p>
          )}

          {progress?.message && !progress.currentItem && (
            <p className="text-xs text-gray-400">{progress.message}</p>
          )}

          {/* Running counters */}
          {progress && (
            <div className="flex gap-4 text-xs">
              <span className="text-green-400">+{progress.added.toLocaleString()} added</span>
              <span className="text-blue-400">{progress.updated.toLocaleString()} updated</span>
              <span className="text-gray-400">{progress.skipped.toLocaleString()} skipped</span>
              {progress.failed > 0 && (
                <span className="text-red-400">{progress.failed.toLocaleString()} failed</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Completed summary (progress present, not running) */}
      {!running && progress && (progress.type === 'Completed' || progress.type === 'Failed') && (
        <div className="mt-2 text-xs flex gap-4">
          <span className="text-green-400">+{progress.added.toLocaleString()} added</span>
          <span className="text-blue-400">{progress.updated.toLocaleString()} updated</span>
          <span className="text-gray-400">{progress.skipped.toLocaleString()} skipped</span>
          {progress.failed > 0 && (
            <span className="text-red-400">{progress.failed.toLocaleString()} failed</span>
          )}
        </div>
      )}

      {/* Last sync summary (no progress yet, idle) */}
      {!running && !progress && lastSync && (
        <div className="mt-1 text-xs flex gap-4">
          <span className="text-green-400">+{lastSync.itemsAdded.toLocaleString()} added</span>
          <span className="text-blue-400">{lastSync.itemsUpdated.toLocaleString()} updated</span>
          <span className="text-gray-400">{lastSync.itemsSkipped.toLocaleString()} skipped</span>
          {lastSync.itemsFailed > 0 && (
            <span className="text-red-400">{lastSync.itemsFailed.toLocaleString()} failed</span>
          )}
          {lastSync.errorMessage && (
            <span className="text-red-400 ml-2 truncate">{lastSync.errorMessage}</span>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-yellow-400">{error}</p>}
    </div>
  )
}

// ─── SyncSection ──────────────────────────────────────────────────────────────

function SyncSection() {
  const [statuses, setStatuses] = useState<SyncProviderStatus[]>([])
  const [loadingSync, setLoadingSync] = useState(true)
  const [syncError, setSyncError] = useState('')

  const fetchStatuses = useCallback(() => {
    api<SyncProviderStatus[]>('/api/admin/sync/status')
      .then(setStatuses)
      .catch(() => setSyncError('Failed to load sync status'))
      .finally(() => setLoadingSync(false))
  }, [])

  useEffect(() => {
    fetchStatuses()
  }, [fetchStatuses])

  return (
    <div className="mb-8">
      <h2 className="text-xl font-bold mb-4">Data Synchronization</h2>

      {loadingSync && <p className="text-gray-400 text-sm">Loading sync status…</p>}
      {syncError && <p className="text-red-400 text-sm">{syncError}</p>}

      {!loadingSync && !syncError && statuses.length === 0 && (
        <p className="text-gray-500 text-sm">No sync providers available.</p>
      )}

      {statuses.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {statuses.map((provider) => (
            <SyncCard key={provider.providerId} provider={provider} onRefresh={fetchStatuses} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminItemsPage() {
  const [stats, setStats] = useState<ItemDbStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api<ItemDbStats>('/api/admin/items/stats')
      .then(setStats)
      .catch(() => setError('Failed to load item database stats'))
      .finally(() => setLoading(false))
  }, [])

  const { items, economy } = stats ?? { items: null, economy: null }

  return (
    <div>
      {/* ── Sync section (always visible) ── */}
      <SyncSection />

      <hr className="border-gray-800 mb-8" />

      {/* ── Item Database Health ── */}
      <h1 className="text-2xl font-bold mb-6">Item Database Health</h1>

      {loading && <p className="text-gray-400">Loading item database stats…</p>}
      {error && <p className="text-red-400">{error}</p>}

      {items && economy && (
        <>
          {/* Item stats */}
          <h2 className="text-lg font-semibold mb-3">Items</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatCard label="Total Items" value={items.total} />
            <StatCard label="Icon Coverage" value={`${items.iconCoverage}%`} sub={`${items.withIcons} of ${items.total}`} />
            <StatCard label="Missing Icons" value={items.missingIcons} />
            <StatCard label="With Descriptions" value={items.withDescriptions} />
          </div>

          {/* Economy stats */}
          <h2 className="text-lg font-semibold mb-3">Economy Data</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatCard label="AH Transactions" value={economy.totalAhSales} />
            <StatCard label="Bazaar Listings (Total)" value={economy.totalBazaarListings} />
            <StatCard label="Bazaar Listings (Active)" value={economy.activeBazaarListings} />
            <StatCard label="Bazaar Presences (Active)" value={economy.activeBazaarPresences} />
          </div>

          {/* Categories breakdown */}
          <h2 className="text-lg font-semibold mb-3">Categories</h2>
          <div className="rounded-lg border border-gray-800 bg-gray-900 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-800/50 text-left text-gray-500">
                  <th className="px-4 py-2.5 font-medium">Category</th>
                  <th className="px-4 py-2.5 font-medium text-right">Items</th>
                  <th className="px-4 py-2.5 font-medium">Distribution</th>
                </tr>
              </thead>
              <tbody>
                {items.categories.map((c) => {
                  const pct = items.total > 0 ? (c.count / items.total) * 100 : 0
                  return (
                    <tr key={c.category} className="border-t border-gray-800">
                      <td className="px-4 py-2 text-gray-300">{c.category}</td>
                      <td className="px-4 py-2 text-gray-400 text-right">{c.count.toLocaleString()}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-gray-800 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-blue-600"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 w-10 text-right">{pct.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
